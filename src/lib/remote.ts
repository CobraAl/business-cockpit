import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppData, Client, Entry, Investment, Note, Project, Recurring, Task } from '../types';
import { normalize, type Repository } from './store';

/*
 * Supabase repository. The UI works on one AppData object; each save is turned into the
 * smallest set of writes by diffing against `base`, our record of what the database holds:
 *   - rows unknown to base are upserted whole (batched),
 *   - rows known to base only get the fields that changed (so a stale device cannot revert
 *     fields it did not touch, and cannot re-create a row deleted elsewhere),
 *   - ids that disappeared are deleted (in chunks).
 * base advances request by request. A failed partial update leaves base as it was, so the next
 * save resends the same partial update (idempotent, never re-creates a row); only rows whose
 * whole-row upsert failed are marked UNKNOWN and upserted again. Nothing else moves base.
 */

const PAGE = 1000; // PostgREST returns at most 1000 rows per request by default.
const CHUNK = 100; // ids per `in.(…)` delete, keeps the URL short.
const UNKNOWN = Symbol('unknown'); // the request carrying this row failed: state in DB unsure

type Row = Record<string, unknown>;
type Known = Row | typeof UNKNOWN;
type ListTable = 'clients' | 'projects' | 'recurring' | 'entries' | 'tasks' | 'notes' | 'investments';
type Rows = { profile: Row; clients: Row[]; projects: Row[]; recurring: Row[]; entries: Row[]; tasks: Row[]; notes: Row[]; investments: Row[] };
type Stale = { projects: string[]; clients: string[] };
type Base = { profile: Known | null; tables: Record<ListTable, Map<string, Known>> };

const orNull = (s: string) => (s ? s : null);
const str = (v: unknown) => (v == null ? '' : String(v));

/** A write the database refused for good (constraint, bad value): retrying the same payload is pointless. */
export class RejectedError extends Error {
  /** Parents deleted on another device that this device still links to. */
  readonly stale: Stale;
  constructor(message: string, stale: Stale = { projects: [], clients: [] }) {
    super(message);
    this.stale = stale;
  }
}

type DbError = { code?: string; message?: string };
// 42501 (permission denied) is left out: it is what an expired session looks like, and it heals on retry.
const isPermanent = (e: DbError) => e.code !== '42501' && /^(21|22|23|42)[0-9A-Z]{3}$/.test(e.code ?? '');

async function fetchAll(db: SupabaseClient, table: string, order: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select('*').order(order).order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/* ---------- row mapping (camelCase in the app, snake_case in Postgres) ---------- */

function toRows(d: AppData, userId: string): Rows {
  const ids = new Set(d.projects.map((p) => p.id));
  const pid = (id: string) => (ids.has(id) ? id : null);
  const cids = new Set(d.clients.map((c) => c.id));
  const cid = (id: string) => (cids.has(id) ? id : null);
  return {
    profile: {
      user_id: userId, name: d.profile.name, email: d.profile.email, company: d.profile.company,
      currency: d.profile.currency, target_pct: d.profile.targetPct, alert_pct: d.profile.alertPct,
      avatar: d.profile.avatar, invest_isin: d.profile.investIsin, invest_mic: d.profile.investMic, invest_name: d.profile.investName,
    },
    clients: d.clients.map((c: Client) => ({ id: c.id, name: c.name, color: c.color })),
    projects: d.projects.map((p: Project) => ({
      id: p.id, name: p.name, client_id: cid(p.clientId), start: orNull(p.start), deadline: orNull(p.deadline),
      status: p.status, position: p.position, brief_context: p.brief.context, brief_goal: p.brief.goal,
      brief_deliverables: p.brief.deliverables, brief_out: p.brief.out,
    })),
    investments: d.investments.map((x: Investment) => ({
      id: x.id, date: x.date, amount: x.amount, price: x.price > 0 ? x.price : null, close: x.close > 0 ? x.close : null,
    })),
    // Notes live and die with their project (FK on delete cascade): no project, no row.
    notes: d.notes.filter((n) => ids.has(n.projectId)).map((n: Note) => ({
      id: n.id, project_id: n.projectId, date: n.date, kind: n.kind, body: n.body,
      ...(n.createdAt ? { created_at: n.createdAt } : {}),
    })),
    recurring: d.recurring.map((r: Recurring) => ({
      id: r.id, label: r.label, type: r.type, category: r.category, amount: r.amount, frequency: r.frequency,
      start: r.start, end: orNull(r.end), project_id: pid(r.projectId),
    })),
    entries: d.entries.map((e: Entry) => ({
      id: e.id, date: e.date, label: e.label, type: e.type, category: e.category, amount: e.amount,
      project_id: pid(e.projectId),
    })),
    tasks: d.tasks.map((t: Task) => ({
      id: t.id, title: t.title, col: t.col, client_id: cid(t.clientId), project_id: pid(t.projectId),
      due: orNull(t.due), note: t.note, position: t.position, done_at: orNull(t.doneAt),
    })),
  };
}

function fromRows(r: { profile: Row | null; clients: Row[]; projects: Row[]; tasks: Row[]; entries: Row[]; recurring: Row[]; notes: Row[]; investments: Row[] }): Partial<AppData> {
  const p = r.profile;
  return {
    profile: p
      ? {
          name: str(p.name), email: str(p.email), company: str(p.company), currency: str(p.currency) || 'EUR',
          targetPct: Number(p.target_pct ?? 30), alertPct: Number(p.alert_pct ?? 12), avatar: str(p.avatar),
          investIsin: str(p.invest_isin), investMic: str(p.invest_mic), investName: str(p.invest_name),
        }
      : undefined,
    clients: r.clients.map((x) => ({ id: str(x.id), name: str(x.name), color: str(x.color) })),
    projects: r.projects.map((x) => ({
      id: str(x.id), name: str(x.name), clientId: str(x.client_id), start: str(x.start), deadline: str(x.deadline),
      status: str(x.status) as Project['status'], position: Number(x.position),
      brief: { context: str(x.brief_context), goal: str(x.brief_goal), deliverables: str(x.brief_deliverables), out: str(x.brief_out) },
    })),
    investments: r.investments.map((x) => ({
      id: str(x.id), date: str(x.date), amount: Number(x.amount), price: Number(x.price ?? 0), close: Number(x.close ?? 0),
    })),
    notes: r.notes.map((x) => ({
      id: str(x.id), projectId: str(x.project_id), date: str(x.date), kind: str(x.kind) as Note['kind'], body: str(x.body),
      createdAt: x.created_at ? new Date(str(x.created_at)).toISOString() : '',
    })),
    tasks: r.tasks.map((x) => ({
      id: str(x.id), title: str(x.title), col: str(x.col) as Task['col'], clientId: str(x.client_id), projectId: str(x.project_id),
      due: str(x.due), note: str(x.note), position: Number(x.position),
      doneAt: x.done_at ? new Date(str(x.done_at)).toISOString() : '',
    })),
    entries: r.entries.map((x) => ({
      id: str(x.id), date: str(x.date), label: str(x.label), type: str(x.type) as Entry['type'],
      category: str(x.category), amount: Number(x.amount), projectId: str(x.project_id),
    })),
    recurring: r.recurring.map((x) => ({
      id: str(x.id), label: str(x.label), type: str(x.type) as Recurring['type'], category: str(x.category),
      amount: Number(x.amount), frequency: str(x.frequency) as Recurring['frequency'], start: str(x.start),
      end: str(x.end), projectId: str(x.project_id),
    })),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Fields of `next` that differ from `prev` (keys are identical: both come from toRows). */
function changedFields(prev: Row, next: Row): Row | null {
  const out: Row = {};
  for (const k of Object.keys(next)) if (!same(prev[k], next[k])) out[k] = next[k];
  return Object.keys(out).length ? out : null;
}

export function createSupabaseRepository(db: SupabaseClient, userId: string): Repository {
  let base: Base | null = null;
  let saves = 0; // bumped at the start of every save, so a refresh can tell a save happened meanwhile

  /** Read everything. Pure: does not touch base. */
  async function read() {
    const [profile, clients, projects, tasks, entries, recurring, notes, investments] = await Promise.all([
      db.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
      fetchAll(db, 'clients', 'name'),
      fetchAll(db, 'projects', 'position'),
      fetchAll(db, 'tasks', 'position'),
      fetchAll(db, 'entries', 'date'),
      fetchAll(db, 'recurring', 'created_at'),
      fetchAll(db, 'notes', 'created_at'),
      fetchAll(db, 'investments', 'date'),
    ]);
    if (profile.error) throw profile.error;
    const empty = !profile.data && !clients.length && !projects.length && !tasks.length && !entries.length && !recurring.length && !notes.length && !investments.length;
    // Base comes from exactly what the UI will hold: a row normalize() drops is left alone in the DB.
    const data = normalize(fromRows({ profile: profile.data, clients, projects, tasks, entries, recurring, notes, investments }));
    const rows = toRows(data, userId);
    const nextBase: Base = {
      profile: profile.data ? rows.profile : null,
      tables: {
        clients: new Map(rows.clients.map((r) => [r.id as string, r])),
        projects: new Map(rows.projects.map((r) => [r.id as string, r])),
        recurring: new Map(rows.recurring.map((r) => [r.id as string, r])),
        entries: new Map(rows.entries.map((r) => [r.id as string, r])),
        tasks: new Map(rows.tasks.map((r) => [r.id as string, r])),
        notes: new Map(rows.notes.map((r) => [r.id as string, r])),
        investments: new Map(rows.investments.map((r) => [r.id as string, r])),
      },
    };
    return { data: empty ? null : data, base: nextBase };
  }

  async function save(data: AppData) {
    saves += 1;
    // Never write without a session: the request would go out as anonymous and be refused.
    const { data: auth } = await db.auth.getSession();
    if (!auth.session) throw new Error('No active session');
    const b: Base = base ?? {
      profile: null,
      tables: { clients: new Map(), projects: new Map(), recurring: new Map(), entries: new Map(), tasks: new Map(), notes: new Map(), investments: new Map() },
    };
    base = b;
    const next = toRows(data, userId);
    let failure: DbError | null = null;
    const note = (e: DbError) => {
      failure ??= e;
    };

    /** Run requests together, keep base in step with each one, report the first failure. */
    const run = async (jobs: { go: () => PromiseLike<{ error: DbError | null }>; ok: () => void; ko: () => void }[]) => {
      const res = await Promise.allSettled(jobs.map((j) => j.go()));
      res.forEach((r, i) => {
        const err = r.status === 'rejected' ? (r.reason as DbError) : r.value.error;
        if (err) {
          jobs[i].ko();
          note(err);
        } else jobs[i].ok();
      });
      return !failure;
    };

    const tableJobs = (t: ListTable) => {
      const known = b.tables[t];
      const fresh: Row[] = [];
      const jobs: Parameters<typeof run>[0] = [];
      for (const row of next[t]) {
        const id = row.id as string;
        const prev = known.get(id);
        if (prev === undefined || prev === UNKNOWN) {
          fresh.push(row);
          continue;
        }
        const diff = changedFields(prev, row);
        if (!diff) continue;
        jobs.push({
          go: () => db.from(t).update(diff).eq('id', id),
          ok: () => known.set(id, row),
          ko: () => {},
        });
      }
      if (fresh.length) {
        jobs.push({
          go: () => db.from(t).upsert(fresh),
          ok: () => fresh.forEach((r) => known.set(r.id as string, r)),
          ko: () => fresh.forEach((r) => known.set(r.id as string, UNKNOWN)),
        });
      }
      return jobs;
    };

    const deleteJobs = (t: ListTable) => {
      const known = b.tables[t];
      const keep = new Set(next[t].map((r) => r.id as string));
      const gone = [...known.keys()].filter((id) => !keep.has(id));
      const jobs: Parameters<typeof run>[0] = [];
      for (let i = 0; i < gone.length; i += CHUNK) {
        const ids = gone.slice(i, i + CHUNK);
        jobs.push({ go: () => db.from(t).delete().in('id', ids), ok: () => ids.forEach((id) => known.delete(id)), ko: () => {} });
      }
      return jobs;
    };

    // Foreign keys set the order: clients, then projects (point to clients), then the rows that point
    // to both; deletes go the other way round.
    const profileJobs: Parameters<typeof run>[0] = [];
    const prevProfile = b.profile;
    if (prevProfile === null || prevProfile === UNKNOWN) {
      profileJobs.push({
        go: () => db.from('profiles').upsert(next.profile, { onConflict: 'user_id' }),
        ok: () => (b.profile = next.profile),
        ko: () => (b.profile = UNKNOWN),
      });
    } else {
      const diff = changedFields(prevProfile, next.profile);
      if (diff) {
        profileJobs.push({
          go: () => db.from('profiles').update(diff).eq('user_id', userId),
          ok: () => (b.profile = next.profile),
          ko: () => {},
        });
      }
    }

    const ok =
      (await run([...profileJobs, ...tableJobs('clients')])) &&
      (await run(tableJobs('projects'))) &&
      (await run([...tableJobs('recurring'), ...tableJobs('entries'), ...tableJobs('tasks'), ...tableJobs('notes'), ...tableJobs('investments')])) &&
      (await run([...deleteJobs('tasks'), ...deleteJobs('entries'), ...deleteJobs('recurring'), ...deleteJobs('notes'), ...deleteJobs('investments')])) &&
      (await run(deleteJobs('projects'))) &&
      (await run(deleteJobs('clients')));
    if (ok) return;

    const err = failure as DbError | null;
    if (err && err.code === '23503') {
      // A project or client was deleted on another device: tell the UI which ones are gone.
      const gone = async (t: 'projects' | 'clients', ids: string[]) => {
        const { data: live, error } = await db.from(t).select('id');
        if (error || !live) return [];
        const alive = new Set(live.map((r: Row) => r.id as string));
        // Only rows we know were in the DB: a new row whose insert just failed is not "deleted elsewhere".
        const stale = ids.filter((id) => !alive.has(id) && typeof b.tables[t].get(id) === 'object');
        stale.forEach((id) => b.tables[t].delete(id));
        return stale;
      };
      const stale: Stale = {
        projects: await gone('projects', data.projects.map((p) => p.id)),
        clients: await gone('clients', data.clients.map((c) => c.id)),
      };
      if (stale.projects.length || stale.clients.length) throw new RejectedError('Deleted on another device', stale);
    }
    if (err && isPermanent(err)) throw new RejectedError(err.message ?? 'Change rejected');
    throw err ?? new Error('Could not save');
  }

  return {
    async load() {
      const r = await read();
      base = r.base;
      return r.data;
    },

    save,

    subscribe(onChange, generation) {
      let last = 0;
      // Another device may have changed things: re-read when this tab comes back to the front.
      const refresh = async () => {
        if (document.visibilityState !== 'visible' || Date.now() - last < 15_000) return;
        const gen = generation();
        if (gen === null) return; // local edits waiting: never overwrite them
        last = Date.now();
        const seq = saves;
        let r: Awaited<ReturnType<typeof read>>;
        try {
          r = await read();
        } catch {
          return; // offline: keep what we have
        }
        // Adopt the result only if nothing happened locally while reading; base and UI move together.
        if (seq !== saves || generation() !== gen || !r.data) return;
        base = r.base;
        onChange(r.data);
      };
      document.addEventListener('visibilitychange', refresh);
      window.addEventListener('focus', refresh);
      window.addEventListener('online', refresh);
      return () => {
        document.removeEventListener('visibilitychange', refresh);
        window.removeEventListener('focus', refresh);
        window.removeEventListener('online', refresh);
      };
    },
  };
}
