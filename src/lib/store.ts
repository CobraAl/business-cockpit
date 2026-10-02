import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData, Client, Entry, Investment, Note, Recurring, Task } from '../types';
import { isHex, nextColor } from './colors';
import { COLUMNS, LOCALE, NOTE_KINDS, PROJECT_STATUSES, catLabel } from './constants';
import { isoDate, monthsAgo, uid } from './format';

/**
 * Where the data lives: localStorage (below) or Supabase (remote.ts). The UI only sees AppData.
 */
export interface Repository {
  /** null = nothing saved yet. Throws when the data cannot be read right now (e.g. offline). */
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
  /**
   * Called when the data changed elsewhere (another tab, another device). `generation()` is
   * null while local edits wait to be saved (never reload then), else a counter that moves on
   * every local edit and every save: a refresh whose counter moved meanwhile must be dropped.
   */
  subscribe?(onChange: (data: AppData) => void, generation: () => number | null): () => void;
}

const KEY = 'cockpit-v1';

export const localRepository: Repository = {
  async load() {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch {
      return null; // storage blocked: run in memory
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AppData;
    } catch {
      // Keep the unreadable copy aside, then start clean rather than failing on every load.
      try {
        localStorage.setItem(`${KEY}-unreadable-${Date.now()}`, raw);
        return null;
      } catch {
        throw new Error('Local data is unreadable');
      }
    }
  },
  async save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* storage full or blocked: the session keeps working in memory */
    }
  },
  subscribe(onChange, generation) {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue || generation() === null) return;
      try {
        onChange(JSON.parse(e.newValue) as AppData);
      } catch {
        /* ignore a half-written value */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  },
};

export function emptyData(): AppData {
  return {
    profile: { name: '', email: '', company: '', currency: 'EUR', targetPct: 30, alertPct: 12, avatar: '', investIsin: '', investMic: '', investName: '' },
    clients: [],
    projects: [],
    tasks: [],
    entries: [],
    recurring: [],
    notes: [],
    investments: [],
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A real calendar date written YYYY-MM-DD (rejects 2026-02-31 and 5-digit years). */
export const isDay = (v: unknown): v is string =>
  typeof v === 'string' && DAY.test(v) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const day = (v: unknown) => (isDay(v) ? v : '');
const text = (v: unknown) => (v == null ? '' : String(v));
const MAX_AMOUNT = 9_999_999_999.99; // numeric(12,2)
const isAvatar = (v: unknown): v is string =>
  typeof v === 'string' && v.length < 300_000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
const amount = (v: unknown) => {
  const n = Math.abs(Number(v));
  return Number.isFinite(n) ? Math.min(MAX_AMOUNT, Math.round(n * 100) / 100) : 0;
};

export const nextPosition = (tasks: Task[]) => tasks.reduce((m, t) => Math.max(m, t.position), -1) + 1;
export const topPosition = (projects: { position: number }[]) => projects.reduce((m, p) => Math.min(m, p.position), 1) - 1;
const TYPES = ['revenue', 'direct', 'opex'];
const COLS = COLUMNS.map((c) => c.key as string);
const idOf = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : uid());

/**
 * Make any saved or imported data safe to use and to store: fills fields added since, drops
 * rows the database would reject (no date, unknown type), and coerces the rest.
 */
export function normalize(d: Partial<AppData>): AppData {
  const base = emptyData();
  const p = { ...base.profile, ...(d.profile ?? {}) };

  const clients: Client[] = [];
  for (const c of d.clients ?? []) {
    const name = text(c.name).trim();
    if (!name) continue;
    clients.push({ id: idOf(c.id), name, color: isHex(c.color) ? c.color.toLowerCase() : nextColor(clients.map((x) => x.color)) });
  }
  // Saves from before clients existed carry the client as free text on each project: turn each
  // distinct name into a client once. Only for that old format, so this never runs twice.
  const legacy = d.clients === undefined;
  const byName = (name: string) => {
    const key = name.trim().toLowerCase();
    let c = clients.find((x) => x.name.toLowerCase() === key);
    if (!c) {
      c = { id: uid(), name: name.trim(), color: nextColor(clients.map((x) => x.color)) };
      clients.push(c);
    }
    return c.id;
  };
  const clientIds = new Set(clients.map((c) => c.id));
  const cid = (v: unknown) => (typeof v === 'string' && clientIds.has(v) ? v : '');

  const projects = (d.projects ?? [])
    .map((x, i) => {
      const old = text((x as { client?: unknown }).client).trim();
      return {
        id: idOf(x.id), name: text(x.name) || 'Untitled',
        clientId: cid(x.clientId) || (legacy && old ? byName(old) : ''),
        start: day(x.start), deadline: day(x.deadline),
        status: PROJECT_STATUSES.includes(x.status) ? x.status : ('Not started' as const),
        position: Number.isFinite(Number(x.position)) && x.position !== null ? Number(x.position) : i,
        brief: {
          context: text(x.brief?.context), goal: text(x.brief?.goal),
          deliverables: text(x.brief?.deliverables), out: text(x.brief?.out),
        },
      };
    })
    .sort((a, b) => a.position - b.position);
  const ids = new Set(projects.map((x) => x.id));
  const pid = (v: unknown) => (typeof v === 'string' && ids.has(v) ? v : '');
  clients.sort((a, b) => a.name.localeCompare(b.name, LOCALE));
  return {
    profile: {
      name: text(p.name), email: text(p.email), company: text(p.company), currency: text(p.currency) || 'EUR',
      targetPct: Number(p.targetPct) || 0, alertPct: Number(p.alertPct) || 0, avatar: isAvatar(p.avatar) ? p.avatar : '',
      investIsin: /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(text(p.investIsin)) ? text(p.investIsin) : '',
      investMic: /^[A-Z]{4}$/.test(text(p.investMic)) ? text(p.investMic) : '',
      investName: text(p.investName),
    },
    clients,
    projects,
    tasks: (d.tasks ?? [])
      .map((t, i): Task => ({
        id: idOf(t.id), title: text(t.title) || 'Untitled', col: COLS.includes(t.col) ? t.col : 'todo',
        clientId: legacy ? '' : cid(t.clientId), projectId: pid(t.projectId), due: day(t.due), note: text(t.note),
        position: Number.isFinite(Number(t.position)) && t.position !== null ? Number(t.position) : i,
        doneAt: t.col === 'done' && typeof t.doneAt === 'string' && !Number.isNaN(Date.parse(t.doneAt)) ? t.doneAt : '',
      }))
      .sort((a, b) => a.position - b.position),
    entries: (d.entries ?? [])
      .filter((e) => isDay(e.date) && TYPES.includes(e.type))
      .map((e): Entry => ({
        id: idOf(e.id), date: e.date, label: text(e.label) || catLabel(text(e.category)), type: e.type, category: text(e.category),
        amount: amount(e.amount), projectId: pid(e.projectId),
      })),
    recurring: (d.recurring ?? [])
      .filter((r) => isDay(r.start) && TYPES.includes(r.type))
      .map((r): Recurring => ({
        id: idOf(r.id), label: text(r.label) || catLabel(text(r.category)), type: r.type, category: text(r.category),
        amount: amount(r.amount), frequency: r.frequency === 'yearly' ? 'yearly' : 'monthly', start: r.start,
        end: day(r.end), projectId: pid(r.projectId),
      })),
    // Notes belong to a project: without one (or without a date) they are dropped.
    notes: (d.notes ?? [])
      .filter((n) => ids.has(n.projectId) && isDay(n.date))
      .map((n): Note => ({
        id: idOf(n.id), projectId: n.projectId, date: n.date,
        kind: NOTE_KINDS.some((k) => k.key === n.kind) ? n.kind : 'note', body: text(n.body),
        createdAt: typeof n.createdAt === 'string' && !Number.isNaN(Date.parse(n.createdAt)) ? n.createdAt : '',
      })),
    investments: (d.investments ?? [])
      .filter((x) => isDay(x.date) && amount(x.amount) > 0)
      .map((x): Investment => ({
        id: idOf(x.id), date: x.date, amount: amount(x.amount),
        price: Math.max(0, Number(x.price) || 0), close: Math.max(0, Number(x.close) || 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function demoData(profile: AppData['profile']): AppData {
  const p1 = uid();
  const p2 = uid();
  const p3 = uid();
  const p4 = uid();
  const [c1, c2, c3, c4] = [uid(), uid(), uid(), uid()];
  const m = (off: number, day: number) => `${monthsAgo(off)}-${String(day).padStart(2, '0')}`;
  const entries: AppData['entries'] = [];
  const rows: [AppData['entries'][number]['type'], string, string, string, number[]][] = [
    ['revenue', 'Services', 'Website redesign invoice', p1, [6200, 7400, 5800, 8900, 6100, 9300]],
    ['direct', 'Subcontracting', 'Freelance developer', p1, [1800, 2400, 1500, 3100, 1700, 3600]],
    ['opex', 'Marketing', 'Ads & content', '', [300, 650, 400, 900, 350, 1200]],
    ['opex', 'Social charges & taxes', 'Social charges & taxes', '', [900, 1050, 850, 1300, 900, 1400]],
    ['opex', 'Travel', 'Client travel', '', [120, 0, 380, 90, 0, 260]],
  ];
  rows.forEach(([type, category, label, projectId, vals], ri) =>
    vals.forEach((amount, i) => {
      if (amount) entries.push({ id: uid(), date: m(5 - i, 3 + ri * 2), label, type, category, amount, projectId });
    }),
  );
  const start = m(5, 1);
  return {
    profile,
    clients: [
      { id: c2, name: 'Northside Studio', color: '#8b6fe8' },
      { id: c3, name: 'Physio Plus', color: '#22a6c9' },
      { id: c1, name: 'Hudson Home', color: '#f07a3a' },
      { id: c4, name: 'Bike & Co', color: '#2fa565' },
    ],
    projects: [
      { id: p1, name: 'E-commerce site redesign', clientId: c1, start: m(2, 4), deadline: m(-1, 15), status: 'In progress' , position: 0, brief: { context: 'Online home decor shop, 800 orders a month.', goal: 'Double the mobile conversion rate.', deliverables: 'Mockups, build, payments, training.', out: 'Product photos and SEO product copy.' } },
      { id: p2, name: 'Visual identity', clientId: c2, start: m(0, 10), deadline: m(-2, 2), status: 'Not started' , position: 1 , brief: { context: '', goal: '', deliverables: '', out: '' } },
      { id: p3, name: 'Booking app', clientId: c3, start: m(4, 1), deadline: m(0, 1), status: 'In progress' , position: 2 , brief: { context: '', goal: '', deliverables: '', out: '' } },
      { id: p4, name: 'SEO audit', clientId: c4, start: m(3, 1), deadline: m(2, 12), status: 'Done' , position: 3 , brief: { context: '', goal: '', deliverables: '', out: '' } },
    ],
    tasks: [
      { id: uid(), title: 'Send quote v2', col: 'todo', clientId: '', projectId: p2, due: isoDate(), note: '' , position: 0, doneAt: '' },
      { id: uid(), title: "Prepare this month's invoice", col: 'todo', clientId: '', projectId: '', due: '', note: '' , position: 1, doneAt: '' },
      { id: uid(), title: 'Product page mockups', col: 'ongoing', clientId: '', projectId: p1, due: '', note: '' , position: 2, doneAt: '' },
      { id: uid(), title: 'Payment integration', col: 'ongoing', clientId: '', projectId: p3, due: '', note: '' , position: 3, doneAt: '' },
      { id: uid(), title: 'Waiting for hosting access', col: 'blocked', clientId: '', projectId: p1, due: '', note: 'Follow up with the client' , position: 4, doneAt: '' },
      { id: uid(), title: 'Final SEO report', col: 'done', clientId: '', projectId: p4, due: '', note: '' , position: 5, doneAt: new Date().toISOString() },
    ],
    entries,
    investments: [],
    notes: [
      { id: uid(), projectId: p1, date: m(0, 18), kind: 'call', body: 'Check-in with the owner: product mockups approved, she wants Apple Pay.', createdAt: '' },
      { id: uid(), projectId: p1, date: m(0, 22), kind: 'decision', body: 'Launch v1 without the customer reviews module.', createdAt: '' },
    ],
    recurring: [
      { id: uid(), label: 'Maintenance retainer', type: 'revenue', category: 'Subscriptions / retainers', amount: 1500, frequency: 'monthly', start, end: '', projectId: p3 },
      { id: uid(), label: 'Coworking', type: 'opex', category: 'Rent & office', amount: 650, frequency: 'monthly', start, end: '', projectId: '' },
      { id: uid(), label: 'Google Workspace', type: 'opex', category: 'Software & SaaS', amount: 14, frequency: 'monthly', start, end: '', projectId: '' },
      { id: uid(), label: 'Figma', type: 'opex', category: 'Software & SaaS', amount: 180, frequency: 'yearly', start, end: '', projectId: '' },
      { id: uid(), label: 'Business bank account', type: 'opex', category: 'Bank fees', amount: 45, frequency: 'monthly', start, end: '', projectId: '' },
    ],
  };
}

export type SyncStatus = 'loading' | 'saved' | 'saving' | 'error' | 'rejected' | 'load-error';

const SAVE_DELAY = 400;
const RETRY_DELAY = 5000;
const LOAD_TIMEOUT = 15000;

type Stale = { projects: string[]; clients: string[] };
type Rejection = { message: string; stale: Stale };
const asRejection = (e: unknown): Rejection | null =>
  e instanceof Error && 'stale' in e ? { message: e.message, stale: (e as { stale: Stale }).stale } : null;

/** Remove projects and clients that no longer exist and unlink what pointed to them. */
export function pruneParents(d: AppData, stale: Stale): AppData {
  const p = new Set(stale.projects);
  const c = new Set(stale.clients);
  const unP = <T extends { projectId: string }>(x: T) => (p.has(x.projectId) ? { ...x, projectId: '' } : x);
  const unC = <T extends { clientId: string }>(x: T) => (c.has(x.clientId) ? { ...x, clientId: '' } : x);
  return {
    ...d,
    clients: d.clients.filter((x) => !c.has(x.id)),
    projects: d.projects.filter((x) => !p.has(x.id)).map(unC),
    tasks: d.tasks.map(unP).map(unC),
    entries: d.entries.map(unP),
    recurring: d.recurring.map(unP),
    notes: d.notes.filter((n) => !p.has(n.projectId)),
  };
}

export function useAppData(repo: Repository) {
  const [data, setData] = useState<AppData | null>(null);
  const [status, setStatus] = useState<SyncStatus>('loading');
  const [rejection, setRejection] = useState('');
  const [attempt, setAttempt] = useState(0);
  const loaded = useRef(false);
  // Set when the state comes from the repository (load or refresh), so it is not written straight back.
  const fromRepo = useRef(false);
  const pending = useRef<AppData | null>(null);
  const inFlight = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const gen = useRef(0);
  const disposed = useRef(false);
  const rejected = useRef(false); // the DB refused a change: hold further saves until a reload

  const flush = useCallback(
    function run() {
      window.clearTimeout(timer.current);
      if (disposed.current || inFlight.current || !pending.current) return;
      const snapshot = pending.current;
      pending.current = null;
      inFlight.current = true;
      repo.save(snapshot).then(
        () => {
          inFlight.current = false;
          gen.current += 1;
          if (disposed.current) return;
          if (pending.current) run();
          else setStatus('saved');
        },
        (err: unknown) => {
          inFlight.current = false;
          gen.current += 1;
          if (disposed.current) return;
          const rej = asRejection(err);
          if (rej && (rej.stale.projects.length || rej.stale.clients.length)) {
            // Deleted on another device: drop them here too; the resulting change saves itself.
            pending.current = null;
            setData((d) => (d ? pruneParents(d, rej.stale) : d));
            return;
          }
          if (rej) {
            // The database refused this change for good: stop retrying and say so.
            pending.current = pending.current ?? snapshot;
            rejected.current = true;
            setRejection(rej.message);
            setStatus('rejected');
            return;
          }
          // Network or server hiccup: keep the newest version and retry.
          pending.current = pending.current ?? snapshot;
          setStatus('error');
          timer.current = window.setTimeout(run, RETRY_DELAY);
        },
      );
    },
    [repo],
  );

  useEffect(() => {
    let alive = true;
    disposed.current = false;
    loaded.current = false;
    pending.current = null;
    rejected.current = false;
    setData(null);
    setStatus('loading');
    setRejection('');
    const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT));
    Promise.race([repo.load(), timeout]).then(
      (d) => {
        if (!alive) return;
        fromRepo.current = true;
        setData(d ? normalize(d) : emptyData());
        // A brand-new account has nothing saved: write the starting profile once.
        if (!d) fromRepo.current = false;
        setStatus('saved');
        loaded.current = true;
      },
      // Never fall back to empty data here: saving it would overwrite the real data.
      () => alive && setStatus('load-error'),
    );
    const unsubscribe = repo.subscribe?.(
      (d) => {
        if (!alive) return;
        fromRepo.current = true;
        setData(normalize(d));
      },
      () => (!loaded.current || pending.current || inFlight.current ? null : gen.current),
    );
    return () => {
      alive = false;
      disposed.current = true;
      window.clearTimeout(timer.current);
      unsubscribe?.();
    };
  }, [repo, attempt]);

  useEffect(() => {
    if (!loaded.current || !data) return;
    if (fromRepo.current) {
      fromRepo.current = false;
      return;
    }
    gen.current += 1;
    pending.current = data;
    // After a refusal, wait for a reload instead of resending the refused change.
    if (rejected.current) return;
    setStatus('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY);
  }, [data, flush]);

  // Send pending changes as soon as the page is hidden (phones rarely fire beforeunload),
  // and warn before closing the tab while something is still unsaved.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && !rejected.current) flush();
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!rejected.current) flush();
      if (pending.current || inFlight.current) e.preventDefault();
    };
    document.addEventListener('visibilitychange', onHide);
    const onPageHide = () => {
      if (!rejected.current) flush();
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [flush]);

  const update = useCallback((fn: (d: AppData) => AppData) => setData((d) => (d ? fn(d) : d)), []);
  const retryLoad = useCallback(() => setAttempt((n) => n + 1), []);
  const hasUnsaved = useCallback(() => !!pending.current || inFlight.current, []);
  return { data, update, status, rejection, retryLoad, hasUnsaved };
}

/** Journal order: newest day first; within a day, the note written last first. */
export function sortNotes(notes: Note[]): Note[] {
  return notes
    .map((n, i) => ({ n, i }))
    .sort((a, b) => b.n.date.localeCompare(a.n.date) || b.n.createdAt.localeCompare(a.n.createdAt) || b.i - a.i)
    .map(({ n }) => n);
}

export const ARCHIVE_AFTER_DAYS = 7;

/** A task with its column set; entering Done stamps doneAt, leaving it clears it. */
export function withCol(t: Task, col: Task['col']): Task {
  if (col === t.col) return t;
  return { ...t, col, doneAt: col === 'done' ? new Date().toISOString() : '' };
}

/** Done for more than a week: kept in the database, hidden from the board. */
export const isArchived = (t: Task, now = Date.now()) =>
  t.col === 'done' && !!t.doneAt && now - Date.parse(t.doneAt) > ARCHIVE_AFTER_DAYS * 86_400_000;

/**
 * Put task `id` in column `col`, just before task `beforeId` (or at the end when null).
 * Only the moved task gets a new position (the midpoint of its new neighbours), so a move is
 * a single row update. When midpoints run out of precision, the column is renumbered once.
 */
export function placeTask(d: AppData, id: string, col: Task['col'], beforeId: string | null): AppData {
  const t = d.tasks.find((x) => x.id === id);
  if (!t || beforeId === id) return d;
  const byPos = (a: Task, b: Task) => a.position - b.position;
  // Already there? (same column, and the card after it is the target)
  if (t.col === col) {
    const current = d.tasks.filter((x) => x.col === col).sort(byPos);
    const i = current.findIndex((x) => x.id === id);
    if ((current[i + 1]?.id ?? null) === beforeId) return d;
  }
  const others = d.tasks.filter((x) => x.col === col && x.id !== id).sort(byPos);
  const i = beforeId ? others.findIndex((x) => x.id === beforeId) : -1;
  const at = i === -1 ? others.length : i;
  const prev = others[at - 1]?.position;
  const next = others[at]?.position;
  const position =
    prev === undefined && next === undefined ? 0 : prev === undefined ? next! - 1 : next === undefined ? prev + 1 : (prev + next) / 2;
  if (position === prev || position === next) {
    const seq = [...others.slice(0, at), withCol(t, col), ...others.slice(at)];
    const pos = new Map(seq.map((x, k) => [x.id, k]));
    return { ...d, tasks: d.tasks.map((x) => (pos.has(x.id) ? { ...(x.id === id ? withCol(x, col) : x), position: pos.get(x.id)! } : x)) };
  }
  return { ...d, tasks: d.tasks.map((x) => (x.id === id ? { ...withCol(x, col), position } : x)) };
}
