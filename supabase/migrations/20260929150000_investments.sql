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
