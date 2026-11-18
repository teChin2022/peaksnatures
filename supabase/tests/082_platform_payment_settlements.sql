-- Checks for migration 082 (platform_payment_settlements). Run the whole file
-- in the Supabase SQL editor AFTER applying 082. It writes nothing: every write
-- it tries is rolled back inside its own block (or refused). The last
-- statement returns one row per check; every row should say PASS.
-- pgTAP is owed (not set up yet).
--
-- Who may touch the table: only the admin routes, through the service role.
-- anon and authenticated (hosts, staff, guests with a session) get nothing.

-- A history log the probes can point at without colliding with a real settlement.
SELECT set_config('check082.log', coalesce((
  SELECT l.id::text FROM history_logs l
  WHERE NOT EXISTS (SELECT 1 FROM platform_payment_settlements s WHERE s.history_log_id = l.id)
  LIMIT 1), ''), false);

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
    WHEN insufficient_privilege THEN PERFORM set_config('check082.' || name, 'refused', false);
    WHEN raise_exception THEN
      PERFORM set_config('check082.' || name,
        CASE WHEN SQLERRM = 'probe-rollback:0' THEN 'no row matched' ELSE 'allowed' END, false);
    WHEN OTHERS THEN PERFORM set_config('check082.' || name, 'error: ' || SQLERRM, false);
  END;
END $$;

-- The probes, run once per role.
CREATE OR REPLACE FUNCTION pg_temp.probe(who text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.try(who || '_select', 'SELECT 1 FROM public.platform_payment_settlements LIMIT 1');
  PERFORM pg_temp.try(who || '_insert', format(
    'INSERT INTO public.platform_payment_settlements (history_log_id, settled_by_name) VALUES (%L, %L)',
    current_setting('check082.log'), 'check082'));
  PERFORM pg_temp.try(who || '_update', 'UPDATE public.platform_payment_settlements SET note = ''x''');
  PERFORM pg_temp.try(who || '_delete', 'DELETE FROM public.platform_payment_settlements');
END $$;

-- As a guest without a session --------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, false);
SET ROLE anon;
SELECT pg_temp.probe('anon');
RESET ROLE;

-- As any signed-in user (host, staff, or an admin's own session) ----------------
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT pg_temp.probe('auth');
RESET ROLE;

-- As the service role (the admin routes) -----------------------------------------
SET ROLE service_role;
SELECT pg_temp.probe('service');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

-- Results --------------------------------------------------------------------------
SELECT check_name, got, expected, CASE WHEN got = expected THEN 'PASS' ELSE 'FAIL' END AS result
FROM (VALUES
  ('a history log to probe with exists', CASE WHEN current_setting('check082.log') <> '' THEN 'yes' ELSE 'no' END, 'yes'),
  ('RLS is on', (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.platform_payment_settlements'::regclass), 'true'),
  ('no RLS policies (service role only)', (SELECT count(*)::text FROM pg_policies WHERE tablename = 'platform_payment_settlements'), '0'),
  ('anon cannot read', current_setting('check082.anon_select'), 'refused'),
  ('anon cannot insert', current_setting('check082.anon_insert'), 'refused'),
  ('anon cannot update', current_setting('check082.anon_update'), 'refused'),
  ('anon cannot delete', current_setting('check082.anon_delete'), 'refused'),
  ('authenticated cannot read', current_setting('check082.auth_select'), 'refused'),
  ('authenticated cannot insert', current_setting('check082.auth_insert'), 'refused'),
  ('authenticated cannot update', current_setting('check082.auth_update'), 'refused'),
  ('authenticated cannot delete', current_setting('check082.auth_delete'), 'refused'),
  -- SELECT returns no row on an empty table; either way it was not refused.
  ('service role can read', replace(current_setting('check082.service_select'), 'no row matched', 'allowed'), 'allowed'),
  ('service role can insert (rolled back)', current_setting('check082.service_insert'), 'allowed'),
  ('service role cannot update (settlements are not edited)', current_setting('check082.service_update'), 'refused'),
  -- DELETE on an empty table matches nothing; it must not be refused.
  ('service role can delete (rolled back)', replace(current_setting('check082.service_delete'), 'no row matched', 'allowed'), 'allowed')
) AS t(check_name, got, expected);
