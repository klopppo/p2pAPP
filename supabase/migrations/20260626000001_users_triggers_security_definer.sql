-- Make the `users` maintenance triggers bypass RLS.
--
-- When a new user row is inserted (on wallet connect), a trigger also creates a
-- companion row in `reputation_scores` (and possibly other derived tables).
-- That trigger runs with the caller's role (anon), so it was rejected by those
-- tables' RLS:
--     42501 — new row violates row-level security policy for table "reputation_scores"
--
-- The standard fix for system-maintained derived tables is to run the trigger
-- functions as SECURITY DEFINER (owner/postgres privileges, which bypass RLS),
-- so the companion writes succeed regardless of who triggered the user insert.
-- This keeps reputation_scores writable ONLY by the system trigger (not by
-- arbitrary anon clients), which is more secure than a permissive RLS policy.

do $$
declare
  fn regprocedure;
begin
  for fn in
    select distinct p.oid::regprocedure
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_class c on c.oid = t.tgrelid
    where c.relname = 'users'
      and not t.tgisinternal
  loop
    execute format('alter function %s security definer', fn);
  end loop;
end $$;
