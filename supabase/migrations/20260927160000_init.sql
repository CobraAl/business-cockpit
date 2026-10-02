-- Cockpit: initial schema.
-- Mirrors src/types.ts. Every row belongs to the signed-in user; RLS keeps it that way.

create table if not exists profiles (
  user_id     uuid primary key references auth.users on delete cascade,
  name        text not null default '',
  email       text not null default '',
  company     text not null default '',
  currency    text not null default 'EUR',
  target_pct  numeric not null default 30,
  alert_pct   numeric not null default 12,
  updated_at  timestamptz not null default now()
);

create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null,
  client      text not null default '',
  start       date,
  deadline    date,
  status      text not null default 'Not started'
              check (status in ('Not started', 'In progress', 'On hold', 'Done')),
  created_at  timestamptz not null default now()
);

create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  title       text not null,
  col         text not null default 'todo' check (col in ('todo', 'ongoing', 'blocked', 'done')),
  project_id  uuid references projects on delete set null,
  due         date,
  note        text not null default '',
  position    double precision not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  date        date not null,
  label       text not null,
  type        text not null check (type in ('revenue', 'direct', 'opex')),
  category    text not null,
  amount      numeric(12, 2) not null check (amount >= 0),
  project_id  uuid references projects on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists recurring (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  label       text not null,
  type        text not null check (type in ('revenue', 'direct', 'opex')),
  category    text not null,
  amount      numeric(12, 2) not null check (amount >= 0),
  frequency   text not null default 'monthly' check (frequency in ('monthly', 'yearly')),
  start       date not null,
  "end"       date,
  project_id  uuid references projects on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists tasks_user_idx on tasks (user_id);
create index if not exists entries_user_date_idx on entries (user_id, date);
create index if not exists recurring_user_idx on recurring (user_id);
create index if not exists projects_user_idx on projects (user_id);

alter table profiles  enable row level security;
alter table projects  enable row level security;
alter table tasks     enable row level security;
alter table entries   enable row level security;
alter table recurring enable row level security;

create policy "own profile"   on profiles  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own projects"  on projects  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own tasks"     on tasks     for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own entries"   on entries   for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own recurring" on recurring for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Only signed-in users reach these tables through the API (RLS then limits them to their own rows).
revoke all on profiles, projects, tasks, entries, recurring from anon;
grant select, insert, update, delete on profiles, projects, tasks, entries, recurring to authenticated;
