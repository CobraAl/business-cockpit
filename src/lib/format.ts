import { LOCALE } from './constants';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local-time YYYY-MM-DD (toISOString would shift the day for users east/west of UTC). */
export function isoDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthKey(d = new Date()): string {
  return isoDate(d).slice(0, 7);
}

/** Month key `offset` months before the current month (0 = this month). */
export function monthsAgo(offset: number, from = new Date()): string {
  return monthKey(new Date(from.getFullYear(), from.getMonth() - offset, 1));
}

/** "29 Sep 2026" (or "29 Sep" when short). Month cut to 3 letters so every month looks alike. */
export function fmtDate(d: string, short = false): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  const month = fmtMonth(`${y}-${m}`);
  return short ? `${Number(day)} ${month}` : `${Number(day)} ${month} ${y}`;
}

export function fmtMonth(key: string, withYear = false): string {
  const dt = new Date(key + '-15T00:00:00');
  // Short names cut to 3 letters: en-GB writes "Sept" but "Jun", which looks uneven side by side.
  return withYear ? dt.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }) : dt.toLocaleDateString(LOCALE, { month: 'short' }).slice(0, 3);
}

export function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0 }).format(n);
  } catch {
    return Math.round(n) + ' ' + currency;
  }
}

export function pct(n: number): string {
  return (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0).toLocaleString(LOCALE) + '%';
}

export function initials(name: string): string {
  return (
    (name || '?')
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

export const uid = () => crypto.randomUUID();

/** Month key moved by `delta` months ('2026-01', -1 -> '2025-12'). */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

/** Last day of a month key, as YYYY-MM-DD. */
export function monthEnd(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return isoDate(new Date(y, m, 0));
}
