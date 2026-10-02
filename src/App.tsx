import { useEffect, useMemo, useState } from 'react';
import { Avatar, BrandMark, IconData, IconFinance, IconOverview, IconProjects } from './components/ui';
import { allTxns, totals } from './lib/finance';
import { monthKey, pct } from './lib/format';
import { useConfirm } from './components/Confirm';
import { LOCALE } from './lib/constants';
import { useAppData, type Repository, type SyncStatus } from './lib/store';
import DataPage from './pages/DataPage';
import FinancesPage from './pages/FinancesPage';
import OverviewPage from './pages/OverviewPage';
import ProjectsPage from './pages/ProjectsPage';

export type Page = 'overview' | 'projects' | 'fin' | 'data';
export type Account = { email: string; signOut: () => void };

const PAGES: { key: Page; hash: string; label: string; Icon: () => React.JSX.Element }[] = [
  { key: 'overview', hash: '', label: 'Overview', Icon: IconOverview },
  { key: 'projects', hash: 'projects', label: 'Projects', Icon: IconProjects },
  { key: 'fin', hash: 'finances', label: 'Finances', Icon: IconFinance },
  { key: 'data', hash: 'data', label: 'Data & profile', Icon: IconData },
];

type Route = { page: Page; projectId: string };
/** #/projects/<uuid> opens one project; other hashes map to a page. Old French links still work. */
const routeFromHash = (): Route => {
  const m = location.hash.match(/^#\/(?:projects|projets)(?:\/([0-9a-f-]{36}))?$/i);
  if (m) return { page: 'projects', projectId: m[1] ?? '' };
  if (location.hash === '#/donnees') return { page: 'data', projectId: '' };
  return { page: PAGES.find((p) => p.hash && location.hash === '#/' + p.hash)?.key ?? 'overview', projectId: '' };
};

const SYNC_LABEL: Record<SyncStatus, string> = {
  loading: 'Loading…',
  saved: 'Saved',
  saving: 'Saving…',
  error: 'Not saved, retrying…',
  rejected: 'Change rejected',
  'load-error': 'Offline',
};

export default function App({ repo, account }: { repo: Repository; account?: Account }) {
  const { data, update, status, rejection, retryLoad, hasUnsaved } = useAppData(repo);
  const confirm = useConfirm();
  const signOut = account
    ? async () => {
        if (
          hasUnsaved() &&
          !(await confirm({
            title: 'Sign out?',
            message: "Some changes aren't saved yet. They will be lost.",
            confirmLabel: 'Sign out',
            danger: true,
          }))
        )
          return;
        account.signOut();
      }
    : undefined;
  const session = account && signOut ? { ...account, signOut: () => void signOut() } : undefined;
  const [route, setRoute] = useState<Route>(routeFromHash);
  const page = route.page;

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (p: Page, projectId = '') => {
    const hash = p === 'projects' && projectId ? `projects/${projectId}` : PAGES.find((x) => x.key === p)!.hash;
    window.location.hash = hash ? '/' + hash : '';
    setRoute({ page: p, projectId });
    window.scrollTo({ top: 0 });
  };
  const setPage = (p: Page) => go(p);
  const openProject = (id: string) => go('projects', id);

  const glance = useMemo(() => {
    if (!data) return null;
    const month = allTxns(data).filter((t) => t.date.slice(0, 7) === monthKey());
    return {
      active: data.projects.filter((p) => p.status === 'In progress').length,
      blocked: data.tasks.filter((t) => t.col === 'blocked').length,
      netRate: totals(month).netRate,
      hasRevenue: totals(month).rev > 0,
    };
  }, [data]);

  if (status === 'load-error') {
    return (
      <div className="login">
        <div className="login-card section" style={{ gap: '0.75rem' }}>
          <h1 style={{ fontSize: '1.25rem' }}>Couldn't load your data</h1>
          <p className="sub" style={{ margin: 0, lineHeight: 1.6 }}>Check your internet connection, then try again. Nothing was changed.</p>
          <div className="row" style={{ gap: '0.5rem' }}>
            <button className="btn" onClick={retryLoad}>Try again</button>
            {session && <button className="btn ghost" onClick={session.signOut}>Sign out</button>}
          </div>
        </div>
      </div>
    );
  }
  if (!data || !glance) return <Loading />;
  const openedProject = page === 'projects' && route.projectId ? data.projects.find((p) => p.id === route.projectId) : undefined;
  const P = data.profile;
  const current = PAGES.find((p) => p.key === page)!;
  const today = new Date().toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const nav = PAGES.map(({ key, label, Icon }) => (
    <button key={key} className={'nav-btn' + (page === key ? ' on' : '')} onClick={() => setPage(key)} aria-current={page === key ? 'page' : undefined}>
      <Icon />
      {label}
    </button>
  ));

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <BrandMark size={32} />
          <div className="brand-name">Cockpit</div>
        </div>
        <nav className="nav">
          <div className="eyebrow">Menu</div>
          {nav}
        </nav>
        <div className="glance">
          <div className="eyebrow">At a glance</div>
          <div className="glance-row"><span>Projects in progress</span><b>{glance.active}</b></div>
          <div className="glance-row"><span>Blocked tasks</span><b className={glance.blocked ? 'bad' : ''}>{glance.blocked}</b></div>
          <div className="glance-row"><span>This month's margin</span><b>{glance.hasRevenue ? pct(glance.netRate) : '—'}</b></div>
        </div>
        <button className="me" onClick={() => setPage('data')} title="Edit profile">
          <Avatar name={P.name} photo={P.avatar} />
          <div style={{ minWidth: 0 }}>
            <div className="me-name ellipsis">{P.name || 'Your name'}</div>
            <div className="me-mail ellipsis">{P.email || P.company}</div>
          </div>
        </button>
      </aside>

      <main className="main">
        <div className="crumbs">
          <div className="row" style={{ gap: '0.5rem' }}>
            <span className="mobile-brand"><BrandMark size={24} /></span>
            <span>{P.company || 'My business'}</span>
            <span>›</span>
            {openedProject ? (
              <>
                <button className="crumb-link" onClick={() => setPage('projects')}>Projects</button>
                <span>›</span>
                <span className="here ellipsis" style={{ maxWidth: '16rem' }}>{openedProject.name}</span>
              </>
            ) : (
              <span className="here">{current.label}</span>
            )}
          </div>
          <div className="row" style={{ gap: '0.875rem' }}>
            {account && (
              <span className={'sync sync-' + status} role="status" title={account.email}>
                <span className="sync-dot" />
                {SYNC_LABEL[status]}
              </span>
            )}
            <span className="today">{today}</span>
          </div>
        </div>

        {status === 'rejected' && (
          <div className="banner" role="alert">
            <span>
              <b>The database rejected your last change.</b> Reload to start again from what is saved.
              {rejection && <span className="small"> ({rejection})</span>}
            </span>
            <button className="btn sm" onClick={retryLoad}>Reload</button>
          </div>
        )}

        {page === 'overview' && <OverviewPage data={data} update={update} openProject={openProject} />}
        {page === 'projects' && (
          <ProjectsPage data={data} update={update} projectId={route.projectId} openProject={openProject} back={() => setPage('projects')} />
        )}
        {page === 'fin' && <FinancesPage data={data} update={update} goToData={() => setPage('data')} />}
        {page === 'data' && <DataPage data={data} update={update} account={session} />}
      </main>

      <nav className="tabbar">{nav}</nav>
    </div>
  );
}

export function Loading() {
  return (
    <div className="login">
      <div className="row" style={{ gap: '0.625rem', color: 'var(--muted)', fontSize: '0.8125rem', fontWeight: 600 }}>
        <BrandMark size={28} />
        Loading…
      </div>
    </div>
  );
}
