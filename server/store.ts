// SQLite persistence (Node's built-in node:sqlite, no native dependency).
// Cases and pills are JSON documents; the audit log is append-only rows.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { seedPills, type AuditEvent, type Case, type Pill } from '../shared/flow.ts';

export type Store = ReturnType<typeof openStore>;

export function openStore(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  const schema = () => db.exec(`
    create table if not exists docs (kind text not null, id text not null, json text not null, primary key (kind, id));
    create table if not exists audit (seq integer primary key autoincrement, at text, actor text, role text, action text, target text, detail text);
    create trigger if not exists audit_no_update before update on audit begin select raise(abort, 'audit log is append-only'); end;
    create trigger if not exists audit_no_delete before delete on audit begin select raise(abort, 'audit log is append-only'); end;
  `);
  schema();

  const all = <T>(kind: string) =>
    (db.prepare('select json from docs where kind = ? order by id').all(kind) as { json: string }[]).map((r) => JSON.parse(r.json) as T);
  const put = (kind: string, id: string, doc: unknown) =>
    db.prepare('insert into docs (kind, id, json) values (?, ?, ?) on conflict (kind, id) do update set json = excluded.json').run(kind, id, JSON.stringify(doc));

  const store = {
    // Older rows predate comments and tuning; fill the defaults so every reader sees one shape.
    cases: () => all<Case>('case').map((c) => ({ ...c, tuning: c.tuning ?? {}, comments: c.comments ?? [] })),
    pills: () => all<Pill>('pill'),
    audit: (limit = 300) =>
      db.prepare('select * from audit order by seq desc limit ?').all(limit) as unknown as AuditEvent[],
    putCase: (c: Case) => put('case', c.id, c),
    putPill: (p: Pill) => put('pill', p.id, p),
    log: (e: Omit<AuditEvent, 'seq'>) =>
      db.prepare('insert into audit (at, actor, role, action, target, detail) values (?, ?, ?, ?, ?, ?)')
        .run(e.at, e.actor, e.role, e.action, e.target, e.detail),
    nextCaseId: () => `CASE-${String(store.cases().length + 1).padStart(4, '0')}`,
    /** Run several writes as one unit. */
    tx<T>(fn: () => T): T {
      db.exec('begin');
      try { const out = fn(); db.exec('commit'); return out; } catch (e) { db.exec('rollback'); throw e; }
    },
    /** Demo reset: the only path that clears the audit log (it recreates the table), and the new log says so. */
    reset(now: string, by: string) {
      store.tx(() => {
        db.exec("delete from docs where kind in ('case', 'pill'); drop table audit;");
        schema();
        for (const p of seedPills()) store.putPill(p);
        store.log({ at: now, actor: by, role: 'system', action: 'reset', target: 'demo', detail: 'Demo data reset. Pill library reseeded.' });
      });
    },
  };

  if (store.pills().length === 0) {
    store.tx(() => {
      for (const p of seedPills()) store.putPill(p);
      store.log({ at: new Date().toISOString(), actor: 'system', role: 'system', action: 'seed', target: 'library', detail: 'Pill library seeded with 5 synthetic pills.' });
    });
  }
  return store;
}
