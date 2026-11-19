-- Checks for migration 086 (guest AI billing). Run the whole file in the
-- Supabase SQL editor AFTER applying 084, 085 and 086. Nothing stays: the
-- scenario runs inside a block that raises at the end, rolling it all back.
-- The last statement returns one row per check; every row should say PASS.
-- pgTAP is owed (not set up yet).

SELECT set_config('check086.host', coalesce((
  SELECT h.id::text FROM hosts h JOIN homestays s ON s.host_id = h.id
  WHERE h.id NOT IN (SELECT host_id FROM public.host_ai_settings) LIMIT 1
), ''), false);
SELECT set_config('check086.homestay', coalesce((
  SELECT id::text FROM homestays WHERE host_id::text = current_setting('check086.host') LIMIT 1
), ''), false);

CREATE OR REPLACE FUNCTION pg_temp.try(name text, stmt text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'probe-rollback';
  EXCEPTION
    WHEN insufficient_privilege THEN PERFORM set_config('check086.' || name, 'refused', false);
    WHEN raise_exception THEN PERFORM set_config('check086.' || name, 'allowed', false);
    WHEN OTHERS THEN PERFORM set_config('check086.' || name, 'error: ' || SQLERRM, false);
  END;
END $$;

SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, false);
SET ROLE anon;
SELECT pg_temp.try('anon_charge', format('SELECT * FROM public.charge_guest_ai_usage(%L, current_date)', gen_random_uuid()));
SELECT pg_temp.try('anon_reserve', format('SELECT public.reserve_guest_ai_reply(%L, %L, current_date, 0)', gen_random_uuid(), gen_random_uuid()));
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT pg_temp.try('auth_charge', format('SELECT * FROM public.charge_guest_ai_usage(%L, current_date)', gen_random_uuid()));
SELECT pg_temp.try('auth_reserve', format('SELECT public.reserve_guest_ai_reply(%L, %L, current_date, 0)', gen_random_uuid(), gen_random_uuid()));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

-- The money, as the service role, rolled back at the end --------------------------
SET ROLE service_role;
DO $$
DECLARE
  h uuid := nullif(current_setting('check086.host'), '')::uuid;
  s uuid := nullif(current_setting('check086.homestay'), '')::uuid;
  sess uuid;
  d date := ((now() AT TIME ZONE 'Asia/Bangkok')::date) - 1;
  seq text := '';
  r record;
BEGIN
  IF h IS NULL OR s IS NULL THEN
    PERFORM set_config('check086.scenario', 'no host with a homestay to test with', false);
    RETURN;
  END IF;
  BEGIN
    UPDATE public.hosts SET wallet_balance = 10, wallet_negative_since = NULL WHERE id = h;
    INSERT INTO public.host_ai_settings (host_id, status, enabled, daily_reply_cap) VALUES (h, 'approved', true, 100);
    UPDATE public.platform_guest_ai_config SET price_per_reply = 0.5, daily_cap = 100000, enabled = true;
    INSERT INTO public.guest_ai_sessions (host_id, homestay_id, reply_cap) VALUES (h, s, 100) RETURNING id INTO sess;

    -- Floor 9 with a ฿10 wallet: ฿0.50 → ceil 1 → 10-1 = 9 ok; two replies ฿1.00 → 9 ok; three ฿1.50 → ceil 2 → 8 < 9.
    seq := seq || public.reserve_guest_ai_reply(sess, h, d, 9) || ',';
    seq := seq || public.reserve_guest_ai_reply(sess, h, d, 9) || ',';
    seq := seq || public.reserve_guest_ai_reply(sess, h, d, 9) || ',';
    -- Floor 0 lets more through.
    seq := seq || public.reserve_guest_ai_reply(sess, h, d, 0) || ',';
    -- Accrued: 3 replies x ฿0.50 = ฿1.50 → charged ฿2 (rounded up).
    SELECT * INTO r FROM public.charge_guest_ai_usage(h, d);
    seq := seq || r.charged || '/' || r.new_balance || ',';
    -- A second charge of the same day takes nothing.
    SELECT * INTO r FROM public.charge_guest_ai_usage(h, d);
    seq := seq || r.charged || '/' || r.new_balance || ',';
    seq := seq || (SELECT count(*) FROM public.wallet_transactions WHERE host_id = h AND type = 'ai_usage' AND amount = -2) || ',';
    -- More owed than the wallet holds: charged down to zero, never below.
    UPDATE public.hosts SET wallet_balance = 1 WHERE id = h;
    INSERT INTO public.ai_usage_daily (host_id, day, replies, amount) VALUES (h, d - 1, 10, 5);
    SELECT * INTO r FROM public.charge_guest_ai_usage(h, d - 1);
    seq := seq || r.charged || '/' || r.new_balance || ',';
    seq := seq || coalesce((SELECT wallet_negative_since::text FROM public.hosts WHERE id = h), 'null');
    RAISE EXCEPTION 'rollback:%', seq;
  EXCEPTION WHEN raise_exception THEN
    PERFORM set_config('check086.scenario', replace(SQLERRM, 'rollback:', ''), false);
  END;
END $$;
RESET ROLE;

SELECT check_name, got, expected, CASE WHEN got = expected THEN 'PASS' ELSE 'FAIL' END AS result
FROM (VALUES
  ('price starts at 0 (trial stays free)', (SELECT price_per_reply::text FROM public.platform_guest_ai_config), '0.00'),
  ('only the 4-argument reserve exists', (SELECT count(*)::text FROM pg_proc WHERE proname = 'reserve_guest_ai_reply'), '1'),
  ('anon cannot charge', current_setting('check086.anon_charge'), 'refused'),
  ('anon cannot reserve', current_setting('check086.anon_reserve'), 'refused'),
  ('authenticated cannot charge', current_setting('check086.auth_charge'), 'refused'),
  ('authenticated cannot reserve', current_setting('check086.auth_reserve'), 'refused'),
  ('floor, round-up charge, once only, never below zero (rolled back)', current_setting('check086.scenario'),
    'ok,ok,wallet_low,ok,2/8,0/8,1,1/0,null')
) AS t(check_name, got, expected);
