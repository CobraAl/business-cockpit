import type { AppData, EntryType, Recurring, Txn } from '../types';
import { isoDate, monthKey } from './format';

const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

/**
 * Turn each recurring item into one transaction per billing date, from its start up to its
 * end date (inclusive) or today. Nothing is generated in the future: a charge only counts once
 * its billing day has passed.
 */
export function expandRecurring(items: Recurring[], today = new Date()): Txn[] {
  const current = monthKey(today);
  const todayIso = isoDate(today);
  const out: Txn[] = [];
  for (const r of items) {
    if (!r.start || !r.amount) continue;
    const [sy, sm, sd] = r.start.split('-').map(Number);
    const last = r.end && r.end.slice(0, 7) < current ? r.end.slice(0, 7) : current;
    let y = sy;
    let m = sm;
    while (`${y}-${String(m).padStart(2, '0')}` <= last) {
      if (r.frequency === 'monthly' || m === sm) {
        const key = `${y}-${String(m).padStart(2, '0')}`;
        const day = String(Math.min(sd || 1, daysInMonth(y, m))).padStart(2, '0');
        const date = `${key}-${day}`;
        if (date > todayIso || (r.end && date > r.end)) break;
        out.push({
          id: `${r.id}:${key}`,
          recurringId: r.id,
          date,
          label: r.label,
          type: r.type,
          category: r.category,
          amount: Number(r.amount),
          projectId: r.projectId,
        });
      }
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  return out;
}

/** Everything that has actually happened up to today; planned (future-dated) entries stay out. */
export function allTxns(data: AppData, today = new Date()): Txn[] {
  const t = isoDate(today);
  return [...data.entries.filter((e) => e.date <= t), ...expandRecurring(data.recurring, today)];
}

export const sumType = (list: Txn[], type: EntryType) =>
  list.filter((e) => e.type === type).reduce((a, e) => a + Number(e.amount || 0), 0);

export function totals(list: Txn[]) {
  const rev = sumType(list, 'revenue');
  const direct = sumType(list, 'direct');
  const opex = sumType(list, 'opex');
  const charges = direct + opex;
  const gross = rev - direct;
  const net = rev - charges;
  return {
    rev,
    direct,
    opex,
    charges,
    gross,
    net,
    grossRate: rev ? (gross / rev) * 100 : 0,
    netRate: rev ? (net / rev) * 100 : 0,
  };
}

/** Running today. A stopped item has an end date on or before today; a future one has not started. */
export function isActive(r: Recurring, today = new Date()): boolean {
  const t = isoDate(today);
  return r.start <= t && (!r.end || r.end > t);
}

export const isFuture = (r: Recurring, today = new Date()) => r.start > isoDate(today);

/** Strict amount parser: "1200", "1 200", "1200,50", "1200.5". Rejects "1.200" or "2,500" rather than misreading them. */
export function parseAmount(raw: string): number | null {
  const s = String(raw).replace(/[\s\u00a0\u202f]/g, '');
  if (!/^\d+([.,]\d{1,2})?$/.test(s)) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 1e10 ? n : null;
}

/** What a recurring item costs (or brings) per month, yearly items spread over 12. */
export const monthlyEquivalent = (r: Recurring) => (r.frequency === 'yearly' ? r.amount / 12 : r.amount);
