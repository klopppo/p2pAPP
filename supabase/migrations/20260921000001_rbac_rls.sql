-- =====================================================================
-- Security P0 — RBAC / Audit / Reports RLS (sys_* + user_*_logs + reports)
--
-- Closed the open-read data leak on the RBAC cluster created by
-- docs/migrations/002-rbac-audit-logger-operator-dashboard.sql:
--
--   * `sys_programs`, `sys_roles`, `sys_permissions`,
--     `sys_program_role_permissions`, `sys_operators`, `sys_operator_roles`,
--     `user_activity_logs`, `user_reports`
--
-- were all created with RLS DISABLED and the Supabase default grants
-- (full DML to anon + authenticated + service_role). Live probe before this
-- migration (anon key, no session):
--
--   sys_operators                 -> 200, seeded operator emails/uuids readable
--   sys_programs / sys_roles      -> 200 (whole RBAC catalogue)
--   sys_permissions               -> 200
--   user_reports                  -> 200 (all user reports + reporter wallets)
--   user_activity_logs            -> 200 (IPs, user agents, snapshots)   [via grants]
--
-- Posture implemented here (deny by default, wallet-claim bound):
--
--   * anon → REVOKE ALL on every table in the cluster. Anonymous has no
--     business touching RBAC, operator PII, audit logs or reports.
--   * `authenticated` keeps ONLY the commands the RLS policies gate:
--       - sys_* catalogues: SELECT via operator-only policies
--       - sys_operators / sys_operator_roles: SELECT for RBAC admins or self
--       - user_activity_logs: INSERT by the wallet claim (or an active
--         operator), SELECT for AUDIT_LOGGER:AUDIT_READ holders
--       - user_reports: INSERT self-bound, SELECT own/operator, UPDATE+DELETE
--         operator-only (RESOLVE_REPORT / DELETE)
--   * service_role (edge functions / admin client) unchanged — bypasses RLS.
--
-- Identity: the operator security context resolves the SIWE session wallet
-- (auth.jwt() ->> 'wallet_address') against `sys_operators.wallet_address` /
-- `sys_operators.user_id` — same wallet-primary model as the SIWE RLS rewrite
-- (20260829000002), so no data migration is required.
--
-- Idempotent: functions are `create or replace`; policies are dropped by name
-- and recreated; grants/revokes are no-ops when already in that state.
-- =====================================================================

-- ---------------------------------------------------------------------------
-- 1. Operator security-context helpers (SECURITY DEFINER: the policy subquery
--    reads the same tables it protects; the owner bypasses RLS so there is no
--    recursion, mirroring public.current_user_id()).
-- ---------------------------------------------------------------------------

-- Active operator row bound to the current session wallet (or its users.id).
create or replace function public.current_operator_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.id
  from public.sys_operators o
  where o.status = 'ACTIVE'
    and (
      o.user_id = public.current_user_id()
      or lower(coalesce(o.wallet_address, '')) = lower(coalesce(auth.jwt() ->> 'wallet_address', ''))
    )
  limit 1;
$$;

-- True when the session wallet maps to an ACTIVE operator row.
create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sys_operators o
    where o.status = 'ACTIVE'
      and (
        o.user_id = public.current_user_id()
        or lower(coalesce(o.wallet_address, '')) = lower(coalesce(auth.jwt() ->> 'wallet_address', ''))
      )
  );
$$;

-- True when the session wallet maps to an ACTIVE operator holding the given
-- program×permission in the sys_program_role_permissions matrix (SUPER_ADMIN
-- short-circuits every check, matching the seeded CROSS JOIN).
create or replace function public.operator_has_permission(
  p_program   varchar,
  p_permission varchar
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sys_operators o
    join public.sys_operator_roles sor  on sor.operator_id = o.id
    join public.sys_roles         r    on r.id = sor.role_id
    where o.status = 'ACTIVE'
      and (
        o.user_id = public.current_user_id()
        or lower(coalesce(o.wallet_address, '')) = lower(coalesce(auth.jwt() ->> 'wallet_address', ''))
      )
      and (
        r.id = 'SUPER_ADMIN'
        or exists (
          select 1 from public.sys_program_role_permissions prp
          where prp.program_id = p_program
            and prp.role_id    = r.id
            and prp.permission_id = p_permission
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Grants — strip the Supabase defaults, then re-grant only the commands
--    the policies below gate. anon loses everything on this cluster.
-- ---------------------------------------------------------------------------

revoke all
  on table public.sys_programs, public.sys_roles, public.sys_permissions,
           public.sys_program_role_permissions, public.sys_operators,
           public.sys_operator_roles, public.user_activity_logs,
           public.user_reports
  from anon, authenticated;

grant select
  on table public.sys_programs, public.sys_roles, public.sys_permissions,
           public.sys_program_role_permissions, public.sys_operators,
           public.sys_operator_roles
  to authenticated;

grant select, insert, update, delete
  on table public.user_reports
  to authenticated;

grant select, insert
  on table public.user_activity_logs
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS enable + policies
-- ---------------------------------------------------------------------------

alter table public.sys_programs              enable row level security;
alter table public.sys_roles                 enable row level security;
alter table public.sys_permissions           enable row level security;
alter table public.sys_program_role_permissions enable row level security;
alter table public.sys_operators             enable row level security;
alter table public.sys_operator_roles        enable row level security;
alter table public.user_activity_logs        enable row level security;
alter table public.user_reports              enable row level security;

-- ---- 3.1 sys_programs — RBAC catalogue ------------------------------------
drop policy if exists "sys_programs_select_operator"    on public.sys_programs;
drop policy if exists "sys_programs_insert_rbac"        on public.sys_programs;
drop policy if exists "sys_programs_update_rbac"        on public.sys_programs;
drop policy if exists "sys_programs_delete_rbac"        on public.sys_programs;

create policy "sys_programs_select_operator"
  on public.sys_programs for select
  to authenticated
  using (public.is_operator());

create policy "sys_programs_insert_rbac"
  on public.sys_programs for insert
  to authenticated
  with check (public.operator_has_permission('RBAC_MANAGEMENT', 'CREATE'));

create policy "sys_programs_update_rbac"
  on public.sys_programs for update
  to authenticated
  using (public.operator_has_permission('RBAC_MANAGEMENT', 'EDIT'))
  with check (public.operator_has_permission('RBAC_MANAGEMENT', 'EDIT'));

create policy "sys_programs_delete_rbac"
  on public.sys_programs for delete
  to authenticated
  using (public.operator_has_permission('RBAC_MANAGEMENT', 'DELETE'));

-- ---- 3.2 sys_roles — RBAC catalogue ---------------------------------------
drop policy if exists "sys_roles_select_operator" on public.sys_roles;
drop policy if exists "sys_roles_insert_rbac"     on public.sys_roles;
drop policy if exists "sys_roles_update_rbac"     on public.sys_roles;
drop policy if exists "sys_roles_delete_rbac"     on public.sys_roles;

create policy "sys_roles_select_operator"
  on public.sys_roles for select
  to authenticated
  using (public.is_operator());

create policy "sys_roles_insert_rbac"
  on public.sys_roles for insert
  to authenticated
  with check (public.operator_has_permission('RBAC_MANAGEMENT', 'CREATE'));

create policy "sys_roles_update_rbac"
  on public.sys_roles for update
  to authenticated
  using (public.operator_has_permission('RBAC_MANAGEMENT', 'EDIT'))
  with check (public.operator_has_permission('RBAC_MANAGEMENT', 'EDIT'));

create policy "sys_roles_delete_rbac"
  on public.sys_roles for delete
  to authenticated
  using (public.operator_has_permission('RBAC_MANAGEMENT', 'DELETE'));

-- ---- 3.3 sys_permissions — RBAC catalogue ---------------------------------
drop policy if exists "sys_permissions_select_operator" on public.sys_permissions;
drop policy if exists "sys_permissions_insert_rbac"     on public.sys_permissions;
drop policy if exists "sys_permissions_update_rbac"     on public.sys_permissions;
drop policy if exists "sys_permissions_delete_rbac"     on public.sys_permissions;

create policy "sys_permissions_select_operator"
  on public.sys_permissions for select
  to authenticated
  using (public.is_operator());

create policy "sys_permissions_insert_rbac"
  on public.sys_permissions for insert
  to authenticated
  with check (public.operator_has_permission('RBAC_MANAGEMENT', 'CREATE'));

create policy "sys_permissions_update_rbac"
  on public.sys_permissions for update
  to authenticated
  using (public.operator_has_permission('RBAC_MANAGEMENT', 'EDIT'))
  with check (public.operator_has_permission('RBAC_MANAGEMENT', 'EDIT'));

create policy "sys_permissions_delete_rbac"
  on public.sys_permissions for delete
  to authenticated
  using (public.operator_has_permission('RBAC_MANAGEMENT', 'DELETE'));

-- ---- 3.4 sys_program_role_permissions — RBAC matrix -----------------------
drop policy if exists "sys_matrix_select_operator" on public.sys_program_role_permissions;
drop policy if exists "sys_matrix_insert_rbac"     on public.sys_program_role_permissions;
drop policy if exists "sys_matrix_update_rbac"     on public.sys_program_role_permissions;
drop policy if exists "sys_matrix_delete_rbac"     on public.sys_program_role_permissions;

create policy "sys_matrix_select_operator"
  on public.sys_program_role_permissions for select
  to authenticated
  using (public.is_operator());

create policy "sys_matrix_insert_rbac"
  on public.sys_program_role_permissions for insert
  to authenticated
  with check (public.operator_has_permission('RBAC_MANAGEMENT', 'CREATE'));

create policy "sys_matrix_update_rbac"
  on public.sys_program_role_permissions for update
  to authenticated
  using (public.operator_has_permission('RBAC_MANAGEMENT', 'EDIT'))
  with check (public.operator_has_permission('RBAC_MANAGEMENT', 'EDIT'));

create policy "sys_matrix_delete_rbac"
  on public.sys_program_role_permissions for delete
  to authenticated
  using (public.operator_has_permission('RBAC_MANAGEMENT', 'DELETE'));

-- ---- 3.5 sys_operators — staff PII (email/wallet). RBAC admins or self ---
drop policy if exists "sys_operators_select_admin_self" on public.sys_operators;
drop policy if exists "sys_operators_insert_rbac"       on public.sys_operators;
drop policy if exists "sys_operators_update_rbac_self"  on public.sys_operators;
drop policy if exists "sys_operators_delete_rbac"       on public.sys_operators;

create policy "sys_operators_select_admin_self"
  on public.sys_operators for select
  to authenticated
  using (
    public.operator_has_permission('RBAC_MANAGEMENT', 'VIEW')
    or id = public.current_operator_id()
  );

create policy "sys_operators_insert_rbac"
  on public.sys_operators for insert
  to authenticated
  with check (public.operator_has_permission('RBAC_MANAGEMENT', 'CREATE'));

create policy "sys_operators_update_rbac_self"
  on public.sys_operators for update
  to authenticated
  using (
    public.operator_has_permission('RBAC_MANAGEMENT', 'EDIT')
    or id = public.current_operator_id()
  )
  with check (
    public.operator_has_permission('RBAC_MANAGEMENT', 'EDIT')
    or id = public.current_operator_id()
  );

create policy "sys_operators_delete_rbac"
  on public.sys_operators for delete
  to authenticated
  using (public.operator_has_permission('RBAC_MANAGEMENT', 'DELETE'));

-- ---- 3.6 sys_operator_roles — role assignments. RBAC admins or self -------
drop policy if exists "sys_operator_roles_select_admin_self" on public.sys_operator_roles;
drop policy if exists "sys_operator_roles_insert_rbac"       on public.sys_operator_roles;
drop policy if exists "sys_operator_roles_update_rbac"       on public.sys_operator_roles;
drop policy if exists "sys_operator_roles_delete_rbac"       on public.sys_operator_roles;

create policy "sys_operator_roles_select_admin_self"
  on public.sys_operator_roles for select
  to authenticated
  using (
    public.operator_has_permission('RBAC_MANAGEMENT', 'VIEW')
    or operator_id = public.current_operator_id()
  );

create policy "sys_operator_roles_insert_rbac"
  on public.sys_operator_roles for insert
  to authenticated
  with check (public.operator_has_permission('RBAC_MANAGEMENT', 'CREATE'));

create policy "sys_operator_roles_update_rbac"
  on public.sys_operator_roles for update
  to authenticated
  using (public.operator_has_permission('RBAC_MANAGEMENT', 'EDIT'))
  with check (public.operator_has_permission('RBAC_MANAGEMENT', 'EDIT'));

create policy "sys_operator_roles_delete_rbac"
  on public.sys_operator_roles for delete
  to authenticated
  using (public.operator_has_permission('RBAC_MANAGEMENT', 'DELETE'));

-- ---- 3.7 user_activity_logs — append-only audit trail ---------------------
-- INSERT: either an ACTIVE operator, or a signed-in user logging wallet-claim
-- activity (own user_id / own wallet only — never operator-attributed rows).
-- SELECT: AUDIT_LOGGER:AUDIT_READ holders (AUDITOR_READONLY, COMPLIANCE_LEAD,
-- SUPER_ADMIN). UPDATE/DELETE: none — logs are immutable.
drop policy if exists "logs_insert_self_or_operator" on public.user_activity_logs;
drop policy if exists "logs_select_audit_reader"     on public.user_activity_logs;

create policy "logs_insert_self_or_operator"
  on public.user_activity_logs for insert
  to authenticated
  with check (
    public.is_operator()
    or (
      operator_id is null
      and (user_id is null or user_id = public.current_user_id())
      and (wallet_address is null or wallet_address = lower(auth.jwt() ->> 'wallet_address'))
    )
  );

create policy "logs_select_audit_reader"
  on public.user_activity_logs for select
  to authenticated
  using (public.operator_has_permission('AUDIT_LOGGER', 'AUDIT_READ'));

-- ---- 3.8 user_reports — reports are sucked in; read is own-or-operator ----
drop policy if exists "reports_insert_self"         on public.user_reports;
drop policy if exists "reports_select_own_operator" on public.user_reports;
drop policy if exists "reports_update_operator"     on public.user_reports;
drop policy if exists "reports_delete_operator"     on public.user_reports;

create policy "reports_insert_self"
  on public.user_reports for insert
  to authenticated
  with check (
    reporter_wallet = lower(auth.jwt() ->> 'wallet_address')
    and (reporter_user_id is null or reporter_user_id = public.current_user_id())
  );

create policy "reports_select_own_operator"
  on public.user_reports for select
  to anon, authenticated
  using (
    reporter_user_id = public.current_user_id()
    or (reporter_wallet = lower(auth.jwt() ->> 'wallet_address') and reporter_user_id is null)
    or public.operator_has_permission('USER_REPORTS', 'VIEW')
  );

create policy "reports_update_operator"
  on public.user_reports for update
  to authenticated
  using (public.operator_has_permission('USER_REPORTS', 'RESOLVE_REPORT'))
  with check (public.operator_has_permission('USER_REPORTS', 'RESOLVE_REPORT'));

create policy "reports_delete_operator"
  on public.user_reports for delete
  to authenticated
  using (public.operator_has_permission('USER_REPORTS', 'DELETE'));

-- =====================================================================
-- Sanity audit (run manually after deploy):
--
--   select c.grantee, c.privilege_type, c.table_name
--   from information_schema.role_table_grants c
--   where c.grantee in ('anon','authenticated')
--     and c.table_schema = 'public'
--     and c.table_name like 'sys_%' or c.table_name in ('user_activity_logs','user_reports')
--   order by c.table_name, c.grantee;
--
--   select t.tablename, t.rowsecurity
--   from pg_tables t
--   where t.schemaname='public'
--     and t.tablename in ('sys_programs','sys_roles','sys_permissions',
--       'sys_program_role_permissions','sys_operators','sys_operator_roles',
--       'user_activity_logs','user_reports')
--   order by t.tablename;   -- expect rowsecurity = t on all 8
--
-- Probe (anon key): every GET on the 8 tables → 42501 / 0 rows.
-- =====================================================================