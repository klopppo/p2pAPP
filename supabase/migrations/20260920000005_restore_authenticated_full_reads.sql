-- ADR-015 deploy hotfix (2026-09-20): restore table-level SELECT for the
-- `authenticated` role on `public.users` and `public.offers`.
--
-- Root cause of the 42501 seen in the client (e.g. `index.ts:434
-- [updateUserProfile] permission denied for table users`, hint
-- `GRANT SELECT ON public.users TO authenticated`):
--
-- Migration `20260920000003_offer_pseudonym.sql` applied its drop-and-regrant
-- column projection to BOTH client roles. That was correct for `anon` (the
-- public, identity-free surface — ADR-015 / OD-02) but the SAME drop-and-regrant
-- stripped `authenticated`'s table-level SELECT too. The signed-in client was
-- never meant to lose it:
--
--   * `updateUserProfile`/`ensureUser` use `.select()` / `.select("*")` —
--     i.e. `INSERT ... RETURNING *` / `SELECT *`. With only a column-level
--     SELECT grant, RETURNING/SELECT over any column outside the projection
--     42501s (the projection omits `location`, the social handles, `role`,
--     `last_active_at`, `updated_at`, …).
--   * `users_update_self` (20260824000006) evaluates `role = (select u.role
--     from public.users u …)` in its WITH CHECK — reading `role` requires
--     SELECT on it, which the projection does not include. Every profile
--     WRITE would 42501 even without the RETURNING.
--   * The trade queries embed `offer:offers(*)` (5 call sites:
--     getActiveTradesByBuyer/Seller, getTradeBy*), which must SELECT the
--     offers columns the projection excludes (`featured`, `views`, `clicks`,
--     `premium_multiplier`, `updated_at`).
--
-- Decision: `authenticated` keeps FULL table-level SELECT on `users` and
-- `offers` (the OD-02 contract — "signed-in reads keep full table access").
-- Anonymity is a property of the PUBLIC surface, which is gated on `anon`:
--   * `anon` stays on the narrow column projection (users/offers) — never
--     `seller_id`/`target_user`, never `users.wallet_address` of others.
--   * Offer browse/detail go through the SECURITY DEFINER RPCs
--     (`get_public_offers` / `get_public_offer_by_id`, migration 0004).
--   * ADR-015 already conceded that an authenticated trader can read an
--     offer's owner uid (the `authenticated` exception keeps `seller_id` +
--     `target_user`); restoring the full column set adds only internal fields
--     (views/premium/etc.), no new identity.
--
-- What this does NOT undo:
--   * `anon` projection (OD-02 / ADR-015) — untouched.
--   * `revoke update (role) on public.users` (20260824000006) — a table-level
--     SELECT grant does not affect it. Re-asserted below for defense in depth
--     (a future table-level UPDATE grant must not silently re-open `role`).
--   * The SECURITY DEFINER RPC surface and the owner-scoped RLS policies.
--
-- Idempotent: `grant`/`revoke` are no-ops when already in that state.
-- =====================================================================

grant select on table public.users  to authenticated;
grant select on table public.offers to authenticated;

-- Defense in depth: the role column must NEVER be client-writable. Re-assert
-- the column-level UPDATE revoke right after the (SELECT) grants so it stays
-- effective even if a future migration re-grants table-level UPDATE.
revoke update (role)
  on public.users
  from authenticated, anon;

-- =====================================================================
-- Sanity audit (run manually after `supabase db push`):
--
--   select c.grantee, c.privilege_type, c.table_name, c.column_name
--   from information_schema.role_table_grants c
--   where c.grantee in ('anon','authenticated')
--     and c.privilege_type = 'SELECT'
--     and c.table_schema = 'public'
--     and c.table_name in ('users','offers')
--   order by c.grantee, c.table_name, c.column_name;
--
-- Expected:
--   * `authenticated`: two rows with NULL column_name (table-level SELECT on
--     users + offers) — full access.
--   * `anon`: ONLY column-level rows (no NULL column_name) — the users and
--     offers projections, excluding `seller_id` / `target_user` on offers.
-- Probe live: signed-in `POST /rest/v1/rpc/…` or
--   `curl -H "Authorization: Bearer <user-jwt>" "…/rest/v1/users?select=role"` → 200;
--   same with the anon key → 42501.
-- =====================================================================