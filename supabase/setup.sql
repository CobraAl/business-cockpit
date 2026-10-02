-- Cockpit database setup.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run. Run it once, on a new project.
-- It creates the tables, the security rules (each user only ever sees their own rows) and a small trigger.

-- ---------------- 20260927160000_init.sql ----------------
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

-- ---------------- 20260927170000_rls_initplan.sql ----------------
-- Evaluate auth.uid() once per query instead of once per row (Supabase advisor 0003).
drop policy "own profile"   on profiles;
drop policy "own projects"  on projects;
drop policy "own tasks"     on tasks;
drop policy "own entries"   on entries;
drop policy "own recurring" on recurring;

create policy "own profile"   on profiles  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own projects"  on projects  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own tasks"     on tasks     for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own entries"   on entries   for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own recurring" on recurring for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------- 20260927180000_project_position.sql ----------------
-- Keep the project list order stable across devices and reloads.
alter table projects add column if not exists position double precision not null default 0;

-- ---------------- 20260927200000_clients.sql ----------------
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

-- ---------------- 20260927220000_profile_avatar.sql ----------------
-- Profile photo, stored as a small data URL (the app resizes it to 256px before saving).
alter table profiles add column if not exists avatar text not null default ''
  check (avatar = '' or (avatar ~ '^data:image/(jpeg|png|webp);base64,' and length(avatar) < 300000));

-- ---------------- 20260927230000_project_brief_notes.sql ----------------
-- Project workspace: a brief on each project, and a dated journal of notes.
alter table projects add column if not exists brief_context      text not null default '';
alter table projects add column if not exists brief_goal         text not null default '';
alter table projects add column if not exists brief_deliverables text not null default '';
alter table projects add column if not exists brief_out          text not null default '';

create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  project_id  uuid not null references projects on delete cascade,
  date        date not null,
  kind        text not null default 'note' check (kind in ('note', 'call', 'decision', 'feedback', 'email')),
  body        text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists notes_user_idx on notes (user_id);
create index if not exists notes_project_idx on notes (project_id);

alter table notes enable row level security;
create policy "own notes" on notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on notes from anon;
grant select, insert, update, delete on notes to authenticated;

-- ---------------- 20260929090000_task_done_at.sql ----------------
-- When a task reached the Done column. Done tasks older than a week are hidden from the board
-- (kept in the database). Tasks already done start their week now.
alter table tasks add column if not exists done_at timestamptz;
update tasks set done_at = now() where col = 'done' and done_at is null;

-- ---------------- 20260929110000_task_done_at_trigger.sql ----------------
-- Stamp done_at in the database, so every client version (including an old tab left open)
-- records when a task entered Done. A client that sends its own fresh stamp keeps it.
create or replace function tasks_stamp_done_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.col <> 'done' then
    new.done_at := null;
  elsif tg_op = 'INSERT' then
    new.done_at := coalesce(new.done_at, now());
  elsif old.col <> 'done' and new.done_at is not distinct from old.done_at then
    new.done_at := now();                           -- entered Done without a stamp
  elsif new.done_at is null then
    new.done_at := coalesce(old.done_at, now());    -- stayed in Done: never lose the date
  end if;
  return new;
end $$;

drop trigger if exists tasks_done_at on tasks;
create trigger tasks_done_at before insert or update on tasks
  for each row execute function tasks_stamp_done_at();

update tasks set done_at = now() where col = 'done' and done_at is null;

-- ---------------- 20260929150000_investments.sql ----------------
-- S&P 500 investment tracking: the ETF followed (on the profile) and each amount put in.
alter table profiles add column if not exists invest_isin text not null default '';
alter table profiles add column if not exists invest_mic  text not null default '';
alter table profiles add column if not exists invest_name text not null default '';

create table if not exists investments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  date        date not null,
  amount      numeric(12, 2) not null check (amount > 0),
  -- Price per share actually paid, when known (from the broker); null = use the market close.
  price       numeric(14, 4) check (price is null or price > 0),
  created_at  timestamptz not null default now()
);
create index if not exists investments_user_idx on investments (user_id);

alter table investments enable row level security;
create policy "own investments" on investments for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on investments from anon;
grant select, insert, update, delete on investments to authenticated;

-- ---------------- 20260929190000_investment_close.sql ----------------
-- Market close on the day of each amount, saved when it is entered: Euronext only serves two
-- years of prices, so without it an amount would stop being valued two years later.
alter table investments add column if not exists close numeric(14, 4) check (close is null or close > 0);
