-- Checks for migration 083 (host_expenses). Run the whole file in the Supabase
-- SQL editor AFTER applying 083. It writes nothing: every write it tries is
-- rolled back inside its own block (or refused). The last statement returns
-- one row per check; every row should say PASS.
-- pgTAP is owed (not set up yet).
--
-- Who may touch the table: only /api/host/expenses, through the service role,
-- which scopes every query to the caller's own hosts row. anon and
-- authenticated (owners, staff, guests with a session) get nothing directly.

-- A host the probes can point at.
SELECT set_config('check083.host', coalesce((SELECT id::text FROM hosts LIMIT 1), ''), false);

-- A write that must be refused records 'refused'; one that must work records
-- 'allowed' after rolling itself back.
CREATE OR REPLACE FUNCTION pg_temp.try(name text, stmt text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  BEGIN
    EXECUTE stmt;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE EXCEPTION 'probe-rollback:%', n;
  EXCEPTION
    WHEN insufficient_privilege THEN PERFORM set_config('check083.' || name, 'refused', false);
    WHEN check_violation THEN PERFORM set_config('check083.' || name, 'check violation', false);
    WHEN raise_exception THEN
      PERFORM set_config('check083.' || name,
        CASE WHEN SQLERRM = 'probe-rollback:0' THEN 'no row matched' ELSE 'allowed' END, false);
    WHEN OTHERS THEN PERFORM set_config('check083.' || name, 'error: ' || SQLERRM, false);
  END;
END $$;

-- The probes, run once per role.
CREATE OR REPLACE FUNCTION pg_temp.probe(who text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.try(who || '_select', 'SELECT 1 FROM public.host_expenses LIMIT 1');
  PERFORM pg_temp.try(who || '_insert', format(
    'INSERT INTO public.host_expenses (host_id, spent_on, category, amount) VALUES (%L, %L, %L, %s)',
    current_setting('check083.host'), '2026-11-18', 'utilities', 100));
  PERFORM pg_temp.try(who || '_update', 'UPDATE public.host_expenses SET note = ''x''');
  PERFORM pg_temp.try(who || '_delete', 'DELETE FROM public.host_expenses');
END $$;

-- As a guest without a session --------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, false);
SET ROLE anon;
SELECT pg_temp.probe('anon');
RESET ROLE;

-- As any signed-in user (owner, staff, or someone else's session) ---------------
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT pg_temp.probe('auth');
RESET ROLE;

-- As the service role (/api/host/expenses) --------------------------------------
SET ROLE service_role;
SELECT pg_temp.probe('service');
-- The CHECKs hold even for the service role.
SELECT pg_temp.try('service_bad_category', format(
  'INSERT INTO public.host_expenses (host_id, spent_on, category, amount) VALUES (%L, %L, %L, %s)',
  current_setting('check083.host'), '2026-11-18', 'fuel', 100));
SELECT pg_temp.try('service_zero_amount', format(
  'INSERT INTO public.host_expenses (host_id, spent_on, category, amount) VALUES (%L, %L, %L, %s)',
  current_setting('check083.host'), '2026-11-18', 'other', 0));
SELECT pg_temp.try('service_long_note', format(
  'INSERT INTO public.host_expenses (host_id, spent_on, category, amount, note) VALUES (%L, %L, %L, %s, %L)',
  current_setting('check083.host'), '2026-11-18', 'other', 100, repeat('x', 201)));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

-- Results --------------------------------------------------------------------------
SELECT check_name, got, expected, CASE WHEN got = expected THEN 'PASS' ELSE 'FAIL' END AS result
FROM (VALUES
  ('a host to probe with exists', CASE WHEN current_setting('check083.host') <> '' THEN 'yes' ELSE 'no' END, 'yes'),
  ('RLS is on', (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.host_expenses'::regclass), 'true'),
  ('no RLS policies (service role only)', (SELECT count(*)::text FROM pg_policies WHERE tablename = 'host_expenses'), '0'),
  ('anon cannot read', current_setting('check083.anon_select'), 'refused'),
  ('anon cannot insert', current_setting('check083.anon_insert'), 'refused'),
  ('anon cannot update', current_setting('check083.anon_update'), 'refused'),
  ('anon cannot delete', current_setting('check083.anon_delete'), 'refused'),
  ('authenticated cannot read', current_setting('check083.auth_select'), 'refused'),
  ('authenticated cannot insert', current_setting('check083.auth_insert'), 'refused'),
  ('authenticated cannot update', current_setting('check083.auth_update'), 'refused'),
  ('authenticated cannot delete', current_setting('check083.auth_delete'), 'refused'),
  -- SELECT returns no row on an empty table; either way it was not refused.
  ('service role can read', replace(current_setting('check083.service_select'), 'no row matched', 'allowed'), 'allowed'),
  ('service role can insert (rolled back)', current_setting('check083.service_insert'), 'allowed'),
  -- UPDATE on an empty table matches nothing; it must not be refused.
  ('service role can update (rolled back)', replace(current_setting('check083.service_update'), 'no row matched', 'allowed'), 'allowed'),
  -- DELETE on an empty table matches nothing; it must not be refused.
  ('service role can delete (rolled back)', replace(current_setting('check083.service_delete'), 'no row matched', 'allowed'), 'allowed'),
  ('unknown category is refused', current_setting('check083.service_bad_category'), 'check violation'),
  ('zero amount is refused', current_setting('check083.service_zero_amount'), 'check violation'),
  ('note over 200 characters is refused', current_setting('check083.service_long_note'), 'check violation')
) AS t(check_name, got, expected);
