import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import App, { Loading } from './App';
import { ConfirmProvider } from './components/Confirm';
import { createSupabaseRepository } from './lib/remote';
import { localRepository } from './lib/store';
import { supabase } from './lib/supabase';
import LoginPage from './pages/LoginPage';

/** Picks where the data lives: Supabase behind a login when configured, else this browser. */
export default function Root() {
  return (
    <Boundary>
      <ConfirmProvider>{supabase ? <AuthGate /> : <App repo={localRepository} />}</ConfirmProvider>
    </Boundary>
  );
}

/** Reads an auth error the magic link redirect may carry (expired or already used link). */
function linkErrorFromUrl(): string {
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
  const code = params.get('error_code') ?? params.get('error');
  if (!code) return '';
  history.replaceState(null, '', window.location.pathname);
  return /expired/i.test(code + (params.get('error_description') ?? ''))
    ? 'This link has expired or was already used. Ask for a new one.'
    : "This sign-in link doesn't work. Ask for a new one.";
}

function AuthGate() {
  const db = supabase!;
  // undefined = still checking, 'offline' = could not reach Supabase to refresh the session.
  const [session, setSession] = useState<Session | null | undefined | 'offline'>(undefined);
  const [linkError] = useState(linkErrorFromUrl);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    db.auth.getSession().then(({ data, error }) =>
      setSession(!data.session && error && isAuthRetryableFetchError(error) ? 'offline' : data.session),
    );
    // The initial state comes from getSession above (it can tell "offline" from "signed out").
    const { data } = db.auth.onAuthStateChange((event, s) => event !== 'INITIAL_SESSION' && setSession(s));
    const retry = () => setTries((n) => n + 1);
    window.addEventListener('online', retry);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener('online', retry);
    };
  }, [db, tries]);

  const userId = session && session !== 'offline' ? session.user.id : undefined;
  const repo = useMemo(() => (userId ? createSupabaseRepository(db, userId) : null), [db, userId]);

  if (session === undefined) return <Loading />;
  if (session === 'offline') {
    return (
      <div className="login">
        <div className="login-card section" style={{ gap: '0.75rem' }}>
          <h1 style={{ fontSize: '1.25rem' }}>Offline</h1>
          <p className="sub" style={{ margin: 0, lineHeight: 1.6 }}>Can't reach the server. Check your internet connection; everything picks up again on its own once you're back online.</p>
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => { setSession(undefined); setTries((n) => n + 1); }}>Try again</button>
        </div>
      </div>
    );
  }
  if (!session || !repo) return <LoginPage initialError={linkError} />;
  return (
    <App
      // A new identity starts from a fresh tree: nothing of the previous session survives.
      key={session.user.id}
      repo={repo}
      // 'local' signs out this device only; the phone stays connected.
      account={{ email: session.user.email ?? '', signOut: () => void db.auth.signOut({ scope: 'local' }) }}
    />
  );
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="login">
        <div className="login-card section" style={{ gap: '0.75rem' }}>
          <h1 style={{ fontSize: '1.25rem' }}>Something went wrong on this screen</h1>
          <p className="sub" style={{ margin: 0, lineHeight: 1.6 }}>Your saved data is safe. Reload the page.</p>
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
