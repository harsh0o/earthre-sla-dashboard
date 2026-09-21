-- Earth-Re SLA dashboard schema (Supabase Postgres, free tier).
-- Apply in Supabase SQL editor, then set Vercel env vars (see .env.example).

create extension if not exists "pgcrypto";

create table if not exists datasets (
  id          uuid primary key default gen_random_uuid(),
  filename    text not null,
  uploaded_at timestamptz not null default now(),
  total_rows  int not null default 0,
  kept_checks int not null default 0,
  quarantined int not null default 0,
  date_min    timestamptz,
  date_max    timestamptz
);

create table if not exists checks (
  id            bigint generated always as identity primary key,
  dataset_id    uuid not null references datasets(id) on delete cascade,
  service_id    text not null,
  service_name  text not null,
  ts            timestamptz not null,
  status_code   int not null,
  is_up         boolean not null,
  latency_ms    double precision,
  latency_ok    boolean not null default true,
  agent         text not null,
  agents        text[] not null default '{}',
  agent_count   int not null default 1,
  region        text not null default 'ap-south-1',
  unique (dataset_id, service_id, ts)
);

create table if not exists quarantine (
  id          bigint generated always as identity primary key,
  dataset_id  uuid not null references datasets(id) on delete cascade,
  service_id  text,
  ts_raw      text,
  reason      text not null,
  payload     jsonb not null default '{}'
);

create index if not exists checks_ds_ts_idx     on checks (dataset_id, ts desc);
create index if not exists checks_ds_svc_ts_idx on checks (dataset_id, service_id, ts desc);
create index if not exists checks_ds_up_idx     on checks (dataset_id, is_up);

-- No auth per spec (out of scope): open read, writes via service_role from the function.
alter table datasets   enable row level security;
alter table checks      enable row level security;
alter table quarantine  enable row level security;

drop policy if exists "open read datasets" on datasets;
create policy "open read datasets" on datasets for select using (true);
drop policy if exists "open read checks" on checks;
create policy "open read checks" on checks for select using (true);
drop policy if exists "open read quarantine" on quarantine;
create policy "open read quarantine" on quarantine for select using (true);
