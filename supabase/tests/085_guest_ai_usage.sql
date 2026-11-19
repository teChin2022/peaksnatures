-- Checks for migration 085 (guest AI limits). Run the whole file in the
-- Supabase SQL editor AFTER applying 084 and 085, and BEFORE 086: 086 replaces
-- reserve_guest_ai_reply with a 4-argument version (086's own checks cover it). It writes nothing that
-- stays: the cap scenario runs inside a block that raises at the end, which
-- rolls everything in it back. The last statement returns one row per check;
-- every row should say PASS. pgTAP is owed (not set up yet).

-- A host without an AI row yet, and one of its homestays, for the scenario.
SELECT set_config('check085.host', coalesce((
  SELECT h.id::text FROM hosts h JOIN homestays s ON s.host_id = h.id
  WHERE h.id NOT IN (SELECT host_id FROM public.host_ai_settings) LIMIT 1
), ''), false);
SELECT set_config('check085.homestay', coalesce((
  SELECT id::text FROM homestays WHERE host_id::text = current_setting('check085.host') LIMIT 1
), ''), false);

CREATE OR REPLACE FUNCTION pg_temp.try(name text, stmt text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  BEGIN
    EXECUTE stmt;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE EXCEPTION 'probe-rollback:%', n;
  EXCEPTION
    WHEN insufficient_privilege THEN PERFORM set_config('check085.' || name, 'refused', false);
    WHEN raise_exception THEN
      PERFORM set_config('check085.' || name,
        CASE WHEN SQLERRM = 'probe-rollback:0' THEN 'no row matched' ELSE 'allowed' END, false);
    WHEN OTHERS THEN PERFORM set_config('check085.' || name, 'error: ' || SQLERRM, false);
  END;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.probe(who text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.try(who || '_config_read', 'SELECT 1 FROM public.platform_guest_ai_config');
  PERFORM pg_temp.try(who || '_config_write', 'UPDATE public.platform_guest_ai_config SET daily_cap = 100000');
  PERFORM pg_temp.try(who || '_sessions_read', 'SELECT 1 FROM public.guest_ai_sessions LIMIT 1');
  PERFORM pg_temp.try(who || '_usage_write', 'DELETE FROM public.ai_usage_daily');
  PERFORM pg_temp.try(who || '_reserve', format(
    'SELECT public.reserve_guest_ai_reply(%L, %L, current_date)', gen_random_uuid(), gen_random_uuid()));
  PERFORM pg_temp.try(who || '_release', format(
    'SELECT public.release_guest_ai_reply(%L, %L, current_date)', gen_random_uuid(), gen_random_uuid()));
END $$;

SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, false);
SET ROLE anon;
SELECT pg_temp.probe('anon');
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT pg_temp.probe('auth');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

-- The caps, as the service role, rolled back at the end ---------------------------
SET ROLE service_role;
DO $$
DECLARE
  h uuid := nullif(current_setting('check085.host'), '')::uuid;
  s uuid := nullif(current_setting('check085.homestay'), '')::uuid;
  sess uuid;
  d date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  r text;
  seq text := '';
BEGIN
  IF h IS NULL OR s IS NULL THEN
    PERFORM set_config('check085.scenario', 'no host with a homestay to test with', false);
    RETURN;
  END IF;
  BEGIN
    INSERT INTO public.guest_ai_sessions (host_id, homestay_id, reply_cap) VALUES (h, s, 3) RETURNING id INTO sess;
    -- Not approved yet.
    seq := seq || public.reserve_guest_ai_reply(sess, h, d) || ',';
    INSERT INTO public.host_ai_settings (host_id, status, enabled, daily_reply_cap) VALUES (h, 'approved', true, 2);
    -- Two fit the host cap of 2, the third does not.
    seq := seq || public.reserve_guest_ai_reply(sess, h, d) || ',';
    seq := seq || public.reserve_guest_ai_reply(sess, h, d) || ',';
    seq := seq || public.reserve_guest_ai_reply(sess, h, d) || ',';
    -- A failed call gives one back, so one more fits.
    PERFORM public.release_guest_ai_reply(sess, h, d);
    seq := seq || public.reserve_guest_ai_reply(sess, h, d) || ',';
    -- With the host cap raised, the session's own cap (now 2 used of 2) stops it.
    UPDATE public.host_ai_settings SET daily_reply_cap = 10 WHERE host_id = h;
    UPDATE public.guest_ai_sessions SET reply_cap = 2 WHERE id = sess;
    seq := seq || public.reserve_guest_ai_reply(sess, h, d) || ',';
    -- Another host's session is refused.
    seq := seq || public.reserve_guest_ai_reply(sess, gen_random_uuid(), d) || ',';
    -- The platform cap, then the kill switch.
    UPDATE public.guest_ai_sessions SET reply_cap = 10 WHERE id = sess;
    UPDATE public.platform_guest_ai_config SET daily_cap = 2;
    seq := seq || public.reserve_guest_ai_reply(sess, h, d) || ',';
    UPDATE public.platform_guest_ai_config SET enabled = false;
    seq := seq || public.reserve_guest_ai_reply(sess, h, d);
    RAISE EXCEPTION 'rollback:%', seq;
  EXCEPTION WHEN raise_exception THEN
    PERFORM set_config('check085.scenario', replace(SQLERRM, 'rollback:', ''), false);
  END;
END $$;
RESET ROLE;

SELECT check_name, got, expected, CASE WHEN got = expected THEN 'PASS' ELSE 'FAIL' END AS result
FROM (VALUES
  ('RLS on, no policies (config)', (SELECT relrowsecurity::text || ',' || (SELECT count(*) FROM pg_policies WHERE tablename = 'platform_guest_ai_config')::text FROM pg_class WHERE oid = 'public.platform_guest_ai_config'::regclass), 'true,0'),
  ('RLS on, no policies (sessions)', (SELECT relrowsecurity::text || ',' || (SELECT count(*) FROM pg_policies WHERE tablename = 'guest_ai_sessions')::text FROM pg_class WHERE oid = 'public.guest_ai_sessions'::regclass), 'true,0'),
  ('RLS on, no policies (usage)', (SELECT relrowsecurity::text || ',' || (SELECT count(*) FROM pg_policies WHERE tablename = 'ai_usage_daily')::text FROM pg_class WHERE oid = 'public.ai_usage_daily'::regclass), 'true,0'),
  ('one config row, on, cap 300', (SELECT count(*)::text || ',' || bool_and(enabled)::text || ',' || max(daily_cap)::text FROM public.platform_guest_ai_config), '1,true,300'),
  ('anon cannot read the config', current_setting('check085.anon_config_read'), 'refused'),
  ('anon cannot change the config', current_setting('check085.anon_config_write'), 'refused'),
  ('anon cannot read sessions', current_setting('check085.anon_sessions_read'), 'refused'),
  ('anon cannot touch usage', current_setting('check085.anon_usage_write'), 'refused'),
  ('anon cannot reserve', current_setting('check085.anon_reserve'), 'refused'),
  ('anon cannot release', current_setting('check085.anon_release'), 'refused'),
  ('authenticated cannot read the config', current_setting('check085.auth_config_read'), 'refused'),
  ('authenticated cannot change the config', current_setting('check085.auth_config_write'), 'refused'),
  ('authenticated cannot read sessions', current_setting('check085.auth_sessions_read'), 'refused'),
  ('authenticated cannot touch usage', current_setting('check085.auth_usage_write'), 'refused'),
  ('authenticated cannot reserve', current_setting('check085.auth_reserve'), 'refused'),
  ('authenticated cannot release', current_setting('check085.auth_release'), 'refused'),
  ('caps, in order (rolled back)', current_setting('check085.scenario'),
    'host_off,ok,ok,host_cap,ok,session_cap,session_invalid,platform_cap,platform_off')
) AS t(check_name, got, expected);
