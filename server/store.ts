// SQLite persistence (Node's built-in node:sqlite, no native dependency).
// Cases and pills are JSON documents; the audit log is append-only rows.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { seedPills, type AuditEvent, type Case, type Pill, type Profile } from '../shared/flow.ts';
import { chunkPill } from './chunker.ts';
import { generatePillPdf } from './pdf.ts';

export type Store = ReturnType<typeof openStore>;

export function openStore(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  const schema = () => db.exec(`
    create table if not exists docs (kind text not null, id text not null, json text not null, primary key (kind, id));
    create table if not exists audit (seq integer primary key autoincrement, at text, actor text, role text, action text, target text, detail text);
    create trigger if not exists audit_no_update before update on audit begin select raise(abort, 'audit log is append-only'); end;
    create trigger if not exists audit_no_delete before delete on audit begin select raise(abort, 'audit log is append-only'); end;
    create table if not exists chunks (id text not null, pill_id text not null, section text not null, ordinal int not null, text text not null, primary key (pill_id, section, ordinal));
    create table if not exists pdf_store (pill_id text primary key, pdf blob not null, at text not null);
  `);
  const ensureFts = () => db.exec(`
    create virtual table if not exists chunks_fts using fts5(pill_id unindexed, chunk_id unindexed, text, tokenize = 'porter unicode61');
  `);
  schema();
  ensureFts();

  const all = <T>(kind: string) =>
    (db.prepare('select json from docs where kind = ? order by id').all(kind) as { json: string }[]).map((r) => JSON.parse(r.json) as T);
  const put = (kind: string, id: string, doc: unknown) =>
    db.prepare('insert into docs (kind, id, json) values (?, ?, ?) on conflict (kind, id) do update set json = excluded.json').run(kind, id, JSON.stringify(doc));

  const store = {
    // Older rows predate comments and tuning; fill the defaults so every reader sees one shape.
    cases: () => all<Case>('case').map((c) => ({ ...c, tuning: c.tuning ?? {}, own: c.own ?? [], comments: c.comments ?? [] })),
    pills: () => all<Pill>('pill'),
    audit: (limit = 300) =>
      db.prepare('select * from audit order by seq desc limit ?').all(limit) as unknown as AuditEvent[],
    putCase: (c: Case) => put('case', c.id, c),
    putPill: (p: Pill) => put('pill', p.id, p),
    /** Profiles survive a demo reset: they are people's settings, not demo data. */
    profile: (id: string) => {
      const row = db.prepare("select json from docs where kind = 'profile' and id = ?").get(id) as { json: string } | undefined;
      return row ? (JSON.parse(row.json) as Partial<Profile>) : {};
    },
    putProfile: (id: string, p: Profile) => put('profile', id, p),
    log: (e: Omit<AuditEvent, 'seq'>) =>
      db.prepare('insert into audit (at, actor, role, action, target, detail) values (?, ?, ?, ?, ?, ?)')
        .run(e.at, e.actor, e.role, e.action, e.target, e.detail),
    nextCaseId: () => `CASE-${String(store.cases().length + 1).padStart(4, '0')}`,
    /** Replace all chunks for a pill (called on approval / re-approval). */
    putChunks: (pillId: string, chunks: { id: string; section: string; ordinal: number; text: string }[]) => {
      db.prepare('delete from chunks where pill_id = ?').run(pillId);
      db.prepare('delete from chunks_fts where pill_id = ?').run(pillId);
      const ins = db.prepare('insert into chunks (id, pill_id, section, ordinal, text) values (?, ?, ?, ?, ?)');
      const insFts = db.prepare('insert into chunks_fts (pill_id, chunk_id, text) values (?, ?, ?)');
      for (const c of chunks) {
        ins.run(c.id, pillId, c.section, c.ordinal, c.text);
        insFts.run(pillId, c.id, c.text);
      }
    },
    /** Full-text search over all pill chunks. Returns ranked rows (best first). */
    searchFts: (query: string, limit = 20) =>
      db.prepare(`
        select c.id, c.pill_id, c.section, c.ordinal, c.text, f.rank as score
        from chunks_fts f
        join chunks c on c.id = f.chunk_id and c.pill_id = f.pill_id
        where chunks_fts match ?
        order by f.rank
        limit ?
      `).all(query, limit) as { id: string; pill_id: string; section: string; ordinal: number; text: string; score: number }[],
    /** Store a generated PDF blob for a pill. */
    putPdf: (pillId: string, pdf: Uint8Array, at: string) =>
      db.prepare('insert into pdf_store (pill_id, pdf, at) values (?, ?, ?) on conflict (pill_id) do update set pdf = excluded.pdf, at = excluded.at')
        .run(pillId, pdf, at),
    /** Retrieve a stored PDF blob, or null if not yet generated. */
    getPdf: (pillId: string) => {
      const row = db.prepare('select pdf, at from pdf_store where pill_id = ?').get(pillId) as { pdf: Uint8Array; at: string } | undefined;
      return row ?? null;
    },
    /** Run several writes as one unit. */
    tx<T>(fn: () => T): T {
      db.exec('begin');
      try { const out = fn(); db.exec('commit'); return out; } catch (e) { db.exec('rollback'); throw e; }
    },
    /** Demo reset: the only path that clears the audit log (it recreates the table), and the new log says so. */
    reset(now: string, by: string) {
      store.tx(() => {
        db.exec("delete from docs where kind in ('case', 'pill'); drop table audit; delete from chunks; delete from chunks_fts; delete from pdf_store;");
        schema();
        ensureFts();
        for (const p of seedPills()) { store.putPill(p); store.putChunks(p.id, chunkPill(p)); }
        store.log({ at: now, actor: by, role: 'system', action: 'reset', target: 'demo', detail: 'Demo data reset. Pill library reseeded.' });
      });
    },
  };

  if (store.pills().length === 0) {
    store.tx(() => {
      for (const p of seedPills()) {
        store.putPill(p);
        store.putChunks(p.id, chunkPill(p));
      }
      store.log({ at: new Date().toISOString(), actor: 'system', role: 'system', action: 'seed', target: 'library', detail: 'Pill library seeded with 5 synthetic pills.' });
    });
  }
  return store;
}

/** Generate PDFs for any seeded pills that don't have one yet. Idempotent. */
export async function ensureSeedPdfs(store: Store): Promise<void> {
  const missing = store.pills().filter((p) => !store.getPdf(p.id));
  for (const p of missing) {
    const pdf = await generatePillPdf(p);
    store.putPdf(p.id, pdf, new Date().toISOString());
  }
  if (missing.length) {
    store.log({ at: new Date().toISOString(), actor: 'system', role: 'system', action: 'seed', target: 'pdfs', detail: `Generated ${missing.length} seed PDFs.` });
  }
}
