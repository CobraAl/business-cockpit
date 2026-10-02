-- When a task reached the Done column. Done tasks older than a week are hidden from the board
-- (kept in the database). Tasks already done start their week now.
alter table tasks add column if not exists done_at timestamptz;
update tasks set done_at = now() where col = 'done' and done_at is null;
