import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useConfirm } from '../components/Confirm';
import { DatePicker } from '../components/Calendar';
import { ClientChip } from '../components/pickers';
import { Select } from '../components/Select';
import { IconPencil, Seg } from '../components/ui';
import { BRIEF_FIELDS, NOTE_KINDS, PROJECT_STATUSES, STATUS_META, statusLabel } from '../lib/constants';
import { fmtDate, isoDate, uid } from '../lib/format';
import { isDay, sortNotes } from '../lib/store';
import type { AppData, Note, NoteKind, Project } from '../types';
import { newProject, ProjectModal } from './OverviewPage';

type Update = (fn: (d: AppData) => AppData) => void;
type Props = { data: AppData; update: Update; projectId: string; openProject: (id: string) => void; back: () => void };

const KIND_OPTIONS = NOTE_KINDS.map((k) => ({ value: k.key, label: k.label, color: k.color }));
const kindMeta = (k: NoteKind) => NOTE_KINDS.find((x) => x.key === k) ?? NOTE_KINDS[0];

export default function ProjectsPage(props: Props) {
  const project = props.data.projects.find((p) => p.id === props.projectId);
  if (props.projectId && !project) {
    return (
      <section className="section">
        <div className="empty">
          This project no longer exists. <button className="link-btn" onClick={props.back}>See all projects</button>
        </div>
      </section>
    );
  }
  return project ? <ProjectView {...props} project={project} /> : <ProjectList {...props} />;
}

/* ---------------- List ---------------- */

function ProjectList({ data, update, openProject }: Props) {
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('active');
  const [creating, setCreating] = useState<Project | null>(null);
  const clientOf = (id: string) => data.clients.find((c) => c.id === id);
  const list = data.projects.filter((p) => filter === 'all' || (filter === 'active' ? p.status !== 'Terminé' : p.status === 'Terminé'));
  const today = isoDate();

  return (
    <section className="section">
      <div className="head">
        <div className="head-title">
          <h1>Projects</h1>
          <span className="sub">Brief and journal for each project</span>
        </div>
        <div className="row">
          <Seg label="Filter projects" value={filter} onChange={setFilter} options={[['active', 'Active'], ['all', 'All'], ['done', 'Done']]} />
          <button className="btn" onClick={() => setCreating(newProject())}>+ New project</button>
        </div>
      </div>

      <div className="pcards">
        {list.map((p) => {
          const client = clientOf(p.clientId);
          const tasks = data.tasks.filter((t) => t.projectId === p.id);
          const done = tasks.filter((t) => t.col === 'done').length;
          const last = sortNotes(data.notes.filter((n) => n.projectId === p.id))[0];
          const briefFilled = BRIEF_FIELDS.filter((f) => p.brief[f.key].trim()).length;
          const meta = STATUS_META[p.status];
          const late = p.deadline && p.deadline < today && p.status !== 'Terminé';
          return (
            <button className="pcard" key={p.id} onClick={() => openProject(p.id)} style={{ borderTopColor: client?.color ?? 'var(--line)' }}>
              <div className="row" style={{ justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'nowrap' }}>
                {client ? <ClientChip client={client} size="sm" /> : <span className="small">No client</span>}
                <span className="pill" style={{ background: meta.bg, color: meta.color }}>{statusLabel(p.status)}</span>
              </div>
              <div className="pcard-name">{p.name}</div>
              <div className="small" style={{ color: late ? 'var(--red)' : undefined }}>
                {p.start || p.deadline ? `${fmtDate(p.start)} → ${fmtDate(p.deadline)}` : 'No dates'}
              </div>
              {tasks.length > 0 && (
                <span className="progress">
                  <span className="progress-bar"><div style={{ width: `${(done / tasks.length) * 100}%` }} /></span>
                  <span className="small" style={{ fontWeight: 600 }}>{done}/{tasks.length}</span>
                </span>
              )}
              <div className="pcard-foot">
                {last ? (
                  <span className="ellipsis">
                    <span style={{ color: kindMeta(last.kind).color, fontWeight: 600 }}>{kindMeta(last.kind).label}</span> · {fmtDate(last.date, true)} · {last.body}
                  </span>
                ) : briefFilled ? (
                  <span>Brief {briefFilled}/4 · no notes yet</span>
                ) : (
                  <span>Brief to fill in</span>
                )}
              </div>
            </button>
          );
        })}
        {list.length === 0 && (
          <div className="empty" style={{ gridColumn: '1 / -1' }}>
            {data.projects.length === 0 ? 'Create your first project to give it a brief and a journal.' : 'No projects match this filter.'}
          </div>
        )}
      </div>
      {creating && <ProjectModal project={creating} data={data} update={update} onClose={() => setCreating(null)} onCreated={openProject} />}
    </section>
  );
}

/* ---------------- One project ---------------- */

function ProjectView({ data, update, project: p, back }: Props & { project: Project }) {
  const [editing, setEditing] = useState(false);
  const client = data.clients.find((c) => c.id === p.clientId);
  const tasks = data.tasks.filter((t) => t.projectId === p.id);
  const done = tasks.filter((t) => t.col === 'done').length;
  const meta = STATUS_META[p.status];
  const today = isoDate();
  const late = p.deadline && p.deadline < today && p.status !== 'Terminé';

  const cycle = () =>
    update((d) => ({
      ...d,
      projects: d.projects.map((x) =>
        x.id === p.id ? { ...x, status: PROJECT_STATUSES[(PROJECT_STATUSES.indexOf(x.status) + 1) % PROJECT_STATUSES.length] } : x,
      ),
    }));

  return (
    <section className="section loose">
      <button className="crumb-link small" style={{ alignSelf: 'flex-start' }} onClick={back}>← All projects</button>

      <div className="card phead" style={{ borderTopColor: client?.color ?? 'var(--line)' }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: '0.625rem' }}>
            <h1 className="ellipsis" style={{ maxWidth: '100%' }}>{p.name}</h1>
            <button className="icon-btn" onClick={() => setEditing(true)} title="Edit project" aria-label="Edit project"><IconPencil /></button>
          </div>
          <div className="row" style={{ gap: '0.5rem', marginTop: '0.375rem' }}>
            {client ? <ClientChip client={client} /> : <span className="small">No client</span>}
            <button className="pill" style={{ background: meta.bg, color: meta.color }} onClick={cycle} title="Click to change">{statusLabel(p.status)}</button>
            <span className="small" style={{ color: late ? 'var(--red)' : undefined, fontWeight: late ? 600 : undefined }}>
              {fmtDate(p.start)} → {fmtDate(p.deadline)}{late ? ' · overdue' : ''}
            </span>
          </div>
        </div>
        <div className="phead-progress">
          <span className="small">Tasks {done}/{tasks.length}</span>
          <span className="progress-bar"><div style={{ width: tasks.length ? `${(done / tasks.length) * 100}%` : 0 }} /></span>
        </div>
      </div>

      <div className="pgrid">
        <Brief project={p} update={update} />
        <Journal project={p} notes={data.notes} update={update} />
      </div>

      {editing && <ProjectModal project={p} data={data} update={update} onClose={() => setEditing(false)} />}
    </section>
  );
}

/* ---------------- Brief ---------------- */

function Brief({ project, update }: { project: Project; update: Update }) {
  const set = (key: keyof Project['brief'], value: string) =>
    update((d) => ({ ...d, projects: d.projects.map((x) => (x.id === project.id ? { ...x, brief: { ...x.brief, [key]: value } } : x)) }));
  return (
    <div className="card" style={{ gap: '0.75rem' }}>
      <div>
        <div className="card-title">Brief</div>
        <div className="small">What you reread before a call. Saved as you type.</div>
      </div>
      {BRIEF_FIELDS.map((f) => (
        <label className="brief-field" key={f.key}>
          <span className="brief-label">{f.label}</span>
          <AutoText value={project.brief[f.key]} onChange={(v) => set(f.key, v)} placeholder={f.placeholder} />
        </label>
      ))}
    </div>
  );
}

/** Textarea that grows with its content. */
function AutoText({ value, onChange, placeholder, autoFocus, onKeyDown, className = 'input auto-text' }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useEffect(fit, [value]);
  // Width changes (window resize, sidebar, phone rotation) change the height the text needs.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) {
        w = el.clientWidth;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <textarea
      ref={ref}
      className={className}
      rows={2}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* ---------------- Journal ---------------- */

function Journal({ project, notes, update }: { project: Project; notes: Note[]; update: Update }) {
  const [kind, setKind] = useState<NoteKind>('note');
  const [date, setDate] = useState(isoDate());
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const confirm = useConfirm();

  const list = sortNotes(notes.filter((n) => n.projectId === project.id));

  const add = () => {
    const text = body.trim();
    if (!text || !isDay(date)) return;
    update((d) => ({ ...d, notes: [...d.notes, { id: uid(), projectId: project.id, date, kind, body: text, createdAt: new Date().toISOString() }] }));
    setBody('');
    setKind('note');
  };
  const remove = async (n: Note) => {
    const ok = await confirm({ title: 'Delete this note?', message: n.body.slice(0, 160), confirmLabel: 'Delete', danger: true });
    if (ok) update((d) => ({ ...d, notes: d.notes.filter((x) => x.id !== n.id) }));
  };
  const save = (n: Note) => update((d) => ({ ...d, notes: d.notes.map((x) => (x.id === n.id ? n : x)) }));

  return (
    <div className="card" style={{ gap: '0.875rem' }}>
      <div>
        <div className="card-title">Journal <span className="small" style={{ fontWeight: 500 }}>{list.length}</span></div>
        <div className="small">Calls, decisions, client feedback: the project's memory, newest first.</div>
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <AutoText
          value={body}
          onChange={setBody}
          placeholder="What happened? (⌘ + Enter to add)"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              add();
            }
          }}
        />
        <div className="note-row">
          <div className="note-ctl">
            <Select value={kind} onChange={setKind} options={KIND_OPTIONS} size="sm" ariaLabel="Note type" />
          </div>
          <div className="note-ctl"><DatePicker value={date} onChange={setDate} clearable={false} size="sm" ariaLabel="Date" /></div>
          <div className="note-btns">
            <button className="btn sm" type="submit" disabled={!body.trim()}>Add</button>
          </div>
        </div>
      </form>

      <div className="notes">
        {list.map((n) =>
          editingId === n.id ? (
            <NoteEditor key={n.id} note={n} onCancel={() => setEditingId(null)} onSave={(x) => { save(x); setEditingId(null); }} />
          ) : (
            <div className="note" key={n.id}>
              <div className="note-meta">
                <span className="note-date">{fmtDate(n.date, n.date.slice(0, 4) === String(new Date().getFullYear()))}</span>
                <span className="note-kind" style={{ background: kindMeta(n.kind).bg, color: kindMeta(n.kind).color }}>{kindMeta(n.kind).label}</span>
                <span className="note-actions">
                  <button className="icon-btn" onClick={() => setEditingId(n.id)} title="Edit" aria-label="Edit note"><IconPencil /></button>
                  <button className="icon-btn danger" onClick={() => void remove(n)} title="Delete" aria-label="Delete note"><span style={{ fontSize: '1.0625rem', lineHeight: 1 }}>×</span></button>
                </span>
              </div>
              <div className="note-body">{linkify(n.body)}</div>
            </div>
          ),
        )}
        {list.length === 0 && <div className="empty">Log every call, decision or client feedback here. In three months, you'll know exactly who said what.</div>}
      </div>
    </div>
  );
}

function NoteEditor({ note, onSave, onCancel }: { note: Note; onSave: (n: Note) => void; onCancel: () => void }) {
  const [f, setF] = useState(note);
  const submit = () => {
    if (!f.body.trim() || !isDay(f.date)) return;
    onSave({ ...f, body: f.body.trim() });
  };
  return (
    <div className="note is-editing">
      <AutoText
        value={f.body}
        onChange={(body) => setF({ ...f, body })}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      <div className="note-row">
        <div className="note-ctl">
          <Select value={f.kind} onChange={(kind) => setF({ ...f, kind })} options={KIND_OPTIONS} size="sm" ariaLabel="Note type" />
        </div>
        <div className="note-ctl"><DatePicker value={f.date} onChange={(date) => setF({ ...f, date })} clearable={false} size="sm" ariaLabel="Date" /></div>
        <div className="note-btns">
          <button className="btn sm ghost" type="button" onClick={onCancel}>Cancel</button>
          <button className="btn sm" type="button" onClick={submit} disabled={!f.body.trim()}>Save</button>
        </div>
      </div>
    </div>
  );
}

/** Plain text with clickable links (http/https only). */
function linkify(text: string): ReactNode {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return parts.map((part, i) => {
    if (!/^https?:\/\//.test(part)) return <Fragment key={i}>{part}</Fragment>;
    // "see https://x.com/a." -> the final dot is punctuation, not part of the link.
    let url = part;
    let tail = '';
    const m = url.match(/[.,;:!?»\]]+$/);
    if (m) {
      tail = m[0];
      url = url.slice(0, -tail.length);
    }
    if (url.endsWith(')') && !url.includes('(')) {
      tail = ')' + tail;
      url = url.slice(0, -1);
    }
    return (
      <Fragment key={i}>
        <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
        {tail}
      </Fragment>
    );
  });
}
