import { useState } from 'react';
import { BrandMark, Field } from '../components/ui';
import { supabase } from '../lib/supabase';

export default function LoginPage({ initialError = '' }: { initialError?: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState(initialError);

  const send = async () => {
    const value = email.trim();
    if (!value || !supabase) return;
    setState('sending');
    setError('');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: value,
      options: { emailRedirectTo: window.location.origin },
    });
    if (err) {
      setState('idle');
      setError(
        err.status === 429
          ? 'Too many requests. Wait a few minutes before asking for another link.'
          : /signups? not allowed|not allowed for otp/i.test(err.message)
            ? "This address doesn't have access to Cockpit."
            : "Couldn't send the link. Check the address and your connection.",
      );
      return;
    }
    setState('sent');
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand">
          <BrandMark size={32} />
          <div className="brand-name">Cockpit</div>
        </div>
        {state === 'sent' ? (
          <div className="section" style={{ gap: '0.625rem' }}>
            <h1 style={{ fontSize: '1.25rem' }}>Check your inbox</h1>
            <p className="sub" style={{ margin: 0, lineHeight: 1.6 }}>
              We just sent a sign-in link to <b style={{ color: 'var(--ink)' }}>{email.trim()}</b>. Open it on this device or on your phone: you'll stay signed in after that.
            </p>
            <button className="btn sm ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => setState('idle')}>
              Use another address
            </button>
          </div>
        ) : (
          <form className="section" style={{ gap: '0.875rem' }} onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <div>
              <h1 style={{ fontSize: '1.25rem' }}>Sign in</h1>
              <p className="sub" style={{ margin: '6px 0 0' }}>Get a sign-in link by email. No password.</p>
            </div>
            <Field label="Email">
              <input className="input" type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <button className="btn tall" type="submit" disabled={state === 'sending' || !email.trim()}>
              {state === 'sending' ? 'Sending…' : 'Send me the link'}
            </button>
            {error && <div className="small" role="alert" style={{ color: 'var(--red)' }}>{error}</div>}
          </form>
        )}
      </div>
    </div>
  );
}
