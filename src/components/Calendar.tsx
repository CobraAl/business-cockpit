import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { LOCALE } from '../lib/constants';
import { fmtDate, fmtMonth, isoDate, monthKey, shiftMonth } from '../lib/format';
import { Popover } from './Popover';

/*
 * Date and month pickers drawn like the rest of the app (the browser's native date input looks
 * different in every browser). Values stay plain strings: 'YYYY-MM-DD' for days, 'YYYY-MM' for months.
 */

const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 1 + i).toLocaleDateString(LOCALE, { weekday: 'short' }).slice(0, 2),
); // 1 Jan 2024 was a Monday: weeks start on Monday
const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 15).toLocaleDateString(LOCALE, { month: 'short' }).slice(0, 3));

const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + n));
};
const clampDay = (day: string, min?: string, max?: string) => (min && day < min ? min : max && day > max ? max : day);

const IconCalendar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 10h18" />
  </svg>
);
const Chev = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
  </svg>
);

/** 3×4 grid of months for one year; months outside [min, max] are disabled. Arrow keys move. */
function MonthGrid({ year, selected, onPick, min, max }: { year: number; selected?: string; onPick: (key: string) => void; min?: string; max?: string }) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[e.key as string];
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.cal-month')];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i === -1) return;
    let j = -1;
    if (step) {
      for (let k = i + step; k >= 0 && k < 12; k += step) if (!buttons[k].disabled) { j = k; break; }
    } else if (e.key === 'Home') j = buttons.findIndex((b) => !b.disabled);
    else if (e.key === 'End') j = 11 - [...buttons].reverse().findIndex((b) => !b.disabled);
    else return;
    e.preventDefault();
    if (j >= 0) buttons[j].focus();
  };
  return (
    <div className="cal-months" role="grid" aria-label={String(year)} onKeyDown={onKey}>
      {MONTHS.map((label, i) => {
        const key = `${year}-${String(i + 1).padStart(2, '0')}`;
        const off = (min && key < min) || (max && key > max);
        return (
          <button
            key={key}
            type="button"
            className={'cal-month' + (key === selected ? ' is-selected' : '') + (key === monthKey() ? ' is-today' : '')}
            disabled={!!off}
            aria-pressed={key === selected}
            aria-label={fmtMonth(key, true)}
            onClick={() => onPick(key)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- DatePicker ---------------- */

export function DatePicker({
  value, onChange, placeholder = 'Pick a date', clearable = true, min = '2000-01-01', max = '2099-12-31',
  size = 'md', ariaLabel, className = '',
}: {
  value: string;
  onChange: (day: string) => void;
  placeholder?: string;
  clearable?: boolean;
  min?: string;
  max?: string;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'days' | 'months'>('days');
  const [cursor, setCursor] = useState(value || isoDate()); // day with keyboard focus
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  // Focus goes into the grid only when opening or moving with the keyboard inside it, so the
  // arrow buttons keep focus (Enter twice pages twice instead of picking a day).
  const focusGrid = useRef(false);
  const focusMonths = useRef(false); // set when the month view is opened, cleared once focused
  const shown = cursor.slice(0, 7); // month on screen

  const openPanel = () => {
    setCursor(clampDay(value || isoDate(), min, max));
    setView('days');
    focusGrid.current = true;
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const pick = (day: string) => {
    onChange(day);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      if (view === 'months') {
        // Entering the month view moves focus into it (never leave it on <body>); the year
        // arrows then keep focus, so Enter twice changes the year twice.
        if (!focusMonths.current && panel.current?.contains(document.activeElement)) return;
        focusMonths.current = false;
        const p = panel.current;
        (p?.querySelector<HTMLElement>('.cal-month.is-selected') ?? p?.querySelector<HTMLElement>('.cal-month:not(:disabled)'))?.focus();
      } else if (focusGrid.current) {
        focusGrid.current = false;
        grid.current?.querySelector<HTMLElement>(`[data-day="${cursor}"]`)?.focus();
      } else if (!panel.current?.contains(document.activeElement)) {
        // Back from the month grid: focus the day under the cursor.
        grid.current?.querySelector<HTMLElement>(`[data-day="${cursor}"]`)?.focus();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [open, view, cursor]);

  // 6 weeks starting on the Monday on or before the 1st of the shown month.
  const first = new Date(Number(shown.slice(0, 4)), Number(shown.slice(5, 7)) - 1, 1);
  const start = isoDate(new Date(first.getFullYear(), first.getMonth(), 1 - ((first.getDay() + 6) % 7)));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = isoDate();

  const onKey = (e: KeyboardEvent) => {
    const move = (d: string) => {
      e.preventDefault();
      focusGrid.current = true;
      setCursor(clampDay(d, min, max));
    };
    if (e.key === 'ArrowLeft') move(addDays(cursor, -1));
    else if (e.key === 'ArrowRight') move(addDays(cursor, 1));
    else if (e.key === 'ArrowUp') move(addDays(cursor, -7));
    else if (e.key === 'ArrowDown') move(addDays(cursor, 7));
    else if (e.key === 'PageUp') move(safe(shiftMonth(cursor.slice(0, 7), e.shiftKey ? -12 : -1) + cursor.slice(7)));
    else if (e.key === 'PageDown') move(safe(shiftMonth(cursor.slice(0, 7), e.shiftKey ? 12 : 1) + cursor.slice(7)));
    else if (e.key === 'Home') move(addDays(cursor, -((new Date(cursor + 'T00:00:00').getDay() + 6) % 7)));
    else if (e.key === 'End') move(addDays(cursor, 6 - ((new Date(cursor + 'T00:00:00').getDay() + 6) % 7)));
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // not the modal behind
      close();
    }
  };
  // PageUp on the 31st lands on e.g. 2026-02-31: normalise through Date.
  const safe = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
  };
  const stepMonth = (delta: number) => setCursor(clampDay(safe(shiftMonth(shown, delta) + cursor.slice(7)), min, max));

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`select select-${size} date-trigger ${open ? 'is-open' : ''} ${className}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ? `${ariaLabel}: ${value ? fmtDate(value) : placeholder}` : undefined}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            openPanel();
          }
        }}
      >
        <span className="date-icon"><IconCalendar /></span>
        <span className={'select-value' + (value ? '' : ' is-placeholder')}>{value ? fmtDate(value) : placeholder}</span>
      </button>
      <Popover anchor={button} panelRef={panel} open={open} onClose={() => close(false)} minWidth={264} label={ariaLabel ?? 'Calendar'}>
        <div className="cal" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
          <div className="cal-head">
            <button type="button" className="cal-nav" aria-label={view === 'days' ? 'Previous month' : 'Previous year'}
              onClick={() => (view === 'days' ? stepMonth(-1) : stepMonth(-12))}><Chev dir="left" /></button>
            <button type="button" className="cal-title" onClick={() => { focusMonths.current = true; setView(view === 'days' ? 'months' : 'days'); }} aria-label="Choose month and year">
              {view === 'days' ? fmtMonth(shown, true) : shown.slice(0, 4)}
            </button>
            <button type="button" className="cal-nav" aria-label={view === 'days' ? 'Next month' : 'Next year'}
              onClick={() => (view === 'days' ? stepMonth(1) : stepMonth(12))}><Chev dir="right" /></button>
          </div>

          {view === 'months' ? (
            <MonthGrid
              year={Number(shown.slice(0, 4))}
              selected={shown}
              min={min.slice(0, 7)}
              max={max.slice(0, 7)}
              onPick={(key) => {
                setCursor(clampDay(safe(key + cursor.slice(7)), min, max));
                setView('days');
              }}
            />
          ) : (
            <div ref={grid} className="cal-grid" role="grid" onKeyDown={onKey}>
              {WEEKDAYS.map((w) => <span key={w} className="cal-wd" aria-hidden="true">{w}</span>)}
              {days.map((d) => {
                const off = d < min || d > max;
                const cls =
                  'cal-day' +
                  (d.slice(0, 7) !== shown ? ' is-outside' : '') +
                  (d === today ? ' is-today' : '') +
                  (d === value ? ' is-selected' : '');
                return (
                  <button
                    key={d}
                    type="button"
                    data-day={d}
                    className={cls}
                    disabled={off}
                    tabIndex={d === cursor ? 0 : -1}
                    aria-selected={d === value}
                    aria-label={fmtDate(d)}
                    onClick={() => pick(d)}
                  >
                    {Number(d.slice(8))}
                  </button>
                );
              })}
            </div>
          )}

          <div className="cal-foot">
            <button type="button" className="link-btn" disabled={today < min || today > max} onClick={() => pick(today)}>Today</button>
            {clearable && value && (
              <button type="button" className="link-btn muted" onClick={() => pick('')}>Clear</button>
            )}
          </div>
        </div>
      </Popover>
    </>
  );
}

/* ---------------- MonthPicker ---------------- */

/** ‹ Month year › with a year grid in between; months after `max` can't be picked. */
export function MonthPicker({ value, onChange, max = monthKey(), min = '2000-01', ariaLabel = 'Month' }: {
  value: string;
  onChange: (key: string) => void;
  max?: string;
  min?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const prev = shiftMonth(value, -1);
  const next = shiftMonth(value, 1);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const p = panel.current;
      (p?.querySelector<HTMLElement>('.cal-month.is-selected') ?? p?.querySelector<HTMLElement>('.cal-month:not(:disabled)'))?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  return (
    <div className="month-picker">
      <button type="button" className="cal-nav" aria-label="Previous month" aria-disabled={prev < min} onClick={() => prev >= min && onChange(prev)}><Chev dir="left" /></button>
      <button
        ref={button}
        type="button"
        className={'select select-sm month-trigger' + (open ? ' is-open' : '')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${ariaLabel}: ${fmtMonth(value, true)}`}
        onClick={() => {
          setYear(Number(value.slice(0, 4)));
          setOpen(!open);
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setYear(Number(value.slice(0, 4)));
            setOpen(true);
          }
        }}
      >
        <span className="date-icon"><IconCalendar /></span>
        <span className="select-value" style={{ textTransform: 'capitalize' }}>{fmtMonth(value, true)}</span>
      </button>
      <button type="button" className="cal-nav" aria-label="Next month" aria-disabled={next > max} onClick={() => next <= max && onChange(next)}><Chev dir="right" /></button>
      <Popover anchor={button} panelRef={panel} open={open} onClose={() => setOpen(false)} minWidth={240} label="Choose a month">
        <div className="cal" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); button.current?.focus(); } }}>
          <div className="cal-head">
            <button type="button" className="cal-nav" aria-label="Previous year" aria-disabled={`${year - 1}-12` < min} onClick={() => `${year - 1}-12` >= min && setYear(year - 1)}><Chev dir="left" /></button>
            <span className="cal-title is-static">{year}</span>
            <button type="button" className="cal-nav" aria-label="Next year" aria-disabled={`${year + 1}-01` > max} onClick={() => `${year + 1}-01` <= max && setYear(year + 1)}><Chev dir="right" /></button>
          </div>
          <MonthGrid
            year={year}
            selected={value}
            min={min}
            max={max}
            onPick={(key) => {
              onChange(key);
              setOpen(false);
              button.current?.focus();
            }}
          />
          <div className="cal-foot">
            <button type="button" className="link-btn" disabled={monthKey() > max} onClick={() => { onChange(monthKey() > max ? max : monthKey()); setOpen(false); button.current?.focus(); }}>This month</button>
          </div>
        </div>
      </Popover>
    </div>
  );
}
