import type { EntryType, NoteKind, ProjectStatus, TaskColumn } from '../types';

/*
 * Stored values (project statuses, categories, note kinds) keep the keys they were created with,
 * which are partly French: the database constrains them and existing rows use them. Only the
 * labels below are shown in the UI.
 */
export const LOCALE = 'en-GB';

export const PROJECT_STATUSES: ProjectStatus[] = ['Not started', 'In progress', 'On hold', 'Done'];

export const STATUS_META: Record<ProjectStatus, { label: string; bg: string; color: string }> = {
  'In progress': { label: 'In progress', bg: '#fff3de', color: '#b36b00' },
  'Not started': { label: 'Not started', bg: '#fde8e8', color: '#c43d3d' },
  'On hold': { label: 'On hold', bg: '#eceef2', color: '#5b6270' },
  'Done': { label: 'Done', bg: '#e3f6e8', color: '#1f8a47' },
};
export const statusLabel = (s: ProjectStatus) => STATUS_META[s]?.label ?? s;

export const COLUMNS: { key: TaskColumn; label: string; dot: string }[] = [
  { key: 'todo', label: 'To do', dot: '#9aa0ae' },
  { key: 'ongoing', label: 'In progress', dot: '#e9a23b' },
  { key: 'blocked', label: 'Blocked', dot: '#e0525a' },
  { key: 'done', label: 'Done', dot: '#2fa565' },
];

export const CATEGORIES: Record<EntryType, string[]> = {
  revenue: ['Services', 'Subscriptions / retainers', 'Products', 'Other income'],
  direct: ['Subcontracting', 'Project materials', 'Client licences'],
  opex: [
    'Software & SaaS',
    'Marketing',
    'Rent & office',
    'Travel',
    'Bank fees',
    'Social charges & taxes',
    'Training',
    'Other expense',
  ],
};

const CATEGORY_LABELS: Record<string, string> = {
  Services: 'Services',
  'Subscriptions / retainers': 'Subscriptions / retainers',
  Products: 'Products',
  'Other income': 'Other income',
  'Subcontracting': 'Subcontracting',
  'Project materials': 'Project materials',
  'Client licences': 'Client licences',
  'Software & SaaS': 'Software & SaaS',
  Marketing: 'Marketing',
  'Rent & office': 'Rent & office',
  'Travel': 'Travel',
  'Bank fees': 'Bank fees',
  'Social charges & taxes': 'Social charges & taxes',
  Training: 'Training',
  'Other expense': 'Other expense',
};
/** English label for a stored category (unknown categories are shown as stored). */
export const catLabel = (c: string) => CATEGORY_LABELS[c] ?? c;

export const TYPE_META: Record<EntryType, { label: string; short: string; bg: string; color: string }> = {
  revenue: { label: 'Revenue', short: 'Revenue', bg: '#e8effc', color: '#2f6fde' },
  direct: { label: 'Direct cost', short: 'Direct cost', bg: '#fff3de', color: '#b36b00' },
  opex: { label: 'Operating expense', short: 'Operating', bg: '#fde8e8', color: '#c43d3d' },
};

export const CURRENCIES = [
  { v: 'EUR', l: 'EUR €' },
  { v: 'USD', l: 'USD $' },
  { v: 'CAD', l: 'CAD $' },
  { v: 'GBP', l: 'GBP £' },
  { v: 'CHF', l: 'CHF' },
  { v: 'MAD', l: 'MAD' },
];

export const NOTE_KINDS: { key: NoteKind; label: string; bg: string; color: string }[] = [
  { key: 'note', label: 'Note', bg: '#f1f3f7', color: '#4a5061' },
  { key: 'call', label: 'Call', bg: '#eeedfe', color: '#3c3489' },
  { key: 'decision', label: 'Decision', bg: '#faece7', color: '#712b13' },
  { key: 'feedback', label: 'Client feedback', bg: '#e6f1fb', color: '#0c447c' },
  { key: 'email', label: 'Email', bg: '#e1f5ee', color: '#085041' },
];

export const BRIEF_FIELDS: { key: 'context' | 'goal' | 'deliverables' | 'out'; label: string; placeholder: string }[] = [
  { key: 'context', label: 'Context', placeholder: 'Who the client is, where the need comes from…' },
  { key: 'goal', label: 'Goal', placeholder: 'What the project should change for the client' },
  { key: 'deliverables', label: 'Deliverables', placeholder: 'Dashboard, CSV import, weekly report…' },
  { key: 'out', label: 'Out of scope', placeholder: 'What is not included (billed separately)' },
];
