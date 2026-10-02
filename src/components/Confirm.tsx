import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Modal } from './ui';

type Ask = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  /** null = information only, a single OK button. */
  cancelLabel?: string | null;
  danger?: boolean;
};

const Ctx = createContext<(ask: Ask) => Promise<boolean>>(async () => false);

/** In-app replacement for window.confirm / window.alert, styled like the rest of the UI. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (a: Ask) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setAsk(a);
      }),
    [],
  );
  const done = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setAsk(null);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {ask && (
        <Modal title={ask.title} onClose={() => done(false)}>
          {ask.message && <div className="sub" style={{ lineHeight: 1.6, color: 'var(--ink-2)' }}>{ask.message}</div>}
          <div className="row" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
            {ask.cancelLabel !== null && (
              <button className="btn sm ghost" onClick={() => done(false)}>{ask.cancelLabel ?? 'Cancel'}</button>
            )}
            <button className={'btn sm' + (ask.danger ? ' danger-solid' : '')} autoFocus onClick={() => done(true)}>
              {ask.confirmLabel ?? 'OK'}
            </button>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
