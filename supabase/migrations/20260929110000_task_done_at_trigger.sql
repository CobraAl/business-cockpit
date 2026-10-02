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
