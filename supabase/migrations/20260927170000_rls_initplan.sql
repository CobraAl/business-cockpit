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
