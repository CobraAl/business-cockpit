import { useEffect, type ReactNode } from 'react';
import { initials } from '../lib/format';

export function Seg<T extends string>({ options, value, onChange, label }: {
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      {label}
      {children}
    </label>
  );
}

// Open modals, innermost last: Escape only closes the one on top (e.g. a confirm over a form).
const stack: symbol[] = [];

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const me = Symbol(title);
    stack.push(me);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stack[stack.length - 1] === me && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      stack.splice(stack.indexOf(me), 1);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, title]);
  return (
    // pointerdown fires before the popover's own outside-click handling, so a click meant to
    // dismiss an open dropdown never closes the form behind it.
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && !document.querySelector('.pop') && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div className="card-title">{title}</div>
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Brand mark (public/logo.svg), height in px; width follows the logo's ratio. */
export const BrandMark = ({ size = 32 }: { size?: number }) => (
  <img src="/logo.svg" alt="" className="brand-logo" style={{ height: `${size / 16}rem`, width: `${(size * 1250) / 1408 / 16}rem` }} />
);

/** Profile photo, or the initials when there is none. */
export const Avatar = ({ name, photo, large = false }: { name: string; photo: string; large?: boolean }) =>
  photo ? (
    <img className={'avatar avatar-img' + (large ? ' lg' : '')} src={photo} alt={name} />
  ) : (
    <div className={'avatar' + (large ? ' lg' : '')}>{initials(name)}</div>
  );

export const IconPencil = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

export const IconOverview = () => (
  <span style={{ display: 'grid', gridTemplateColumns: '0.375rem 0.375rem', gap: 2 }}>
    {[0, 1, 2, 3].map((i) => (
      <span key={i} style={{ width: '0.375rem', height: '0.375rem', borderRadius: 2, background: 'currentColor' }} />
    ))}
  </span>
);

export const IconFinance = () => (
  <span style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: '0.875rem', width: '0.875rem' }}>
    {[6, 14, 10].map((h, i) => (
      <span key={i} style={{ width: '0.1875rem', height: h, borderRadius: 1, background: 'currentColor' }} />
    ))}
  </span>
);

export const IconProjects = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </svg>
);

export const IconData = () => (
  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, width: '0.875rem' }}>
    <span style={{ width: '0.375rem', height: '0.375rem', borderRadius: '50%', background: 'currentColor' }} />
    <span style={{ width: '0.75rem', height: '0.375rem', borderRadius: '6px 6px 2px 2px', background: 'currentColor' }} />
  </span>
);
