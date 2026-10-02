export type ProjectStatus = 'Not started' | 'In progress' | 'On hold' | 'Done';
export type TaskColumn = 'todo' | 'ongoing' | 'blocked' | 'done';
/** revenue = money in; direct = cost tied to delivering a project; opex = running the business. */
export type EntryType = 'revenue' | 'direct' | 'opex';
export type Frequency = 'monthly' | 'yearly';

export interface Profile {
  name: string;
  email: string;
  company: string;
  currency: string;
  /** Kept for older saves; no longer shown or used. */
  targetPct: number;
  alertPct: number;
  /** Profile photo as a small data URL ('' = initials). */
  avatar: string;
  /** ETF followed by the investment card (Euronext ISIN + market), '' when not set. */
  investIsin: string;
  investMic: string;
  investName: string;
}

/** Money put into the S&P 500 ETF on a given day. */
export interface Investment {
  id: string;
  date: string;
  amount: number;
  /** Price per share actually paid, when known; 0 = use that day's market close. */
  price: number;
  /** That day's market close, saved when the amount is entered (0 = not known yet). */
  close: number;
}

/** A client, with the label color shown on its projects and task cards. */
export interface Client {
  id: string;
  name: string;
  color: string;
}

export interface Project {
  id: string;
  name: string;
  clientId: string;
  start: string;
  deadline: string;
  status: ProjectStatus;
  /** List order, smallest first. New projects get min - 1 so they show on top. */
  position: number;
  /** Brief shown on the project page. */
  brief: ProjectBrief;
}

export interface ProjectBrief {
  context: string;
  goal: string;
  deliverables: string;
  out: string;
}

export type NoteKind = 'note' | 'call' | 'decision' | 'feedback' | 'email';

/** A dated entry in a project's journal (call, decision, client feedback…). */
export interface Note {
  id: string;
  projectId: string;
  date: string;
  kind: NoteKind;
  body: string;
  /** When the note was written (ISO); orders notes of the same day. */
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  col: TaskColumn;
  clientId: string;
  projectId: string;
  due: string;
  note: string;
  /** Order on the board. Only the moved or added card gets a new value (max + 1). */
  position: number;
  /** When the task entered the Done column (ISO), '' otherwise. Hidden from the board a week later. */
  doneAt: string;
}

/** One-off transaction, typed in by hand. */
export interface Entry {
  id: string;
  date: string;
  label: string;
  type: EntryType;
  category: string;
  amount: number;
  projectId: string;
}

/** Subscription, retainer or fixed contractor fee that repeats until stopped. */
export interface Recurring {
  id: string;
  label: string;
  type: EntryType;
  category: string;
  amount: number;
  frequency: Frequency;
  start: string;
  end: string;
  projectId: string;
}

export interface AppData {
  profile: Profile;
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  entries: Entry[];
  recurring: Recurring[];
  notes: Note[];
  investments: Investment[];
}

/** A transaction as the finance views see it: either typed in, or generated from a recurring item. */
export interface Txn extends Entry {
  recurringId?: string;
}
