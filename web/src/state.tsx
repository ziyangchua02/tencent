import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { userById, type Action, type AppState, type Case, type User } from '../../shared/flow.ts';

type ServerState = AppState & { users: User[] };
type Sync = 'connecting' | 'live' | 'offline';

const USER_KEY = 'ip.user';
// Per-window sign-in, so one window can be the engineer and another the manager.
const session = {
  get: () => { try { return sessionStorage.getItem(USER_KEY); } catch { return null; } },
  set: (v: string | null) => { try { if (v) sessionStorage.setItem(USER_KEY, v); else sessionStorage.removeItem(USER_KEY); } catch { /* private mode */ } },
};

// ---------- router: a path, a query string, pushState ----------

const subscribe = (cb: () => void) => { addEventListener('popstate', cb); return () => removeEventListener('popstate', cb); };
const href = () => location.pathname + location.search;

/** The current path and query. useSyncExternalStore re-reads after subscribing, so a redirect fired by a child is never missed. */
export function useLocation() {
  const current = useSyncExternalStore(subscribe, href);
  return useMemo(() => {
    const u = new URL(current, 'http://local');
    return { path: u.pathname, query: u.searchParams };
  }, [current]);
}

export function go(to: string, { replace = false } = {}) {
  if (to === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', to);
  dispatchEvent(new PopStateEvent('popstate'));
  if (!replace) scrollTo({ top: 0 });
}

export function Link({ to, children, className, ...rest }: { to: string; children: ReactNode; className?: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const current = location.pathname === to;
  return (
    <a
      {...rest}
      href={to}
      className={className}
      aria-current={current ? 'page' : undefined}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        go(to);
      }}
    >
      {children}
    </a>
  );
}

// ---------- app state ----------

interface Ctx {
  state: ServerState | null;
  sync: Sync;
  pending: number;
  user: User | null;
  signIn: (id: string | null) => void;
  error: string | null;
  dismissError: () => void;
  post: (path: string, body?: unknown) => Promise<{ ok: boolean; data?: Record<string, unknown> }>;
  act: (caseId: string, action: Action, optimistic?: (c: Case) => Case) => Promise<boolean>;
}

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ServerState | null>(null);
  const [sync, setSync] = useState<Sync>('connecting');
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(() => {
    const as = new URLSearchParams(location.search).get('as');
    if (as && userById(as)) {
      session.set(as);
      const q = new URLSearchParams(location.search);
      q.delete('as');
      history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : ''));
      return as;
    }
    return session.get();
  });
  const userRef = useRef(userId);
  userRef.current = userId;

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error(String(res.status));
      setState(await res.json());
      setSync('live');
    } catch {
      setSync('offline');
    }
  }, []);

  useEffect(() => {
    void load();
    const events = new EventSource('/api/events');
    let timer: number | undefined;
    events.onmessage = () => { clearTimeout(timer); timer = window.setTimeout(load, 40); };
    events.onerror = () => setSync('offline');
    events.onopen = () => void load();
    return () => { events.close(); clearTimeout(timer); };
  }, [load]);

  const post = useCallback(async (path: string, body: unknown = {}) => {
    setPending((n) => n + 1);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-demo-user': userRef.current ?? '' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.state) setState(data.state);
      if (!res.ok) { setError(data.error ?? `The pill server answered ${res.status}.`); return { ok: false, data }; }
      setSync('live');
      return { ok: true, data };
    } catch {
      setSync('offline');
      setError("Can't reach the pill server. Your last change wasn't saved. It reconnects by itself.");
      return { ok: false };
    } finally {
      setPending((n) => n - 1);
    }
  }, []);

  const act = useCallback(async (caseId: string, action: Action, optimistic?: (c: Case) => Case) => {
    if (optimistic) setState((s) => s && { ...s, cases: s.cases.map((c) => (c.id === caseId ? optimistic(c) : c)) });
    return (await post(`/api/cases/${caseId}/actions`, { action })).ok;
  }, [post]);

  const signIn = useCallback((id: string | null) => {
    session.set(id);
    setUserId(id);
  }, []);

  const value = useMemo<Ctx>(() => ({
    // The server's copy carries the profile photo; the built-in list covers the moment before it loads.
    state, sync, pending, user: state?.users.find((u) => u.id === userId) ?? userById(userId) ?? null, signIn, error, dismissError: () => setError(null), post, act,
  }), [state, sync, pending, userId, signIn, error, post, act]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

/**
 * A draft value (text, or a map of answers) that saves while you type (debounced) and on
 * blur, and is never overwritten by a live refresh while it is being edited.
 * `take()` cancels the pending save and returns the latest value, so an action can save it first.
 */
export function useDraft<T>(serverValue: T, save: (v: T) => void, delay = 600) {
  const [value, setValue] = useState(serverValue);
  const editing = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const current = useRef(value);
  const latest = useRef(save);
  latest.current = save;
  useEffect(() => { if (!editing.current) { setValue(serverValue); current.current = serverValue; } }, [serverValue]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flush = useCallback(() => {
    if (timer.current === undefined) return;
    clearTimeout(timer.current);
    timer.current = undefined;
    editing.current = false;
    latest.current(current.current);
  }, []);
  return {
    value,
    onChange: (v: T) => {
      editing.current = true;
      current.current = v;
      setValue(v);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, delay);
    },
    onBlur: flush,
    take: () => {
      clearTimeout(timer.current);
      timer.current = undefined;
      editing.current = false;
      return current.current;
    },
  };
}

/** Rows this window has not looked at yet (per revision), for the review queue highlight. */
export function useSeen() {
  const key = 'ip.seen';
  const read = () => { try { return new Set<string>(JSON.parse(sessionStorage.getItem(key) ?? '[]')); } catch { return new Set<string>(); } };
  const [seen, setSeen] = useState(read);
  const mark = useCallback((id: string) => {
    setSeen((s) => {
      if (s.has(id)) return s;
      const next = new Set(s).add(id);
      try { sessionStorage.setItem(key, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);
  return { seen, mark };
}
