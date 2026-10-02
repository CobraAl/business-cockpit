import { useRef, useState } from 'react';
import { ColorPicker } from '../components/ColorPicker';
import { EntryModal, FREQ_OPTIONS, RecurringModal, TYPE_OPTIONS, catOptions } from '../components/MoneyForms';
import { useConfirm } from '../components/Confirm';
import { DatePicker } from '../components/Calendar';
import { ProjectSelect } from '../components/pickers';
import { Select } from '../components/Select';
import { Avatar, Field, IconPencil, Seg } from '../components/ui';
import { nextColor } from '../lib/colors';
import { CATEGORIES, CURRENCIES, LOCALE, TYPE_META, catLabel } from '../lib/constants';
import { isActive, isFuture, monthlyEquivalent, parseAmount } from '../lib/finance';
import { fmtDate, isoDate, money, uid } from '../lib/format';
import { demoData, isDay, normalize } from '../lib/store';
import type { Account } from '../App';
import type { AppData, Client, Entry, EntryType, Recurring } from '../types';

type Update = (fn: (d: AppData) => AppData) => void;

const emptyEntry = (): Omit<Entry, 'id' | 'amount'> & { amount: string } => ({
  date: isoDate(), label: '', type: 'revenue', category: CATEGORIES.revenue[0], amount: '', projectId: '',
});
const emptyRec = (): Omit<Recurring, 'id' | 'amount'> & { amount: string } => ({
  label: '', type: 'opex', category: 'Logiciels & SaaS', amount: '', frequency: 'monthly', start: isoDate(), end: '', projectId: '',
});

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.v, label: c.l }));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function DataPage({ data, update, account }: { data: AppData; update: Update; account?: Account }) {
  const P = data.profile;
  const m = (n: number) => money(n, P.currency);
  const projectName = (id: string) => data.projects.find((p) => p.id === id)?.name ?? '';

  const [ef, setEf] = useState(emptyEntry);
  const [added, setAdded] = useState('');
  const [rf, setRf] = useState(emptyRec);
  const [recAdded, setRecAdded] = useState('');
  const [txFilter, setTxFilter] = useState<'all' | EntryType>('all');
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingRec, setEditingRec] = useState<Recurring | null>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const confirm = useConfirm();

  const setProfile = (k: 'name' | 'email' | 'company' | 'currency' | 'avatar', v: string) =>
    update((d) => ({ ...d, profile: { ...d.profile, [k]: v } }));
  const photoRef = useRef<HTMLInputElement>(null);
  const pickPhoto = async (file: File) => {
    try {
      setProfile('avatar', await squarePhoto(file));
    } catch {
      await confirm({ title: 'Photo not recognised', message: 'Choose a JPEG, PNG or WebP image.', cancelLabel: null });
    }
  };

  const addEntry = () => {
    const amount = parseAmount(ef.amount);
    if (!amount || !isDay(ef.date)) return;
    const label = ef.label.trim() || catLabel(ef.category);
    update((d) => ({ ...d, entries: [...d.entries, { id: uid(), ...ef, label, amount }] }));
    setEf({ ...emptyEntry(), type: ef.type, category: ef.category, date: ef.date, projectId: ef.projectId });
    setAdded(`${TYPE_META[ef.type].label} "${label}" added: ${m(amount)}.`);
  };

  const addRec = () => {
    const amount = parseAmount(rf.amount);
    if (!amount || !rf.label.trim() || !isDay(rf.start)) return;
    update((d) => ({ ...d, recurring: [...d.recurring, { id: uid(), ...rf, label: rf.label.trim(), amount }] }));
    setRf({ ...emptyRec(), type: rf.type, category: rf.category });
    setRecAdded(`"${rf.label.trim()}" added. It will be counted automatically every ${rf.frequency === 'monthly' ? 'month' : 'year'}.`);
  };

  // Stopping keeps the history: charges up to today stay, nothing is charged after.
  const stopRec = (r: Recurring) =>
    update((d) => ({ ...d, recurring: d.recurring.map((x) => (x.id === r.id ? { ...x, end: isoDate() } : x)) }));
  // Restarting opens a new period from today, so the months while it was stopped stay uncharged.
  const restartRec = (r: Recurring) =>
    update((d) => ({ ...d, recurring: [...d.recurring, { ...r, id: uid(), start: isoDate(), end: '' }] }));
  const removeRec = async (r: Recurring) => {
    const ok = await confirm({
      title: 'Delete this subscription?',
      message: <>"{r.label}" and all its history will be removed from your finances. To stop it and keep the history, use "Stop" instead.</>,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    update((d) => ({ ...d, recurring: d.recurring.filter((x) => x.id !== r.id) }));
  };

  const rank = (r: Recurring) => (isActive(r) ? 0 : isFuture(r) ? 1 : 2);
  const recSorted = [...data.recurring].sort((a, b) => rank(a) - rank(b) || monthlyEquivalent(b) - monthlyEquivalent(a));
  const efAmount = parseAmount(ef.amount);
  const rfAmount = parseAmount(rf.amount);
  const badAmount = 'Invalid amount. Examples: 1200 · 1 200 · 1200.50';
  const burn = data.recurring.filter((r) => isActive(r) && r.type !== 'revenue').reduce((a, r) => a + monthlyEquivalent(r), 0);

  const entries = [...data.entries]
    .filter((e) => txFilter === 'all' || e.type === txFilter)
    .sort((a, b) => b.date.localeCompare(a.date));

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cockpit-backup-${isoDate()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importJson = async (file: File) => {
    let parsed: AppData | null = null;
    try {
      parsed = JSON.parse(await file.text()) as AppData;
      if (!parsed || !Array.isArray(parsed.projects) || !Array.isArray(parsed.entries)) parsed = null;
    } catch {
      parsed = null;
    }
    if (!parsed) {
      await confirm({ title: 'File not recognised', message: 'This file is not a valid Cockpit backup.', cancelLabel: null });
      return;
    }
    const ok = await confirm({
      title: 'Import this backup?',
      message: 'All your current data will be replaced by the data in this file.',
      confirmLabel: 'Replace',
      danger: true,
    });
    if (ok) update(() => normalize(parsed));
  };
  const loadDemo = async () => {
    const ok = await confirm({
      title: 'Load demo data?',
      message: 'Your current data will be replaced by demo data.',
      confirmLabel: 'Replace',
      danger: true,
    });
    if (ok) update((d) => demoData(d.profile));
  };
  const clearAll = async () => {
    const ok = await confirm({
      title: 'Clear everything?',
      message: 'Clients, projects (with their briefs and journals), tasks, transactions and subscriptions will be deleted. Your profile is kept.',
      confirmLabel: 'Clear everything',
      danger: true,
    });
    if (ok) update((d) => ({ ...d, clients: [], projects: [], tasks: [], entries: [], recurring: [], notes: [], investments: [] }));
  };

  const openProjects = data.projects.filter((p) => p.status !== 'Terminé' || p.id === ef.projectId || p.id === rf.projectId);

  return (
    <section className="section loose">
      <h1>Data &amp; profile</h1>

      <div className="grid-2">
        <div className="card">
          <div className="row" style={{ gap: '0.875rem', flexWrap: 'nowrap' }}>
            <button type="button" className="avatar-edit" onClick={() => photoRef.current?.click()} title="Change photo" aria-label="Change photo">
              <Avatar name={P.name} photo={P.avatar} large />
              <span className="avatar-edit-badge"><IconPencil /></span>
            </button>
            <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickPhoto(f); e.target.value = ''; }} />
            <div>
              <div className="card-title">Profile</div>
              <div className="small">
                Your details and currency.{' '}
                {P.avatar && <button type="button" className="link-btn" onClick={() => setProfile('avatar', '')}>Remove photo</button>}
              </div>
            </div>
          </div>
          <div className="form-grid">
            <Field label="Name"><input className="input" value={P.name} onChange={(e) => setProfile('name', e.target.value)} /></Field>
            <Field label="Email"><input className="input" type="email" value={P.email} onChange={(e) => setProfile('email', e.target.value)} /></Field>
            <Field label="Company"><input className="input" value={P.company} onChange={(e) => setProfile('company', e.target.value)} /></Field>
            <Field label="Currency">
              <Select value={P.currency} onChange={(v) => setProfile('currency', v)} options={CURRENCY_OPTIONS} ariaLabel="Currency" />
            </Field>
          </div>
        </div>

        <div className="card">
          <div>
            <div className="card-title">New transaction</div>
            <div className="small">A paid invoice, a one-off expense. Direct cost = tied to a project (subcontracting…). Operating expense = what it takes to run the business.</div>
          </div>
          <form className="form-grid" onSubmit={(e) => { e.preventDefault(); addEntry(); }}>
            <Field label="Date"><DatePicker value={ef.date} onChange={(date) => setEf({ ...ef, date })} clearable={false} ariaLabel="Date" /></Field>
            <Field label="Label"><input className="input" value={ef.label} onChange={(e) => setEf({ ...ef, label: e.target.value })} placeholder="Invoice for client X" /></Field>
            <Field label="Type">
              <Select value={ef.type} onChange={(t) => setEf({ ...ef, type: t, category: CATEGORIES[t][0] })} options={TYPE_OPTIONS} ariaLabel="Type" />
            </Field>
            <Field label="Category">
              <Select value={ef.category} onChange={(category) => setEf({ ...ef, category })} options={catOptions(ef.type)} ariaLabel="Category" />
            </Field>
            <Field label="Project (optional)">
              <ProjectSelect projects={openProjects} clients={data.clients} value={ef.projectId} onChange={(projectId) => setEf({ ...ef, projectId })} />
            </Field>
            <Field label={`Amount excl. tax (${P.currency})`}><input className="input" inputMode="decimal" value={ef.amount} onChange={(e) => setEf({ ...ef, amount: e.target.value })} placeholder="0" /></Field>
            <button className="btn tall" type="submit" disabled={!efAmount}>Add</button>
          </form>
          {ef.amount.trim() && !efAmount && <div className="small" style={{ color: 'var(--red)' }}>{badAmount}</div>}
          {added && <div className="ok-msg" role="status">{added}</div>}
        </div>
      </div>

      <Clients data={data} update={update} />

      <div className="card" style={{ gap: '0.875rem' }}>
        <div className="head">
          <div>
            <div className="card-title">Subscriptions &amp; recurring <span className="small" style={{ fontWeight: 500 }}>{data.recurring.length}</span></div>
            <div className="small">Software, fixed subcontracting, rent, client retainers. Enter them once, they are counted automatically every month.</div>
          </div>
          {burn > 0 && <div className="pill" style={{ background: '#fff3de', color: '#b36b00', fontSize: '0.75rem' }}>{m(burn)} / month in fixed costs</div>}
        </div>
        <form className="form-grid" onSubmit={(e) => { e.preventDefault(); addRec(); }}>
          <Field label="Name"><input className="input" value={rf.label} onChange={(e) => setRf({ ...rf, label: e.target.value })} placeholder="Notion, freelancer, retainer…" /></Field>
          <Field label="Type">
            <Select value={rf.type} onChange={(t) => setRf({ ...rf, type: t, category: CATEGORIES[t][0] })} options={TYPE_OPTIONS} ariaLabel="Type" />
          </Field>
          <Field label="Category">
            <Select value={rf.category} onChange={(category) => setRf({ ...rf, category })} options={catOptions(rf.type)} ariaLabel="Category" />
          </Field>
          <Field label={`Amount excl. tax (${P.currency})`}><input className="input" inputMode="decimal" value={rf.amount} onChange={(e) => setRf({ ...rf, amount: e.target.value })} placeholder="0" /></Field>
          <Field label="Frequency">
            <Select value={rf.frequency} onChange={(frequency) => setRf({ ...rf, frequency })} options={FREQ_OPTIONS} ariaLabel="Frequency" />
          </Field>
          <Field label="Since"><DatePicker value={rf.start} onChange={(start) => setRf({ ...rf, start })} clearable={false} ariaLabel="Since" /></Field>
          <Field label="Project (optional)">
            <ProjectSelect projects={openProjects} clients={data.clients} value={rf.projectId} onChange={(projectId) => setRf({ ...rf, projectId })} />
          </Field>
          <button className="btn tall" type="submit" disabled={!rf.label.trim() || !rfAmount}>Add</button>
        </form>
        {rf.amount.trim() && !rfAmount && <div className="small" style={{ color: 'var(--red)' }}>{badAmount}</div>}
        {recAdded && <div className="ok-msg" role="status">{recAdded}</div>}
        {data.recurring.length > 0 && (
          <div className="table-wrap">
            <div className="trow th t-recur"><span>Name</span><span>Type</span><span>Category</span><span className="r">Amount</span><span className="r">Per month</span><span /><span /></div>
            {recSorted.map((r) => {
              const active = isActive(r);
              const future = isFuture(r);
              return (
                <div className={'trow t-recur' + (active || future ? '' : ' stopped')} key={r.id}>
                  <span style={{ minWidth: 0 }}>
                    <div className="ellipsis" style={{ fontWeight: 600 }}>{r.label}</div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--muted)' }}>
                      {future
                        ? `Starts ${fmtDate(r.start)}${r.end ? ` → ${fmtDate(r.end)}` : ''}`
                        : active
                          ? `Since ${fmtDate(r.start)}${r.end ? ` · ends ${fmtDate(r.end)}` : ''}`
                          : `Stopped · ${fmtDate(r.start)} → ${fmtDate(r.end)}`}
                      {r.projectId && projectName(r.projectId) ? ` · ${projectName(r.projectId)}` : ''}
                    </div>
                  </span>
                  <span className="tag" style={{ justifySelf: 'start', background: TYPE_META[r.type].bg, color: TYPE_META[r.type].color }}>{TYPE_META[r.type].short}</span>
                  <span className="ellipsis" style={{ color: 'var(--ink-2)' }}>{catLabel(r.category)}</span>
                  <span className="r">{m(r.amount)}<span className="small"> /{r.frequency === 'monthly' ? 'month' : 'year'}</span></span>
                  <span className="r" style={{ fontWeight: 700, color: r.type === 'revenue' ? 'var(--green)' : undefined }}>{m(monthlyEquivalent(r))}</span>
                  {future ? <span /> : (
                    <button className="btn sm ghost" style={{ padding: '0.25rem 0.375rem' }} onClick={() => (active ? stopRec(r) : restartRec(r))}>{active ? 'Stop' : 'Restart'}</button>
                  )}
                  <span className="row-actions">
                    <button className="icon-btn" onClick={() => setEditingRec(r)} title="Edit" aria-label={`Edit ${r.label}`}><IconPencil /></button>
                    <button className="icon-btn danger" onClick={() => void removeRec(r)} title="Delete" aria-label={`Delete ${r.label}`}>
                      <span style={{ fontSize: '1.0625rem', lineHeight: 1 }}>×</span>
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>


      <div className="card" style={{ gap: '0.875rem' }}>
        <div className="head">
          <div className="card-title">Logged transactions <span className="small" style={{ fontWeight: 500 }}>{data.entries.length}</span></div>
          <div className="row" style={{ gap: '0.5rem' }}>
            <Seg label="Filter by type" value={txFilter} onChange={setTxFilter} options={[['all', 'All'], ['revenue', 'Revenue'], ['direct', 'Direct'], ['opex', 'Operating']]} />
          </div>
        </div>
        <div className="table-wrap scroll">
          <div className="trow th t-entries"><span>Date</span><span>Label</span><span>Type</span><span>Category</span><span>Project</span><span className="r">Amount</span><span /></div>
          {entries.map((e) => (
            <div className="trow t-entries" key={e.id}>
              <span style={{ color: 'var(--muted)' }}>{fmtDate(e.date, true)}{e.date.slice(0, 4) !== String(new Date().getFullYear()) ? ` ${e.date.slice(0, 4)}` : ''}</span>
              <span className="ellipsis" style={{ fontWeight: 600 }}>{e.label}</span>
              <span className="tag" style={{ justifySelf: 'start', background: TYPE_META[e.type].bg, color: TYPE_META[e.type].color }}>{TYPE_META[e.type].short}</span>
              <span className="ellipsis" style={{ color: 'var(--ink-2)' }}>{catLabel(e.category)}</span>
              <span className="ellipsis" style={{ color: 'var(--muted)' }}>{projectName(e.projectId) || '—'}</span>
              <b className="r" style={{ color: e.type === 'revenue' ? 'var(--green)' : 'var(--ink)' }}>{e.type === 'revenue' ? '+ ' : '− '}{m(e.amount)}</b>
              <span className="row-actions">
                <button className="icon-btn" onClick={() => setEditingEntry(e)} title="Edit" aria-label={`Edit ${e.label}`}><IconPencil /></button>
                <button className="icon-btn danger" title="Delete" aria-label={`Delete ${e.label}`} onClick={() => update((d) => ({ ...d, entries: d.entries.filter((x) => x.id !== e.id) }))}>
                  <span style={{ fontSize: '1.0625rem', lineHeight: 1 }}>×</span>
                </button>
              </span>
            </div>
          ))}
          {entries.length === 0 && <div className="empty" style={{ marginTop: '0.75rem' }}>No transactions logged yet. Subscriptions are counted separately, automatically.</div>}
        </div>
      </div>

      <div className="card" style={{ gap: '0.75rem' }}>
        <div>
          <div className="card-title">{account ? 'Account & backup' : 'Backup'}</div>
          <div className="small">
            {account
              ? `Signed in as ${account.email}. Everything is saved online automatically; the export is a spare copy.`
              : 'Your data stays in this browser. Export a backup from time to time.'}
          </div>
        </div>
        <div className="row" style={{ gap: '0.5rem' }}>
          <button className="btn sm outline" onClick={exportJson}>Export (.json)</button>
          <button className="btn sm outline" onClick={() => fileRef.current?.click()}>Import a backup</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ''; }} />
          <button className="btn sm outline" onClick={() => void loadDemo()}>Load demo data</button>
          <button className="btn sm danger" onClick={() => void clearAll()}>Clear everything</button>
          {account && <button className="btn sm ghost" onClick={account.signOut}>Sign out</button>}
        </div>
      </div>
      {editingRec && <RecurringModal item={editingRec} data={data} update={update} onClose={() => setEditingRec(null)} />}
      {editingEntry && <EntryModal entry={editingEntry} data={data} update={update} onClose={() => setEditingEntry(null)} />}
    </section>
  );
}

/* ---------------- Clients ---------------- */

function Clients({ data, update }: { data: AppData; update: Update }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(() => nextColor(data.clients.map((c) => c.color)));
  const [dup, setDup] = useState('');
  const confirm = useConfirm();

  // A task counts for the client it is tagged with, or else for its project's client (as on the board).
  const projectClient = new Map(data.projects.map((p) => [p.id, p.clientId]));
  const uses = (id: string) => ({
    projects: data.projects.filter((p) => p.clientId === id).length,
    tasks: data.tasks.filter((t) => (t.clientId || projectClient.get(t.projectId)) === id).length,
  });
  const edit = (id: string, patch: Partial<Client>) =>
    update((d) => ({ ...d, clients: d.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const add = () => {
    const n = name.trim();
    if (!n) return;
    const existing = data.clients.find((c) => c.name.toLowerCase() === n.toLowerCase());
    if (existing) {
      setDup(`"${existing.name}" already exists. Change its colour with its dot below.`);
      return;
    }
    update((d) => ({ ...d, clients: [...d.clients, { id: uid(), name: n, color }].sort((a, b) => a.name.localeCompare(b.name, LOCALE)) }));
    setDup('');
    setName('');
    setColor(nextColor([...data.clients.map((c) => c.color), color]));
  };
  const remove = async (c: Client) => {
    const u = uses(c.id);
    const ok = await confirm({
      title: 'Delete this client?',
      message: (
        <>
          "{c.name}" will be deleted.{' '}
          {u.projects || u.tasks ? `Its ${plural(u.projects, 'project')} and ${plural(u.tasks, 'task')} will stay, with no client.` : 'It is not linked to any project or task.'}
        </>
      ),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    update((d) => ({
      ...d,
      clients: d.clients.filter((x) => x.id !== c.id),
      projects: d.projects.map((p) => (p.clientId === c.id ? { ...p, clientId: '' } : p)),
      tasks: d.tasks.map((t) => (t.clientId === c.id ? { ...t, clientId: '' } : t)),
    }));
  };

  return (
    <div className="card" style={{ gap: '0.875rem' }}>
      <div>
        <div className="card-title">Clients <span className="small" style={{ fontWeight: 500 }}>{data.clients.length}</span></div>
        <div className="small">Each client has its own colour, shown on its projects and as a label on its tasks. Click a dot to change it.</div>
      </div>
      <form className="row" style={{ gap: '0.625rem', flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); add(); }}>
        <ColorPicker value={color} onChange={setColor} label="New client colour" />
        <input className="input" value={name} onChange={(e) => { setName(e.target.value); setDup(''); }} placeholder="Client name" aria-label="Client name" />
        <button className="btn tall" type="submit" disabled={!name.trim()}>Add</button>
      </form>
      {dup && <div className="small" role="status" style={{ color: 'var(--red)' }}>{dup}</div>}
      {data.clients.length > 0 && (
        <div>
          {data.clients.map((c) => {
            const u = uses(c.id);
            return (
              <div className="client-row" key={c.id}>
                <ColorPicker value={c.color} onChange={(hex) => edit(c.id, { color: hex })} label={`${c.name} colour`} />
                <input
                  key={c.name}
                  className="input"
                  defaultValue={c.name}
                  aria-label={`Client name: ${c.name}`}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== c.name) edit(c.id, { name: v });
                    else e.target.value = c.name;
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
                <span className="client-use">{plural(u.projects, 'project')} · {plural(u.tasks, 'task')}</span>
                <button className="x" onClick={() => void remove(c)} aria-label={`Delete ${c.name}`}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Center-crop an image to a square and shrink it to 256px JPEG, small enough to live in the profile row. */
function squarePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas'));
      // Portraits: keep a bit more of the top, where the face usually is.
      const sy = img.height > img.width ? Math.max(0, (img.height - side) * 0.3) : (img.height - side) / 2;
      ctx.fillStyle = '#fff'; // JPEG has no transparency: without this, transparent PNGs turn black
      ctx.fillRect(0, 0, 256, 256);
      ctx.drawImage(img, (img.width - side) / 2, sy, side, side, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image'));
    };
    img.src = url;
  });
}
