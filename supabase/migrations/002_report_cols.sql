-- 002: persist the full pipeline quality report on datasets so that
-- summary re-queries after a server restart return identical numbers.
alter table datasets add column if not exists exact_dupes int not null default 0;
alter table datasets add column if not exists overlaps_collapsed int not null default 0;
alter table datasets add column if not exists epoch_fixed int not null default 0;
alter table datasets add column if not exists missing_latency int not null default 0;
alter table datasets add column if not exists invalid_latency int not null default 0;
alter table datasets add column if not exists unknown_status int not null default 0;
