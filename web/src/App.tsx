import { useEffect, useState, type ReactNode } from 'react';
import { USERS, type User } from '../../shared/flow.ts';
import { baseline, fmtKw, fmtTime, TOWER } from '../../shared/model.ts';
import { SingleLine } from './drawings.tsx';
import { CasePage, CasesPage, NotFound } from './engineer.tsx';
import { AuditPage, LibraryPage, PillPage } from './library.tsx';
import { QueuePage, ReviewPage } from './manager.tsx';
import { ProfilePage } from './profile.tsx';
import { AppProvider, go, Link, useApp, useLocation } from './state.tsx';
import { Avatar, BrandMark, Icon } from './ui.tsx';

const home = (u: User) => (u.role === 'engineer' ? '/cases' : '/review');

export default function App() {
  return (
    <AppProvider>
      <Routes />
    </AppProvider>
  );
}

function Redirect({ to }: { to: string }) {
  useEffect(() => { go(to, { replace: true }); }, [to]);
  return null;
}

function Routes() {
  const { path } = useLocation();
  const { user, state } = useApp();
  const [, section, id] = path.split('/');
  useEffect(() => {
    const names: Record<string, string> = { cases: 'My cases', review: 'Review queue', pills: 'Pill library', audit: 'Audit log', profile: 'Profile' };
    document.title = [id, names[section], 'Intelligence Pills'].filter(Boolean).join(' · ');
  }, [section, id]);

  if (!user) return <Login />;
  if (path === '/') return <Redirect to={home(user)} />;
  // A link opened in the other role's window goes to that role's view of the same thing.
  if (section === 'cases' && user.role === 'manager') return <Redirect to={id ? `/review/${id}` : '/review'} />;
  if (section === 'review' && user.role === 'engineer') return <Redirect to={id ? `/cases/${id}` : '/cases'} />;

  let page: ReactNode;
  if (!state) page = <Loading />;
  else if (section === 'cases') page = id ? <CasePage id={id} /> : <CasesPage />;
  else if (section === 'review') page = id ? <ReviewPage id={id} /> : <QueuePage />;
  else if (section === 'pills') page = id ? <PillPage id={id} /> : <LibraryPage />;
  else if (section === 'audit') page = <AuditPage />;
  else if (section === 'profile') page = <ProfilePage />;
  else page = <NotFound what="That page" back={home(user)} />;
  return <Shell user={user}>{page}</Shell>;
}

function Loading() {
  return (
    <div className="page" aria-busy="true">
      <p className="lead">Loading the pill server…</p>
      <div className="skeleton" />
    </div>
  );
}

// ---------- shell ----------

function Shell({ user, children }: { user: User; children: ReactNode }) {
  const { sync, pending, error, dismissError } = useApp();
  const nav = user.role === 'engineer'
    ? [{ to: '/cases', label: 'My cases' }, { to: '/pills', label: 'Pill library' }, { to: '/audit', label: 'Audit log' }]
    : [{ to: '/review', label: 'Review queue' }, { to: '/pills', label: 'Pill library' }, { to: '/audit', label: 'Audit log' }];
  const { path } = useLocation();
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="shell">
        <div className="shell-inner">
          <Link to={home(user)} className="brand"><BrandMark size={26} /><span>Intelligence Pills</span></Link>
          <nav className="shell-nav" aria-label="Main">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} aria-current={path === n.to || path.startsWith(`${n.to}/`) ? 'page' : undefined}>{n.label}</Link>
            ))}
          </nav>
          <div className="shell-right">
            <span className={`sync sync--${sync}`} role="status">
              <span className="sync-dot" aria-hidden="true" />
              {sync === 'offline' ? 'Offline' : sync === 'connecting' ? 'Connecting' : pending ? 'Saving' : 'Live'}
            </span>
            <PersonaMenu user={user} />
          </div>
        </div>
      </header>
      {sync === 'offline' && <div className="banner banner--offline" role="status">Can't reach the pill server. This page reconnects by itself.</div>}
      {error && (
        <div className="toast" role="alert">
          <Icon name="alert" size={18} />
          <span>{error}</span>
          <button type="button" className="link-btn" onClick={dismissError}>Dismiss</button>
        </div>
      )}
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="site-foot">
        <span>Synthetic demo data. No real people, buildings, readings or tariffs.</span>
        <span>Keppel · AI Harvest case study · Tencent Cloud AI CAN DO IT Hackathon Singapore 2026</span>
      </footer>
    </>
  );
}

function PersonaMenu({ user }: { user: User }) {
  const { signIn, post } = useApp();
  const [confirm, setConfirm] = useState(false);
  const close = (e: React.MouseEvent) => (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
  return (
    <details className="persona" onToggle={(e) => { if (!(e.target as HTMLDetailsElement).open) setConfirm(false); }}>
      <summary aria-label={`Signed in as ${user.name}, ${user.title}. Open menu`}>
        <Avatar user={user} />
        <span className="persona-text"><strong>{user.name}</strong><span>{user.title}</span></span>
      </summary>
      <div className="persona-menu">
        <button type="button" onClick={(e) => { close(e); go('/profile'); }}><Icon name="mail" size={16} />Profile and notifications</button>
        <button type="button" onClick={() => { signIn(null); go('/'); }}><Icon name="user" size={16} />Switch role</button>
        {confirm ? (
          <div className="reset-confirm">
            <p>Reset every case and the audit log, for every open window?</p>
            <div>
              <button type="button" className="btn btn-danger" onClick={async () => { setConfirm(false); if ((await post('/api/reset')).ok) go(home(user)); }}>Reset</button>
              <button type="button" className="btn" onClick={() => setConfirm(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirm(true)}><Icon name="replan" size={16} />Reset demo</button>
        )}
      </div>
    </details>
  );
}

// ---------- sign in ----------

const ROLE_COPY: Record<User['role'], { does: string; cta: string }> = {
  engineer: { does: 'Define the problem, let the agent assemble a fix from existing pills, check it in simulation and send it for approval.', cta: 'Sign in as the engineer' },
  manager: { does: 'Review the evidence and the agents’ verdicts. Approve and rate, then execute; or return it with comments.', cta: 'Sign in as the manager' },
};
const FLOW = ['Define the problem', 'Agent finds pills', 'Simulate and tweak', 'Agent asks questions', 'Engineer confirms', 'Manager approves or returns', 'Execute and rate'];

function Login() {
  const { signIn, state } = useApp();
  const { path } = useLocation();
  const base = baseline();
  const enter = (u: User) => {
    signIn(u.id);
    if (path === '/') go(home(u), { replace: true });
  };
  return (
    <div className="login">
      <header className="shell">
        <div className="shell-inner">
          <span className="brand"><BrandMark size={26} /><span>Intelligence Pills</span></span>
          <span className="shell-meta">Keppel · AI Harvest · Energy optimisation</span>
        </div>
      </header>
      <main id="main" className="login-main">
        <section className="login-drawing">
          <h1>Turn one engineer's fix into a pill every building can trust.</h1>
          <p className="lead">
            {TOWER.name} draws {fmtKw(base.peakKw)} at {fmtTime(base.peakAtHour)} every weekday, over its {fmtKw(TOWER.contractedCapacityKw)} contracted capacity,
            and the chiller power board runs at {Math.round(base.maxBoardPct.sb1)}% of its rating. Follow one fix from problem to approved, live pill.
          </p>
          <div className="viewport">
            <header className="viewport-head">
              <h2 className="view-title">Load drawing · {TOWER.name} at {fmtTime(base.peakAtHour)}</h2>
              <span className="muted">Synthetic</span>
            </header>
            <SingleLine today={base} />
          </div>
          <ol className="flow-strip" aria-label="How a pill is made">
            {FLOW.map((f, i) => <li key={f}><span className="flow-num">{i + 1}</span>{f}</li>)}
          </ol>
        </section>
        <aside className="login-roles" aria-labelledby="signin">
          <h2 id="signin">Sign in to the demo</h2>
          <p className="muted">No password. Each browser window keeps its own role, so you can run the engineer and the manager side by side and watch pills arrive live.</p>
          {USERS.map((u) => (
            <article key={u.id} className={`role-card role-card--${u.role}`}>
              <div className="role-who">
                <Avatar user={state?.users.find((x) => x.id === u.id) ?? u} size="lg" />
                <div>
                  <strong>{u.name}</strong>
                  <span>{u.title}</span>
                  <span className="muted">{u.scope}</span>
                </div>
              </div>
              <p>{ROLE_COPY[u.role].does}</p>
              <button type="button" className="btn btn-primary" onClick={() => enter(u)}>{ROLE_COPY[u.role].cta}<Icon name="arrowRight" size={16} /></button>
            </article>
          ))}
          <p className="fineprint">All people, buildings, readings and tariffs are synthetic. Nothing here is Keppel data.</p>
        </aside>
      </main>
    </div>
  );
}
