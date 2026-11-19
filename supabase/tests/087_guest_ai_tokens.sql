-- Checks for migration 087 (guest AI token counts). Run the whole file in the
-- Supabase SQL editor AFTER applying 087. Nothing stays: the scenario raises
-- at the end, rolling itself back. Every row of the last statement should say PASS.
-- pgTAP is owed (not set up yet).

SELECT set_config('check087.host', coalesce((SELECT id::text FROM hosts LIMIT 1), ''), false);

CREATE OR REPLACE FUNCTION pg_temp.try(name text, stmt text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'probe-rollback';
  EXCEPTION
    WHEN insufficient_privilege THEN PERFORM set_config('check087.' || name, 'refused', false);
    WHEN raise_exception THEN PERFORM set_config('check087.' || name, 'allowed', false);
    WHEN OTHERS THEN PERFORM set_config('check087.' || name, 'error: ' || SQLERRM, false);
  END;
END $$;

SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, false);
SET ROLE anon;
SELECT pg_temp.try('anon_record', format('SELECT public.record_guest_ai_tokens(%L, current_date, 1, 1)', gen_random_uuid()));
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT pg_temp.try('auth_record', format('SELECT public.record_guest_ai_tokens(%L, current_date, 1, 1)', gen_random_uuid()));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

SET ROLE service_role;
DO $$
DECLARE
  h uuid := nullif(current_setting('check087.host'), '')::uuid;
  d date := '2000-01-01';
  r record;
BEGIN
  IF h IS NULL THEN
    PERFORM set_config('check087.scenario', 'no host to test with', false);
    RETURN;
  END IF;
  BEGIN
    INSERT INTO public.ai_usage_daily (host_id, day, replies) VALUES (h, d, 2);
    PERFORM public.record_guest_ai_tokens(h, d, 1200, 150);
    PERFORM public.record_guest_ai_tokens(h, d, 800, 50);
    -- Negative or null counts add nothing.
    PERFORM public.record_guest_ai_tokens(h, d, -5, NULL);
    SELECT input_tokens, output_tokens INTO r FROM public.ai_usage_daily WHERE host_id = h AND day = d;
    RAISE EXCEPTION 'rollback:%/%', r.input_tokens, r.output_tokens;
  EXCEPTION WHEN raise_exception THEN
    PERFORM set_config('check087.scenario', replace(SQLERRM, 'rollback:', ''), false);
  END;
END $$;
RESET ROLE;

SELECT check_name, got, expected, CASE WHEN got = expected THEN 'PASS' ELSE 'FAIL' END AS result
FROM (VALUES
  ('cost rates start at 0', (SELECT cost_in_per_mtok::text || '/' || cost_out_per_mtok::text FROM public.platform_guest_ai_config), '0.00/0.00'),
  ('anon cannot record', current_setting('check087.anon_record'), 'refused'),
  ('authenticated cannot record', current_setting('check087.auth_record'), 'refused'),
  ('tokens add up, never down (rolled back)', current_setting('check087.scenario'), '2000/200')
) AS t(check_name, got, expected);
