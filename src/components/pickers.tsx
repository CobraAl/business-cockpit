import { inkOn, nextColor } from '../lib/colors';
import { LOCALE } from '../lib/constants';
import { uid } from '../lib/format';
import type { AppData, Client, Project } from '../types';
import { Select, type Option } from './Select';

type Update = (fn: (d: AppData) => AppData) => void;

/** Colored label for a client, Trello style. */
export function ClientChip({ client, size = 'md' }: { client: Client; size?: 'sm' | 'md' }) {
  return (
    <span className="label-chip" style={{ background: client.color, color: inkOn(client.color), fontSize: size === 'sm' ? '0.625rem' : '0.6875rem' }} title={client.name}>
      {client.name}
    </span>
  );
}

/** Round avatar with the client's initial on its color. */
export function ClientDot({ client }: { client?: Client }) {
  return (
    <span className="client-i" style={client ? { background: client.color, color: inkOn(client.color) } : undefined}>
      {(client?.name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Pick a client, or type a new name to create it on the spot (it gets the next free color). */
export function ClientSelect({ data, update, value, onChange, size, ariaLabel = 'Client', inherited }: {
  data: AppData;
  update: Update;
  value: string;
  onChange: (id: string) => void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  /** Client that applies when none is chosen (the project's): shown as the empty option. */
  inherited?: Client;
}) {
  const empty = inherited ? `Project's client (${inherited.name})` : 'No client';
  const options: Option[] = [
    { value: '', label: empty, color: inherited?.color },
    ...data.clients.map((c) => ({ value: c.id, label: c.name, color: c.color })),
  ];
  const create = (name: string) => {
    const client: Client = { id: uid(), name, color: nextColor(data.clients.map((c) => c.color)) };
    update((d) => ({ ...d, clients: [...d.clients, client].sort((a, b) => a.name.localeCompare(b.name, LOCALE)) }));
    return client.id;
  };
  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      placeholder={empty}
      onCreate={create}
      createLabel={(t) => `New client "${t}"`}
      size={size}
      ariaLabel={ariaLabel}
    />
  );
}

/** Pick a project; each option shows its client's color and name. */
export function ProjectSelect({ projects, clients, value, onChange, size, ariaLabel = 'Project' }: {
  projects: Project[];
  clients: Client[];
  value: string;
  onChange: (id: string) => void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const options: Option[] = [
    { value: '', label: 'No project' },
    ...projects.map((p) => {
      const c = byId.get(p.clientId);
      return { value: p.id, label: p.name, color: c?.color, hint: c?.name };
    }),
  ];
  return <Select value={value} onChange={onChange} options={options} placeholder="No project" size={size} ariaLabel={ariaLabel} />;
}
