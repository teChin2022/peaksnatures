-- Checks for migration 084 (host_ai_settings). Run the whole file in the
-- Supabase SQL editor AFTER applying 084. It writes nothing: every write it
-- tries is rolled back inside its own block (or refused). The last statement
-- returns one row per check; every row should say PASS.
-- pgTAP is owed (not set up yet).
--
-- Who may touch the table: only /api/host/ai-admin and the admin AI routes,
-- through the service role, which scope every query to the caller. anon and
-- authenticated (owners, staff, guests with a session) get nothing directly,
-- so a host cannot approve itself or raise its own daily cap.

-- A host without a row yet, so the insert probe cannot hit the primary key.
SELECT set_config('check084.host', coalesce((
  SELECT id::text FROM hosts WHERE id NOT IN (SELECT host_id FROM public.host_ai_settings) LIMIT 1
), ''), false);

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
    WHEN insufficient_privilege THEN PERFORM set_config('check084.' || name, 'refused', false);
    WHEN check_violation THEN PERFORM set_config('check084.' || name, 'check violation', false);
    WHEN raise_exception THEN
      PERFORM set_config('check084.' || name,
        CASE WHEN SQLERRM = 'probe-rollback:0' THEN 'no row matched' ELSE 'allowed' END, false);
    WHEN OTHERS THEN PERFORM set_config('check084.' || name, 'error: ' || SQLERRM, false);
  END;
END $$;

-- The probes, run once per role.
CREATE OR REPLACE FUNCTION pg_temp.probe(who text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.try(who || '_select', 'SELECT 1 FROM public.host_ai_settings LIMIT 1');
  PERFORM pg_temp.try(who || '_insert', format(
    'INSERT INTO public.host_ai_settings (host_id) VALUES (%L)', current_setting('check084.host')));
  -- The self-approval a host session must never manage.
  PERFORM pg_temp.try(who || '_update', 'UPDATE public.host_ai_settings SET status = ''approved'', daily_reply_cap = 1000');
  PERFORM pg_temp.try(who || '_delete', 'DELETE FROM public.host_ai_settings');
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

-- As the service role (the API routes) --------------------------------------------
SET ROLE service_role;
SELECT pg_temp.probe('service');
-- The CHECKs hold even for the service role.
SELECT pg_temp.try('service_bad_status', format(
  'INSERT INTO public.host_ai_settings (host_id, status) VALUES (%L, %L)', current_setting('check084.host'), 'live'));
SELECT pg_temp.try('service_long_instructions', format(
  'INSERT INTO public.host_ai_settings (host_id, instructions) VALUES (%L, %L)', current_setting('check084.host'), repeat('x', 2001)));
SELECT pg_temp.try('service_cap_too_high', format(
  'INSERT INTO public.host_ai_settings (host_id, daily_reply_cap) VALUES (%L, %s)', current_setting('check084.host'), 1001));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

-- Results --------------------------------------------------------------------------
SELECT check_name, got, expected, CASE WHEN got = expected THEN 'PASS' ELSE 'FAIL' END AS result
FROM (VALUES
  ('a host to probe with exists', CASE WHEN current_setting('check084.host') <> '' THEN 'yes' ELSE 'no' END, 'yes'),
  ('RLS is on', (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.host_ai_settings'::regclass), 'true'),
  ('no RLS policies (service role only)', (SELECT count(*)::text FROM pg_policies WHERE tablename = 'host_ai_settings'), '0'),
  ('anon cannot read', current_setting('check084.anon_select'), 'refused'),
  ('anon cannot insert', current_setting('check084.anon_insert'), 'refused'),
  ('anon cannot update', current_setting('check084.anon_update'), 'refused'),
  ('anon cannot delete', current_setting('check084.anon_delete'), 'refused'),
  ('authenticated cannot read', current_setting('check084.auth_select'), 'refused'),
  ('authenticated cannot insert', current_setting('check084.auth_insert'), 'refused'),
  ('authenticated cannot approve itself', current_setting('check084.auth_update'), 'refused'),
  ('authenticated cannot delete', current_setting('check084.auth_delete'), 'refused'),
  -- SELECT returns no row on an empty table; either way it was not refused.
  ('service role can read', replace(current_setting('check084.service_select'), 'no row matched', 'allowed'), 'allowed'),
  ('service role can insert (rolled back)', current_setting('check084.service_insert'), 'allowed'),
  ('service role can update (rolled back)', replace(current_setting('check084.service_update'), 'no row matched', 'allowed'), 'allowed'),
  ('service role can delete (rolled back)', replace(current_setting('check084.service_delete'), 'no row matched', 'allowed'), 'allowed'),
  ('unknown status is refused', current_setting('check084.service_bad_status'), 'check violation'),
  ('instructions over 2000 characters are refused', current_setting('check084.service_long_instructions'), 'check violation'),
  ('daily cap over 1000 is refused', current_setting('check084.service_cap_too_high'), 'check violation')
) AS t(check_name, got, expected);
