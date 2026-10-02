-- Clients become their own rows (name + label color), linked from projects and tasks.
create table if not exists clients (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null,
  color       text not null default '#2f6fde' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at  timestamptz not null default now()
);
create index if not exists clients_user_idx on clients (user_id);

alter table clients enable row level security;
create policy "own clients" on clients for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on clients from anon;
grant select, insert, update, delete on clients to authenticated;

alter table projects add column if not exists client_id uuid references clients on delete set null;
alter table tasks    add column if not exists client_id uuid references clients on delete set null;
create index if not exists projects_client_idx on projects (client_id);
create index if not exists tasks_client_idx on tasks (client_id);
create index if not exists tasks_project_idx on tasks (project_id);
create index if not exists entries_project_idx on entries (project_id);
create index if not exists recurring_project_idx on recurring (project_id);

-- Backfill: one client per distinct name already typed on projects (case-insensitive), colors rotating.
with src as (
  select user_id, lower(trim(client)) as k, min(trim(client)) as name
  from projects where trim(client) <> '' group by user_id, lower(trim(client))
), numbered as (
  select *, row_number() over (partition by user_id order by k) - 1 as n from src
)
insert into clients (user_id, name, color)
select user_id, name,
  (array['#2fa565','#e9a23b','#f07a3a','#e0525a','#8b6fe8','#2f6fde','#22a6c9','#7ab83a','#dd5aa6','#5b6270'])[n % 10 + 1]
from numbered;

update projects p set client_id = c.id
from clients c
where c.user_id = p.user_id and lower(c.name) = lower(trim(p.client)) and trim(p.client) <> '' and p.client_id is null;

comment on column projects.client is 'Deprecated: replaced by client_id (kept so older app versions keep working).';
