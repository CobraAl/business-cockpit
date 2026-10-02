import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import { useConfirm } from '../components/Confirm';
import { DatePicker } from '../components/Calendar';
import { ClientChip, ClientDot, ClientSelect, ProjectSelect } from '../components/pickers';
import { Select } from '../components/Select';
import { Field, IconPencil, Modal, Seg } from '../components/ui';
import { COLUMNS, PROJECT_STATUSES, STATUS_META, statusLabel } from '../lib/constants';
import { fmtDate, isoDate, uid } from '../lib/format';
import { ARCHIVE_AFTER_DAYS, isArchived, isDay, nextPosition, placeTask, topPosition, withCol } from '../lib/store';
import type { AppData, Project, Task, TaskColumn } from '../types';

type Update = (fn: (d: AppData) => AppData) => void;

const dueBeforeStart = (p: { start: string; deadline: string }) => !!p.start && !!p.deadline && p.deadline < p.start;

/** Fields of `edited` that differ from `original`. */
function changedFields<T extends object>(original: T, edited: T): Partial<T> {
  return Object.fromEntries(Object.entries(edited).filter(([k, v]) => v !== original[k as keyof T])) as Partial<T>;
}

const emptyProject = (): Omit<Project, 'id' | 'position'> => ({
  name: '', clientId: '', start: isoDate(), deadline: '', status: 'Not started',
  brief: { context: '', goal: '', deliverables: '', out: '' },
});
const STATUS_OPTIONS = PROJECT_STATUSES.map((s) => ({ value: s, label: statusLabel(s), color: STATUS_META[s].color }));
const COLUMN_OPTIONS = COLUMNS.map((c) => ({ value: c.key, label: c.label, color: c.dot }));

export default function OverviewPage({ data, update, openProject }: { data: AppData; update: Update; openProject: (id: string) => void }) {
  return (
    <>
      <Projects data={data} update={update} openProject={openProject} />
      <Board data={data} update={update} />
    </>
  );
}

/* ---------------- Projects ---------------- */

function Projects({ data, update, openProject }: { data: AppData; update: Update; openProject: (id: string) => void }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('active');
  const [showForm, setShowForm] = useState(false);
  const [pf, setPf] = useState(emptyProject);
  const [editing, setEditing] = useState<Project | null>(null);
  // Folded by default so the task planner is what you see first; remembered in this browser.
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem('cockpit.projectsOpen') === '1';
    } catch {
      return false;
    }
  });
  const setOpen = (v: boolean) => {
    setOpenState(v);
    try {
      localStorage.setItem('cockpit.projectsOpen', v ? '1' : '0');
    } catch {
      /* private mode: just not remembered */
    }
  };
  const confirm = useConfirm();
  const today = isoDate();
  const clientOf = (id: string) => data.clients.find((c) => c.id === id);

  const list = data.projects.filter((p) => filter === 'all' || (filter === 'active' ? p.status !== 'Done' : p.status === 'Done'));
  const activeCount = data.projects.filter((p) => p.status !== 'Done').length;

  const add = () => {
    if (!pf.name.trim() || (pf.start && !isDay(pf.start)) || (pf.deadline && !isDay(pf.deadline)) || dueBeforeStart(pf)) return;
    update((d) => ({
      ...d,
      projects: [{ id: uid(), ...pf, name: pf.name.trim(), position: topPosition(d.projects) }, ...d.projects],
    }));
    setPf(emptyProject());
    setShowForm(false);
  };
  const cycle = (id: string) =>
    update((d) => ({
      ...d,
      projects: d.projects.map((x) =>
        x.id === id ? { ...x, status: PROJECT_STATUSES[(PROJECT_STATUSES.indexOf(x.status) + 1) % PROJECT_STATUSES.length] } : x,
      ),
    }));
  const remove = async (p: Project) => {
    const ok = await confirm({
      title: 'Delete this project?',
      message: <>"{p.name}" will be deleted, along with its brief and journal. Its tasks and transactions are kept, with no project.</>,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    update((d) => ({
      ...d,
      projects: d.projects.filter((x) => x.id !== p.id),
      tasks: d.tasks.map((t) => (t.projectId === p.id ? { ...t, projectId: '' } : t)),
      entries: d.entries.map((e) => (e.projectId === p.id ? { ...e, projectId: '' } : e)),
      recurring: d.recurring.map((r) => (r.projectId === p.id ? { ...r, projectId: '' } : r)),
      notes: d.notes.filter((n) => n.projectId !== p.id),
    }));
  };

  return (
    <section className="section">
      <div className="head">
        <button className="fold" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="projects-panel">
          <svg className="fold-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
          <h1>Active projects</h1>
          <span className="sub">{activeCount} active · {data.projects.length} in total</span>
        </button>
        {open && (
          <div className="row">
            <Seg label="Filter projects" value={filter} onChange={setFilter} options={[['active', 'Active'], ['all', 'All'], ['done', 'Done']]} />
            <button className="btn" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>+ New project</button>
          </div>
        )}
      </div>

      {open && showForm && (
        <form className="proj-form form-grid" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <Field label="Project name">
            <input className="input" autoFocus value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} placeholder="Website redesign…" />
          </Field>
          <Field label="Client">
            <ClientSelect data={data} update={update} value={pf.clientId} onChange={(clientId) => setPf({ ...pf, clientId })} />
          </Field>
          <Field label="Start">
            <DatePicker value={pf.start} onChange={(start) => setPf({ ...pf, start })} placeholder="No start date" ariaLabel="Start" />
          </Field>
          <Field label="Due">
            <DatePicker value={pf.deadline} onChange={(deadline) => setPf({ ...pf, deadline })} min={pf.start || undefined} placeholder="No due date" ariaLabel="Due" />
          </Field>
          <Field label="Status">
            <Select value={pf.status} onChange={(status) => setPf({ ...pf, status })} options={STATUS_OPTIONS} ariaLabel="Status" />
          </Field>
          <button className="btn dark tall" type="submit" disabled={!pf.name.trim() || dueBeforeStart(pf)}>Add</button>
          {dueBeforeStart(pf) && <div className="small form-error">The due date can't be before the start date.</div>}
        </form>
      )}

      {open && <div className="proj-list" id="projects-panel">
        {list.map((p) => {
          const tasks = data.tasks.filter((t) => t.projectId === p.id);
          const done = tasks.filter((t) => t.col === 'done').length;
          const late = p.deadline && p.deadline < today && p.status !== 'Done';
          const meta = STATUS_META[p.status] ?? STATUS_META['On hold'];
          return (
            <div className="proj" key={p.id}>
              <div className="cell c-name">
                <span className="cell-k">Project name</span>
                <button className="proj-name ellipsis" onClick={() => openProject(p.id)} title="Open project">{p.name}</button>
              </div>
              <div className="cell c-client">
                <span className="cell-k">Client</span>
                <span className="client">
                  <ClientDot client={clientOf(p.clientId)} />
                  <span className="ellipsis">{clientOf(p.clientId)?.name || '—'}</span>
                </span>
              </div>
              <div className="cell c-start">
                <span className="cell-k">Start</span>
                <span className="cell-v">{fmtDate(p.start)}</span>
              </div>
              <div className="cell c-deadline">
                <span className="cell-k">Due</span>
                <span className="cell-v" style={{ color: late ? 'var(--red)' : undefined, fontWeight: late ? 600 : undefined }} title={late ? 'Overdue' : undefined}>{fmtDate(p.deadline)}</span>
              </div>
              <div className="cell c-progress">
                <span className="cell-k">Tasks</span>
                {tasks.length ? (
                  <span className="progress">
                    <span className="progress-bar"><div style={{ width: `${(done / tasks.length) * 100}%` }} /></span>
                    <span className="small" style={{ fontWeight: 600 }}>{done}/{tasks.length}</span>
                  </span>
                ) : (
                  <span className="cell-v" style={{ color: 'var(--faint)' }}>—</span>
                )}
              </div>
              <div className="cell c-status">
                <span className="cell-k">Status</span>
                <button className="pill" style={{ background: meta.bg, color: meta.color }} onClick={() => cycle(p.id)} title="Click to change">{statusLabel(p.status)}</button>
              </div>
              <div className="c-actions">
                <button className="icon-btn" onClick={() => setEditing(p)} title="Edit" aria-label={`Edit ${p.name}`}>
                  <IconPencil />
                </button>
                <button className="icon-btn danger" onClick={() => void remove(p)} title="Delete" aria-label={`Delete ${p.name}`}>
                  <span style={{ fontSize: '1.125rem', lineHeight: 1 }}>×</span>
                </button>
              </div>
            </div>
          );
        })}
        {list.length === 0 && (
          <div className="empty">
            {data.projects.length === 0 ? 'No projects yet. Add your first one with "New project".' : 'No projects match this filter.'}
          </div>
        )}
      </div>}

      {editing && <ProjectModal project={editing} data={data} onClose={() => setEditing(null)} update={update} />}
    </section>
  );
}

/** Edit a project, or create one when `project` is not in the data yet (see newProject). */
export function ProjectModal({ project, data, onClose, update, onCreated }: {
  project: Project;
  data: AppData;
  onClose: () => void;
  update: Update;
  onCreated?: (id: string) => void;
}) {
  // Snapshot at opening: the diff below must only contain what was changed in this form,
  // even if the project is refreshed from another device while the modal is open.
  const [orig] = useState(project);
  const [f, setF] = useState(project);
  const [creating] = useState(() => !data.projects.some((p) => p.id === project.id));
  const save = () => {
    if (!f.name.trim() || (f.start && !isDay(f.start)) || (f.deadline && !isDay(f.deadline)) || dueBeforeStart(f)) return;
    if (creating) {
      update((d) => ({ ...d, projects: [{ ...f, name: f.name.trim(), position: topPosition(d.projects) }, ...d.projects] }));
      onClose();
      onCreated?.(f.id);
      return;
    }
    const changed = changedFields(orig, { ...f, name: f.name.trim() });
    update((d) => ({ ...d, projects: d.projects.map((p) => (p.id === f.id ? { ...p, ...changed } : p)) }));
    onClose();
  };
  return (
    <Modal title={creating ? 'New project' : 'Edit project'} onClose={onClose}>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Project name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Client"><ClientSelect data={data} update={update} value={f.clientId} onChange={(clientId) => setF({ ...f, clientId })} /></Field>
        <Field label="Start"><DatePicker value={f.start} onChange={(start) => setF({ ...f, start })} placeholder="No start date" ariaLabel="Start" /></Field>
        <Field label="Due"><DatePicker value={f.deadline} onChange={(deadline) => setF({ ...f, deadline })} min={f.start || undefined} placeholder="No due date" ariaLabel="Due" /></Field>
        <Field label="Status">
          <Select value={f.status} onChange={(status) => setF({ ...f, status })} options={STATUS_OPTIONS} ariaLabel="Status" />
        </Field>
        <button className="btn tall" type="submit" disabled={!f.name.trim() || dueBeforeStart(f)}>{creating ? 'Create' : 'Save'}</button>
        {dueBeforeStart(f) && <div className="small form-error">The due date can't be before the start date.</div>}
      </form>
    </Modal>
  );
}

export const newProject = (): Project => ({ id: uid(), ...emptyProject(), position: 0 });

/* ---------------- Kanban ---------------- */

function Board({ data, update }: { data: AppData; update: Update }) {
  const [adding, setAdding] = useState<TaskColumn | null>(null);
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [clientId, setClientId] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  // Done tasks older than a week stay in the database but leave the board, unless shown on demand.
  const [showArchived, setShowArchived] = useState(false);
  const now = Date.now();
  // Where a dragged card would land: in `col`, just before card `before` (null = at the end).
  const [drop, setDrop] = useState<{ col: TaskColumn; before: string | null } | null>(null);
  // Card to refocus after a keyboard move (React may move the focused node).
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusId) return;
    document.querySelector<HTMLElement>(`.task[data-id="${focusId}"]`)?.focus();
    setFocusId(null);
  }, [focusId, data.tasks]);
  const [editing, setEditing] = useState<Task | null>(null);
  const today = isoDate();
  const projectOf = (id: string) => data.projects.find((p) => p.id === id);
  const clientOf = (id: string) => data.clients.find((c) => c.id === id);
  const openProjects = data.projects.filter((p) => p.status !== 'Done');
  // A task follows its project's client unless another client is picked for it.
  const pickProject = (id: string) => {
    setProjectId(id);
    if (clientId && clientId === projectOf(id)?.clientId) setClientId('');
  };

  const place = (id: string, col: TaskColumn, before: string | null) => update((d) => placeTask(d, id, col, before));
  // Cards as shown in a column (archived ones only when displayed), for keyboard / arrow moves.
  const ordered = (col: TaskColumn) =>
    data.tasks.filter((t) => t.col === col && (showArchived || !isArchived(t, now))).sort((a, b) => a.position - b.position);
  // Keyboard and phone buttons: one step up/down, or to the next/previous column (at the end).
  const step = (t: Task, dir: 'up' | 'down' | 'left' | 'right') => {
    const list = ordered(t.col);
    const i = list.findIndex((x) => x.id === t.id);
    if (dir === 'up' && i > 0) place(t.id, t.col, list[i - 1].id);
    else if (dir === 'down' && i < list.length - 1) place(t.id, t.col, list[i + 2]?.id ?? null);
    else if (dir === 'left' || dir === 'right') {
      const k = COLUMNS.findIndex((c) => c.key === t.col) + (dir === 'left' ? -1 : 1);
      if (k < 0 || k >= COLUMNS.length) return;
      place(t.id, COLUMNS[k].key, null);
    } else return;
    setFocusId(t.id);
  };
  // Phone arrows: keep the moved card under the finger, so a second tap moves the same card again.
  const anchor = useRef<{ id: string; top: number; at: number; pending: boolean } | null>(null);
  const tapStep = (e: React.MouseEvent, t: Task, dir: 'up' | 'down') => {
    const last = anchor.current;
    // A tap right after a move that lands on another card is almost always the same finger again.
    if (last && last.id !== t.id && Date.now() - last.at < 450) return;
    const card = (e.currentTarget as HTMLElement).closest('.task');
    anchor.current = { id: t.id, top: card?.getBoundingClientRect().top ?? 0, at: Date.now(), pending: true };
    step(t, dir);
  };
  useLayoutEffect(() => {
    const a = anchor.current;
    if (!a?.pending) return;
    a.pending = false; // only the render caused by this tap
    const el = document.querySelector<HTMLElement>(`.task[data-id="${a.id}"]`);
    if (el) window.scrollBy(0, el.getBoundingClientRect().top - a.top);
  }, [data.tasks]);
  const confirm = useConfirm();
  const removeTask = async (t: Task) => {
    // No undo: on touch screens, where a mis-tap is easy, ask first.
    if (window.matchMedia('(hover: none)').matches) {
      const ok = await confirm({ title: 'Delete this task?', message: t.title, confirmLabel: 'Delete', danger: true });
      if (!ok) return;
    }
    update((d) => ({ ...d, tasks: d.tasks.filter((x) => x.id !== t.id) }));
  };

  // The card whose top half the pointer is above; null means the end of the column.
  const dropBefore = (e: DragEvent<HTMLDivElement>) => {
    const cards = [...e.currentTarget.querySelectorAll<HTMLElement>('.task[data-id]')];
    const hit = cards.find((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    return hit?.dataset.id ?? null;
  };
  // A drop that would leave the card where it is shows no indicator.
  const isNoop = (col: TaskColumn, before: string | null) => {
    if (!dragId) return true;
    const t = data.tasks.find((x) => x.id === dragId);
    if (!t || t.col !== col) return false;
    if (before === dragId) return true;
    const list = ordered(col);
    const i = list.findIndex((x) => x.id === dragId);
    return (list[i + 1]?.id ?? null) === before;
  };

  const add = () => {
    const t = title.trim();
    if (!t || !adding) return;
    update((d) => ({
      ...d,
      tasks: [
        ...d.tasks,
        {
          id: uid(), title: t, col: adding,
          clientId: d.clients.some((c) => c.id === clientId) ? clientId : '',
          projectId: d.projects.some((p) => p.id === projectId) ? projectId : '',
          due: '', note: '', position: nextPosition(d.tasks), doneAt: adding === 'done' ? new Date().toISOString() : '',
        },
      ],
    }));
    setTitle('');
  };
  const startAdd = (col: TaskColumn) => {
    setAdding(col);
    setTitle('');
    setProjectId('');
    setClientId('');
  };

  const onDrop = (e: DragEvent<HTMLDivElement>, col: TaskColumn) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    if (id) place(id, col, dropBefore(e));
    setDragId(null);
    setDrop(null);
  };

  return (
    <section className="section">
      <div className="head-title">
        <h2>Tasks</h2>
        <span className="sub">Drag cards to reorder them or move them to another column, click a card to edit it</span>
      </div>
      <div className="board">
        {COLUMNS.map((c) => {
          const all = data.tasks.filter((t) => t.col === c.key).sort((a, b) => a.position - b.position);
          const archived = all.filter((t) => isArchived(t, now)).length;
          const tasks = showArchived ? all : all.filter((t) => !isArchived(t, now));
          return (
            <div
              key={c.key}
              className={'col' + (drop?.col === c.key && dragId && !(drop && isNoop(c.key, drop.before)) ? ' over' : '')}
              onDragOver={(e) => {
                e.preventDefault();
                const before = dropBefore(e);
                if (drop?.col !== c.key || drop.before !== before) setDrop({ col: c.key, before });
              }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null); }}
              onDrop={(e) => onDrop(e, c.key)}
            >
              <div className="col-head">
                <div className="col-name"><span className="dot round" style={{ background: c.dot }} />{c.label}</div>
                <span className="count">{tasks.length}</span>
              </div>
              {tasks.map((t, idx) => {
                const project = projectOf(t.projectId);
                const pn = project?.name ?? '';
                const client = clientOf(t.clientId) ?? clientOf(project?.clientId ?? '');
                const late = t.due && t.due < today && t.col !== 'done';
                return (
                  <div
                    key={t.id}
                    data-id={t.id}
                    className={
                      'task' +
                      (dragId === t.id ? ' dragging' : '') +
                      (drop?.col === c.key && drop.before === t.id && !isNoop(c.key, t.id) ? ' drop-before' : '')
                    }
                    draggable
                    tabIndex={0}
                    role="button"
                    aria-label={`Edit task ${t.title}. Alt + arrow keys to move it.`}
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; setDragId(t.id); }}
                    onDragEnd={() => { setDragId(null); setDrop(null); }}
                    onClick={() => setEditing(t)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.altKey && e.key.startsWith('Arrow')) {
                        e.preventDefault();
                        step(t, e.key.slice(5).toLowerCase() as 'up' | 'down' | 'left' | 'right');
                        return;
                      }
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(t); }
                    }}
                  >
                    {client && <ClientChip client={client} size="sm" />}
                    <div className="task-top">
                      <span className="task-title">{t.title}</span>
                      <button className="x" aria-label="Delete task" onClick={(e) => { e.stopPropagation(); void removeTask(t); }}>×</button>
                    </div>
                    <div className="task-foot">
                      {(pn || t.due || t.note) && (
                        <div className="task-meta">
                          {pn && <span className="tag">{pn}</span>}
                          {t.due && <span className={'due' + (late ? ' late' : '')}>{t.due === today ? 'Today' : fmtDate(t.due, true)}</span>}
                          {t.note && <span className="note-flag" title={t.note}>≡ note</span>}
                        </div>
                      )}
                      {/* Touch screens only (no drag and drop there): bottom right, away from the delete button. */}
                      <span className="task-order">
                        <button className="order-btn" aria-label="Move up" disabled={idx === 0} onClick={(e) => { e.stopPropagation(); tapStep(e, t, 'up'); }}>↑</button>
                        <button className="order-btn" aria-label="Move down" disabled={idx === tasks.length - 1} onClick={(e) => { e.stopPropagation(); tapStep(e, t, 'down'); }}>↓</button>
                      </span>
                    </div>
                  </div>
                );
              })}
              {drop?.col === c.key && drop.before === null && !isNoop(c.key, null) && <div className="drop-end" />}
              {archived > 0 && (
                <button className="archived-link" onClick={() => setShowArchived(!showArchived)} aria-pressed={showArchived}>
                  {showArchived ? `Hide ${archived} archived` : `${archived} archived (done over ${ARCHIVE_AFTER_DAYS} days ago) · show`}
                </button>
              )}
              {adding === c.key ? (
                <form className="add-box" onSubmit={(e) => { e.preventDefault(); add(); }}>
                  <input
                    className="input"
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setAdding(null)}
                    placeholder="Task title"
                  />
                  <ClientSelect data={data} update={update} value={clientId} onChange={setClientId} size="sm" inherited={clientOf(projectOf(projectId)?.clientId ?? '')} />
                  <ProjectSelect projects={openProjects} clients={data.clients} value={projectId} onChange={pickProject} size="sm" />
                  <div className="row" style={{ gap: '0.5rem' }}>
                    <button className="btn sm" type="submit">Add</button>
                    <button className="btn sm ghost" type="button" onClick={() => setAdding(null)}>Close</button>
                  </div>
                </form>
              ) : (
                <button className="add-link" onClick={() => startAdd(c.key)}>+ Add a task</button>
              )}
            </div>
          );
        })}
      </div>
      {editing && <TaskModal task={editing} data={data} onClose={() => setEditing(null)} update={update} />}
    </section>
  );
}

function TaskModal({ task, data, onClose, update }: { task: Task; data: AppData; onClose: () => void; update: Update }) {
  const [f, setF] = useState(task);
  const projectClient = (id: string) => data.clients.find((c) => c.id === data.projects.find((p) => p.id === id)?.clientId);
  // The task's own client only overrides its project's: drop it when it would say the same thing.
  const pickProject = (projectId: string) =>
    setF({ ...f, projectId, clientId: f.clientId && f.clientId === projectClient(projectId)?.id ? '' : f.clientId });
  const save = () => {
    if (!f.title.trim() || (f.due && !isDay(f.due))) return;
    // Apply only what was changed in this form, on top of the current row (it may have been
    // updated from another device while the form was open).
    const changed = changedFields(task, { ...f, title: f.title.trim() });
    update((d) => ({
      ...d,
      tasks: d.tasks.map((t) =>
        t.id === f.id
          ? { ...withCol({ ...t, ...changed, col: t.col }, changed.col ?? t.col), position: 'col' in changed ? nextPosition(d.tasks) : t.position }
          : t,
      ),
    }));
    onClose();
  };
  const remove = () => {
    update((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== f.id) }));
    onClose();
  };
  return (
    <Modal title="Task" onClose={onClose}>
      <form className="section" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Title"><input className="input" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <div className="form-grid">
          <Field label="Client">
            <ClientSelect
              data={data}
              update={update}
              value={f.clientId}
              onChange={(clientId) => setF({ ...f, clientId: clientId === projectClient(f.projectId)?.id ? '' : clientId })}
              inherited={projectClient(f.projectId)}
            />
          </Field>
          <Field label="Project">
            <ProjectSelect projects={data.projects} clients={data.clients} value={f.projectId} onChange={pickProject} />
          </Field>
          <Field label="Column">
            <Select value={f.col} onChange={(col) => setF({ ...f, col })} options={COLUMN_OPTIONS} ariaLabel="Column" />
          </Field>
          <Field label="Due">
            <DatePicker value={f.due} onChange={(due) => setF({ ...f, due })} placeholder="No due date" ariaLabel="Due" />
          </Field>
        </div>
        <Field label="Note"><textarea className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Details, link, next step…" /></Field>
        <div className="modal-foot">
          <button className="btn sm danger" type="button" onClick={remove}>Delete</button>
          <div className="row" style={{ gap: '0.5rem' }}>
            <button className="btn sm ghost" type="button" onClick={onClose}>Cancel</button>
            <button className="btn sm" type="submit">Save</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
