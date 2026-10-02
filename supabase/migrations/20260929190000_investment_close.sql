-- Market close on the day of each amount, saved when it is entered: Euronext only serves two
-- years of prices, so without it an amount would stop being valued two years later.
alter table investments add column if not exists close numeric(14, 4) check (close is null or close > 0);
