// End-to-end check of remote.ts against the real Supabase project. Run: npx tsx .e2e/sync.test.ts
// Needs VITE_SUPABASE_URL, PUB (publishable key) and SUPABASE_SECRET (service key, only used to
// create/delete throwaway test users) in the env.
import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';
import { createSupabaseRepository, RejectedError } from '../src/lib/remote';
import { emptyData, normalize } from '../src/lib/store';
import type { AppData } from '../src/types';

// Minimal browser globals used by remote.ts subscribe() (not exercised here).
(globalThis as any).document ??= { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' };
(globalThis as any).window ??= { addEventListener() {}, removeEventListener() {} };

const URL_ = process.env.VITE_SUPABASE_URL!;
const PUB = process.env.PUB!;
const admin = createClient(URL_, process.env.SUPABASE_SECRET!, { auth: { persistSession: false } });

let requests: string[] = [];
const countingFetch: typeof fetch = (input, init) => {
  const u = new URL(typeof input === 'string' ? input : (input as Request).url);
  if (u.pathname.startsWith('/rest/')) requests.push(`${init?.method ?? 'GET'} ${u.pathname.replace('/rest/v1/', '')}`);
  return fetch(input, init);
};

async function user() {
  const email = `e2e-${randomBytes(4).toString('hex')}@example.test`;
  const password = randomBytes(18).toString('base64url');
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = () => {
    const c = createClient(URL_, PUB, { auth: { persistSession: false }, global: { fetch: countingFetch } });
    return c.auth.signInWithPassword({ email, password }).then(({ error: e }) => { if (e) throw e; return c; });
  };
  return { id: data.user.id, client };
}

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
const clone = (d: AppData) => JSON.parse(JSON.stringify(d)) as AppData;
const canon = (d: AppData | null) => JSON.stringify(d && normalize(d));

const A = await user();
const B = await user();
try {
  const dbA = await A.client();
  const repoA = createSupabaseRepository(dbA, A.id);
  ok('new account loads as null', (await repoA.load()) === null);

  // 1. first save + round trip
  const p1 = randomUUID(), p2 = randomUUID(), c1 = randomUUID(), c2 = randomUUID();
  let d: AppData = normalize({
    ...emptyData(),
    clients: [
      { id: c1, name: 'Acme', color: '#2fa565' },
      { id: c2, name: 'Globex', color: '#abcdef' },
    ],
    projects: [
      { id: p1, name: 'Website redesign', clientId: c1, start: '2026-09-01', deadline: '', status: 'In progress', position: 0 },
      { id: p2, name: 'Audit', clientId: c2, start: '', deadline: '2026-12-31', status: 'Not started', position: 1 },
    ],
    tasks: [
      { id: randomUUID(), title: 'Devis', col: 'todo', clientId: c1, projectId: p1, due: '2026-10-01', note: 'n', position: 0 },
      { id: randomUUID(), title: 'Relance', col: 'blocked', clientId: c2, projectId: p2, due: '', note: '', position: 1 },
    ],
    entries: [{ id: randomUUID(), date: '2026-09-03', label: 'Invoice', type: 'revenue', category: 'Services', amount: 1200.5, projectId: p1 }],
    recurring: [{ id: randomUUID(), label: 'Design tool', type: 'opex', category: 'Software & SaaS', amount: 20, frequency: 'monthly', start: '2026-09-27', end: '', projectId: '' }],
  });
  await repoA.save(d);
  const fresh = await createSupabaseRepository(dbA, A.id).load();
  ok('round trip equals what was saved', canon(fresh) === canon(d));

  // 2. saving identical data sends nothing (no perpetual diffs: numeric, dates, nulls)
  const repoA2 = createSupabaseRepository(dbA, A.id);
  const loaded = (await repoA2.load())!;
  requests = [];
  await repoA2.save(clone(loaded));
  ok('no-op save sends zero requests', requests.length === 0, requests.join(', '));

  // 3. one field change -> one PATCH on that row only
  const t0 = loaded.tasks[0];
  const edited = { ...clone(loaded), tasks: loaded.tasks.map((t) => (t.id === t0.id ? { ...t, title: 'Devis v2' } : t)) };
  requests = [];
  await repoA2.save(edited);
  ok('single edit = single PATCH', requests.length === 1 && requests[0] === 'PATCH tasks', requests.join(', '));

  // 4. two devices: phone edits the note, laptop (stale) moves the card; both changes must survive
  const phone = createSupabaseRepository(dbA, A.id);
  const laptop = createSupabaseRepository(dbA, A.id);
  const onPhone = (await phone.load())!;
  const onLaptop = (await laptop.load())!;
  await phone.save({ ...clone(onPhone), tasks: onPhone.tasks.map((t) => (t.id === t0.id ? { ...t, note: 'from phone' } : t)) });
  await laptop.save({ ...clone(onLaptop), tasks: onLaptop.tasks.map((t) => (t.id === t0.id ? { ...t, col: 'done', position: 9 } : t)) });
  const merged = (await createSupabaseRepository(dbA, A.id).load())!.tasks.find((t) => t.id === t0.id)!;
  ok('concurrent field edits both survive', merged.note === 'from phone' && merged.col === 'done', JSON.stringify({ note: merged.note, col: merged.col }));

  // 5. project deleted on the phone; stale laptop links a task to it -> RejectedError with stale id, nothing resurrected
  const s1 = (await phone.load())!;
  const s2 = (await laptop.load())!;
  await phone.save({ ...clone(s1), projects: s1.projects.filter((p) => p.id !== p2), tasks: s1.tasks.map((t) => (t.projectId === p2 ? { ...t, projectId: '' } : t)) });
  let stale: string[] = [];
  try {
    await laptop.save({ ...clone(s2), projects: s2.projects.map((p) => (p.id === p2 ? { ...p, status: 'In progress' } : p)), tasks: s2.tasks.map((t) => ({ ...t, projectId: p2 })) });
  } catch (e) {
    if (e instanceof RejectedError) stale = e.stale.projects;
    else throw e;
  }
  const after5 = (await createSupabaseRepository(dbA, A.id).load())!;
  ok('stale FK reported as stale project', stale.length === 1 && stale[0] === p2, JSON.stringify(stale));
  ok('deleted project not resurrected by stale edit', !after5.projects.some((p) => p.id === p2));

  // 5b. client deleted on the phone; stale laptop tags a task with it -> stale client reported, links cleared in DB
  const k1 = (await phone.load())!;
  const k2 = (await laptop.load())!;
  await phone.save({ ...clone(k1), clients: k1.clients.filter((c) => c.id !== c2), projects: k1.projects.map((p) => (p.clientId === c2 ? { ...p, clientId: '' } : p)), tasks: k1.tasks.map((t) => (t.clientId === c2 ? { ...t, clientId: '' } : t)) });
  let staleC: string[] = [];
  try {
    await laptop.save({ ...clone(k2), tasks: k2.tasks.map((t) => ({ ...t, clientId: c2 })) });
  } catch (e) {
    if (e instanceof RejectedError) staleC = e.stale.clients;
    else throw e;
  }
  const after5b = (await createSupabaseRepository(dbA, A.id).load())!;
  ok('stale client reported', staleC.length === 1 && staleC[0] === c2, JSON.stringify(staleC));
  ok('deleted client not resurrected', !after5b.clients.some((c) => c.id === c2) && after5b.tasks.every((t) => t.clientId !== c2));
  ok('client color round-trips', after5b.clients.find((c) => c.id === c1)?.color === '#2fa565');

  // 5c. bad color is refused by the DB check and reported as permanent
  try {
    const r5 = createSupabaseRepository(dbA, A.id);
    const x = (await r5.load())!;
    await r5.save({ ...clone(x), clients: [...x.clients, { id: randomUUID(), name: 'Bad', color: 'red' }] });
    ok('bad color refused', false, 'save succeeded');
  } catch (e) {
    ok('bad color -> RejectedError', e instanceof RejectedError, String((e as Error).message));
  }

  // 5d. brief + journal: round trip, field-level brief edit, cascade on project delete
  const r5d = createSupabaseRepository(dbA, A.id);
  const x0 = (await r5d.load())!;
  // A dedicated project, so the later isolation checks on p1 still find A's row.
  const pj = { id: randomUUID(), name: 'Journal test', clientId: '', start: '', deadline: '', status: 'In progress' as const, position: 50, brief: { context: '', goal: '', deliverables: '', out: '' } };
  await r5d.save({ ...clone(x0), projects: [...x0.projects, pj] });
  const x5 = (await r5d.load())!;
  const n1 = randomUUID(), n2 = randomUUID();
  await r5d.save({
    ...clone(x5),
    projects: x5.projects.map((p) => (p.id === pj.id ? { ...p, brief: { context: 'Ctx', goal: 'But', deliverables: 'Livrables', out: 'Hors\nscope' } } : p)),
    notes: [...x5.notes, { id: n1, projectId: pj.id, date: '2026-09-20', kind: 'call', body: 'Call https://x.test' }, { id: n2, projectId: pj.id, date: '2026-09-21', kind: 'decision', body: 'Go' }],
  });
  const y5 = (await createSupabaseRepository(dbA, A.id).load())!;
  ok('brief round-trips', JSON.stringify(y5.projects.find((p) => p.id === pj.id)?.brief) === JSON.stringify({ context: 'Ctx', goal: 'But', deliverables: 'Livrables', out: 'Hors\nscope' }));
  ok('notes round-trip', y5.notes.filter((n) => n.projectId === pj.id).length === 2 && y5.notes.some((n) => n.id === n1 && n.kind === 'call' && n.body === 'Call https://x.test'));
  const r5e = createSupabaseRepository(dbA, A.id);
  const z5 = (await r5e.load())!;
  requests = [];
  await r5e.save({ ...clone(z5), projects: z5.projects.map((p) => (p.id === pj.id ? { ...p, brief: { ...p.brief, goal: 'But v2' } } : p)) });
  ok('brief edit = one PATCH', requests.length === 1 && requests[0] === 'PATCH projects', requests.join(', '));
  await r5e.save({ ...clone(z5), projects: z5.projects.filter((p) => p.id !== pj.id), notes: z5.notes.filter((n) => n.projectId !== pj.id), tasks: z5.tasks.map((t) => (t.projectId === pj.id ? { ...t, projectId: '' } : t)) });
  const leftNotes = await admin.from('notes').select('id').eq('project_id', pj.id);
  ok('project delete removes its notes', !leftNotes.error && leftNotes.data!.length === 0);
  const dbBn = await (await B.client()).from('notes').select('*');
  ok('B reads 0 notes of A', !dbBn.error && dbBn.data!.length === 0);

  // 5e. done date round-trips and does not cause perpetual diffs
  const r5f = createSupabaseRepository(dbA, A.id);
  const f0 = (await r5f.load())!;
  const doneAt = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const doneTask = { id: randomUUID(), title: 'Shipped', col: 'done' as const, clientId: '', projectId: '', due: '', note: '', position: 77, doneAt };
  await r5f.save({ ...clone(f0), tasks: [...f0.tasks, doneTask] });
  const r5g = createSupabaseRepository(dbA, A.id);
  const f1 = (await r5g.load())!;
  ok('done_at round-trips', f1.tasks.find((t) => t.id === doneTask.id)?.doneAt === doneAt, f1.tasks.find((t) => t.id === doneTask.id)?.doneAt);
  requests = [];
  await r5g.save(clone(f1));
  ok('no-op save with done_at sends nothing', requests.length === 0, requests.join(', '));

  // 5f. server-side done_at stamping, as an old app version would write
  const tid = randomUUID();
  await dbA.from('tasks').insert({ id: tid, title: 'Old tab task', col: 'todo', position: 90 });
  const read = async () => (await dbA.from('tasks').select('done_at').eq('id', tid).single()).data?.done_at as string | null;
  await dbA.from('tasks').update({ col: 'done' }).eq('id', tid);
  const stamped = await read();
  ok('entering Done without a stamp gets one', !!stamped && Date.now() - Date.parse(stamped!) < 60_000, String(stamped));
  await dbA.from('tasks').update({ title: 'Renamed' }).eq('id', tid);
  ok('editing a done task keeps its date', (await read()) === stamped);
  await dbA.from('tasks').update({ done_at: null }).eq('id', tid);
  ok('clearing done_at on a done task keeps its date', (await read()) === stamped);
  await dbA.from('tasks').update({ col: 'todo' }).eq('id', tid);
  ok('leaving Done clears the date', (await read()) === null);
  const mine = new Date(Date.now() - 2 * 86_400_000).toISOString();
  await dbA.from('tasks').update({ col: 'done', done_at: mine }).eq('id', tid);
  const kept = await read();
  ok("a client's own stamp is kept", !!kept && Date.parse(kept!) === Date.parse(mine), String(kept));

  // 5g. S&P 500: ETF on the profile + amounts put in (optional price) round-trip, no perpetual diff
  const r5h = createSupabaseRepository(dbA, A.id);
  const h0 = (await r5h.load())!;
  await r5h.save({
    ...clone(h0),
    profile: { ...h0.profile, investIsin: 'FR0013412285', investMic: 'XPAR', investName: 'Amundi PEA S&P 500 (PE500)' },
    investments: [{ id: randomUUID(), date: '2025-03-03', amount: 1000, price: 0 }, { id: randomUUID(), date: '2024-01-10', amount: 500, price: 38.5 }],
  });
  const r5i = createSupabaseRepository(dbA, A.id);
  const h1 = (await r5i.load())!;
  ok('ETF saved on the profile', h1.profile.investIsin === 'FR0013412285' && h1.profile.investMic === 'XPAR');
  ok('amounts round-trip (with and without price)', JSON.stringify(h1.investments.map((x) => [x.date, x.amount, x.price])) === JSON.stringify([['2024-01-10', 500, 38.5], ['2025-03-03', 1000, 0]]), JSON.stringify(h1.investments));
  requests = [];
  await r5i.save(clone(h1));
  ok('no-op save with investments sends nothing', requests.length === 0, requests.join(', '));
  const bInv = await (await B.client()).from('investments').select('*');
  ok('B reads 0 investments of A', !bInv.error && bInv.data!.length === 0);

  // 6. bulk: 250 entries then delete all (chunked deletes)
  const r6 = createSupabaseRepository(dbA, A.id);
  const base6 = (await r6.load())!;
  const many = Array.from({ length: 250 }, (_, i) => ({ id: randomUUID(), date: '2026-08-01', label: 'x' + i, type: 'opex' as const, category: 'Other expense', amount: i + 0.1, projectId: '' }));
  await r6.save({ ...clone(base6), entries: [...base6.entries, ...many] });
  ok('250 entries stored', (await createSupabaseRepository(dbA, A.id).load())!.entries.length === base6.entries.length + 250);
  await r6.save({ ...clone(base6), entries: [] });
  ok('bulk delete (chunked) empties entries', (await createSupabaseRepository(dbA, A.id).load())!.entries.length === 0);

  // 7. permanent rejection is typed
  try {
    await r6.save({ ...clone(base6), entries: [], projects: [...base6.projects, { id: randomUUID(), name: 'bad', clientId: '', start: '', deadline: '', status: 'Oops' as never, position: 99, brief: { context: '', goal: '', deliverables: '', out: '' } }] });
    ok('invalid status rejected', false, 'save succeeded');
  } catch (e) {
    ok('invalid status -> RejectedError', e instanceof RejectedError, String((e as Error).message));
  }

  // 8. isolation: B sees nothing of A and cannot touch A's rows
  const dbB = await B.client();
  const seen = await Promise.all(['profiles', 'clients', 'projects', 'tasks', 'entries', 'recurring'].map((t) => dbB.from(t).select('*')));
  ok('user B reads 0 rows of A', seen.every((r) => !r.error && r.data!.length === 0), seen.map((r) => r.data?.length ?? r.error?.message).join(','));
  const hijack = await dbB.from('projects').upsert({ id: p1, name: 'hacked', client: '', status: 'In progress' });
  const stillA = await admin.from('projects').select('name,user_id').eq('id', p1).single();
  ok('B cannot overwrite A row via upsert', stillA.data?.name === 'Website redesign' && stillA.data?.user_id === A.id, `${hijack.error?.code ?? 'no error'} / ${stillA.data?.name}`);
  const upd = await dbB.from('projects').update({ name: 'hacked' }).eq('id', p1).select();
  ok('B update on A row touches 0 rows', !upd.error && upd.data!.length === 0);

  // 9. anonymous visitor reads nothing
  const anon = createClient(URL_, PUB, { auth: { persistSession: false } });
  const an = await anon.from('projects').select('id');
  ok('anon cannot read', !!an.error || an.data!.length === 0, an.error?.code ?? `${an.data?.length} rows`);
  const ai = await anon.from('projects').insert({ name: 'x', status: 'In progress' });
  ok('anon cannot insert', !!ai.error, ai.error?.code ?? 'inserted!');
  const ac = await anon.from('clients').select('id');
  ok('anon cannot read clients', !!ac.error || ac.data!.length === 0, ac.error?.code ?? `${ac.data?.length} rows`);
  const bc = await dbB.from('clients').update({ name: 'hacked' }).eq('id', c1).select();
  ok('B cannot rename A client', !bc.error && bc.data!.length === 0);

  // 10. legacy import (free-text client on projects) becomes client rows, once
  const legacy = normalize({ profile: emptyData().profile, projects: [{ id: randomUUID(), name: 'Old', client: 'Acme', start: '', deadline: '', status: 'In progress' } as never], tasks: [], entries: [], recurring: [] } as never);
  ok('legacy client text -> client row', legacy.clients.length === 1 && legacy.clients[0].name === 'Acme' && legacy.projects[0].clientId === legacy.clients[0].id);
  const again = normalize(JSON.parse(JSON.stringify(legacy)));
  ok('normalize is stable on new format', JSON.stringify(again) === JSON.stringify(legacy));
} finally {
  for (const u of [A, B]) await admin.auth.admin.deleteUser(u.id);
  const left = await admin.from('projects').select('id', { count: 'exact', head: true });
  console.log(`cleanup: test users deleted, rows left in projects = ${left.count}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}
