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
