-- ADR-013 — Self-hosted client error reporting.
--
-- The SPA captures window `error` / `unhandledrejection` / React render
-- errors client-side, scrubs them (addresses, long hex blobs, emails, URL
-- query params), batches them, and POSTs them to the edge endpoint
-- `/api/error-report`, which enforces a per-IP rate limit and appends them
-- here. This is the OPPOSITE of a third-party tracker: data stays in our
-- Supabase project, under RLS, and the browser never holds a write token
-- beyond the public anon key.
--
-- Privacy posture: rows are scrubbed in TWO places client-side
-- (`src/lib/errorReports.ts`) and again at the edge
-- (`functions/api/error-report.ts`), so raw wallet addresses / amounts /
-- PII never reach Postgres. Anon can INSERT (needed for the edge write) but
-- can read NOTHING; only `authenticated` (future operator dashboard) reads.

create table if not exists public.error_logs (
  id           bigint generated always as identity primary key,
  fingerprint  text not null,               -- dedupe key built client-side
  error_type   text not null default 'error',
  message      text not null,
  stack        text,
  source       text,
  line         integer,
  col          integer,
  route        text,                        -- window.location.pathname
  user_agent   text,
  language     text,                        -- navigator.language
  count        integer not null default 1,  -- deduped occurrences in one flush
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists error_logs_created_at_idx on public.error_logs (created_at desc);
create index if not exists error_logs_fingerprint_idx on public.error_logs (fingerprint);
create index if not exists error_logs_type_idx on public.error_logs (error_type);

alter table public.error_logs enable row level security;

-- Fail-closed baseline: nobody gets table-level access.
revoke all on public.error_logs from anon, authenticated;

-- The edge function authenticates as `anon`; it needs INSERT only and must
-- never read. Anon can therefore not scrape reports back out.
grant insert on public.error_logs to anon;

-- Future operator dashboard reads with a SIWE (authenticated) session.
grant select on public.error_logs to authenticated;

-- Writes are anonymized server-side too (edge re-scrubs), so an anon INSERT
-- policy with no column restrictions is acceptable. Abuse is bounded at the
-- edge (per-IP rate limit) rather than here.
create policy error_logs_anon_insert
  on public.error_logs
  for insert
  to anon
  with check (true);

create policy error_logs_auth_select
  on public.error_logs
  for select
  to authenticated
  using (true);