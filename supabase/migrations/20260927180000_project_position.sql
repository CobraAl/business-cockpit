-- Keep the project list order stable across devices and reloads.
alter table projects add column if not exists position double precision not null default 0;
