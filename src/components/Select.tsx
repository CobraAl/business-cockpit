import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Popover } from './Popover';

export type Option<T extends string = string> = {
  value: T;
  label: string;
  /** Color dot shown before the label (client colors). */
  color?: string;
  /** Muted text on the right. */
  hint?: string;
};

type Props<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  /** Shown when no option matches `value` (e.g. "No client"). */
  placeholder?: string;
  /** Adds a search box; turned on automatically past 7 options. */
  searchable?: boolean;
  /** Lets the user create a new entry from the search text; returns its value. */
  onCreate?: (label: string) => T;
  createLabel?: (text: string) => string;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
};

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** Dropdown matching the app's look, with keyboard support, search and quick create. */
export function Select<T extends string>({
  value, onChange, options, placeholder = 'Choose…', searchable, onCreate,
  createLabel = (t) => `Create "${t}"`, size = 'md', ariaLabel, className = '',
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const withSearch = searchable ?? (options.length > 7 || !!onCreate);

  const selected = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const q = norm(query);
    return q ? options.filter((o) => norm(o.label).includes(q)) : options;
  }, [options, query]);
  const canCreate = !!onCreate && !!query.trim() && !options.some((o) => norm(o.label) === norm(query));
  const count = shown.length + (canCreate ? 1 : 0);

  const close = (refocus = true) => {
    setOpen(false);
    setQuery('');
    if (refocus) button.current?.focus();
  };
  const openList = () => {
    setOpen(true);
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
  };
  const pick = (i: number) => {
    if (i < shown.length) onChange(shown[i].value);
    else if (canCreate && onCreate) onChange(onCreate(query.trim()));
    close();
  };

  useEffect(() => {
    if (!open) return;
    // Next frame: the panel is placed and visible by then, so focus sticks.
    const id = requestAnimationFrame(() => (withSearch ? search.current : list.current)?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, withSearch]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(count - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(count - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (count) pick(Math.min(active, count - 1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // don't close the modal behind
      close();
    } else if (e.key === 'Tab') {
      close(); // back on the trigger, so Tab carries on to the next field
    } else if (!withSearch && e.key.length === 1) {
      const i = shown.findIndex((o) => norm(o.label).startsWith(norm(e.key)));
      if (i >= 0) setActive(i);
    }
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`select select-${size} ${open ? 'is-open' : ''} ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ? `${ariaLabel}: ${selected?.label ?? placeholder}` : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            openList();
          }
        }}
      >
        {selected?.color && <span className="swatch" style={{ background: selected.color }} />}
        <span className={'select-value' + (selected ? '' : ' is-placeholder')}>{selected?.label ?? placeholder}</span>
        <svg className="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <Popover anchor={button} panelRef={panel} open={open} onClose={() => close(false)} label={ariaLabel} minWidth={240}>
        {withSearch && (
          <div className="pop-search">
            <input
              ref={search}
              className="input"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKey}
              placeholder={onCreate ? 'Search or create…' : 'Search…'}
              aria-controls={id}
              aria-activedescendant={count ? `${id}-${active}` : undefined}
            />
          </div>
        )}
        <div ref={list} id={id} className="pop-list" role="listbox" tabIndex={-1} onKeyDown={withSearch ? undefined : onKey} aria-activedescendant={count ? `${id}-${active}` : undefined}>
          {shown.map((o, i) => (
            <div
              key={o.value || '∅'}
              id={`${id}-${i}`}
              data-i={i}
              role="option"
              aria-selected={o.value === value}
              className={'pop-opt' + (i === active ? ' is-active' : '') + (o.value === value ? ' is-selected' : '')}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
            >
              {o.color && <span className="swatch" style={{ background: o.color }} />}
              <span className="pop-label">{o.label}</span>
              {o.hint && <span className="pop-hint">{o.hint}</span>}
              {o.value === value && (
                <svg className="pop-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </div>
          ))}
          {canCreate && (
            <div
              id={`${id}-${shown.length}`}
              data-i={shown.length}
              role="option"
              aria-selected={false}
              className={'pop-opt pop-create' + (active === shown.length ? ' is-active' : '')}
              onMouseEnter={() => setActive(shown.length)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(shown.length)}
            >
              <span className="pop-plus">+</span>
              <span className="pop-label">{createLabel(query.trim())}</span>
            </div>
          )}
          {!count && <div className="pop-empty">No results</div>}
        </div>
      </Popover>
    </>
  );
}
