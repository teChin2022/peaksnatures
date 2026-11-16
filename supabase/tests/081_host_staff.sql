-- Checks for migration 081 (staff logins). Run the whole file in the Supabase
-- SQL editor AFTER applying 081 and after adding one staff login from the
-- dashboard. It writes nothing: every write it tries is rolled back inside its
-- own block (or refused). The last statement returns one row per check; every
-- row should say PASS. pgTAP is owed (not set up yet).
--
-- EDIT THIS LINE: the auth user id of a staff login (host_staff.user_id).
SELECT set_config('check081.staff', '00000000-0000-0000-0000-000000000000', false);

-- Who is who, read as the table owner before switching roles.
SELECT set_config('check081.host', (SELECT host_id::text FROM host_staff WHERE user_id = current_setting('check081.staff')::uuid), false);
SELECT set_config('check081.owner', (SELECT user_id::text FROM hosts WHERE id = current_setting('check081.host')::uuid), false);
SELECT set_config('check081.booking', coalesce((
  SELECT b.id::text FROM bookings b JOIN homestays h ON h.id = b.homestay_id
  WHERE h.host_id = current_setting('check081.host')::uuid LIMIT 1), ''), false);

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
    WHEN insufficient_privilege THEN PERFORM set_config('check081.' || name, 'refused', false);
    WHEN raise_exception THEN
      PERFORM set_config('check081.' || name,
        CASE WHEN SQLERRM = 'probe-rollback:0' THEN 'no row matched' ELSE 'allowed' END, false);
    WHEN OTHERS THEN PERFORM set_config('check081.' || name, 'error: ' || SQLERRM, false);
  END;
END $$;

-- As the staff login ------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('check081.staff'), 'role', 'authenticated')::text, false);
SET ROLE authenticated;

SELECT set_config('check081.staff_hosts', (SELECT count(*)::text FROM hosts), false);
SELECT set_config('check081.staff_own_host', (SELECT count(*)::text FROM hosts WHERE id = current_setting('check081.host')::uuid), false);
SELECT set_config('check081.staff_other_bookings', (
  SELECT count(*)::text FROM bookings b JOIN homestays h ON h.id = b.homestay_id
  WHERE h.host_id <> current_setting('check081.host')::uuid), false);
SELECT set_config('check081.staff_invoices', (SELECT count(*)::text FROM invoices), false);
SELECT set_config('check081.staff_wallet', (SELECT count(*)::text FROM wallet_transactions), false);
SELECT set_config('check081.staff_rows', (SELECT count(*)::text FROM host_staff), false);

SELECT pg_temp.try('staff_read_pin', 'SELECT security_pin_hash FROM hosts');
SELECT pg_temp.try('staff_read_line', 'SELECT line_channel_access_token FROM hosts');
SELECT pg_temp.try('staff_set_line', format($q$UPDATE hosts SET line_channel_access_token = 'audit-081' WHERE id = %L$q$, current_setting('check081.host')));
SELECT pg_temp.try('staff_set_name', format($q$UPDATE hosts SET name = 'audit-081' WHERE id = %L$q$, current_setting('check081.host')));
SELECT pg_temp.try('staff_set_deposit', format($q$UPDATE hosts SET deposit_amount = deposit_amount + 1 WHERE id = %L$q$, current_setting('check081.host')));
SELECT pg_temp.try('staff_reprice', format($q$UPDATE bookings SET total_price = total_price + 1 WHERE id = %L$q$, nullif(current_setting('check081.booking'), '')));
SELECT pg_temp.try('staff_status', format($q$UPDATE bookings SET status = status, updated_by = 'audit-081' WHERE id = %L$q$, nullif(current_setting('check081.booking'), '')));
SELECT pg_temp.try('staff_new_homestay', format($q$INSERT INTO homestays (host_id, name, slug) VALUES (%L, 'audit-081', 'audit-081-x')$q$, current_setting('check081.host')));

RESET ROLE;

-- As the owner of that host -----------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('check081.owner'), 'role', 'authenticated')::text, false);
SET ROLE authenticated;

SELECT set_config('check081.owner_hosts', (SELECT count(*)::text FROM hosts WHERE id = current_setting('check081.host')::uuid), false);
SELECT pg_temp.try('owner_read_pin', 'SELECT security_pin_hash FROM hosts');
SELECT pg_temp.try('owner_set_name', format($q$UPDATE hosts SET name = 'audit-081' WHERE id = %L$q$, current_setting('check081.host')));
SELECT pg_temp.try('owner_reprice', format($q$UPDATE bookings SET total_price = total_price + 1 WHERE id = %L$q$, nullif(current_setting('check081.booking'), '')));

RESET ROLE;

-- As anon ----------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"role":"anon"}', false);
SET ROLE anon;
SELECT set_config('check081.anon_rows', (SELECT count(*)::text FROM host_staff), false);
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

-- Results ---------------------------------------------------------------------
SELECT n, check_name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result
FROM (
  SELECT 1 AS n, 'host_staff has RLS on' AS check_name,
    EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'host_staff' AND rowsecurity) AS ok
  UNION ALL SELECT 2, 'authenticated cannot select hosts.security_pin_hash, line_channel_access_token, promptpay_id, bank_account_number, wallet_balance',
    NOT EXISTS (
      SELECT 1 FROM unnest(ARRAY['security_pin_hash', 'line_channel_access_token', 'promptpay_id', 'bank_account_number', 'wallet_balance']) c
      WHERE has_column_privilege('authenticated', 'public.hosts', c, 'SELECT'))
  UNION ALL SELECT 3, 'authenticated can still select the columns the browser reads',
    NOT EXISTS (
      SELECT 1 FROM unnest(ARRAY['id', 'user_id', 'name', 'plan_type', 'plan_free_expires_at', 'plan_pending_type', 'deposit_amount',
                                 'deposit_by_month', 'cancellation_days', 'booking_draft_hours', 'guest_booking_mode']) c
      WHERE NOT has_column_privilege('authenticated', 'public.hosts', c, 'SELECT'))
  UNION ALL SELECT 4, 'staff sees exactly one hosts row, its own host (' || current_setting('check081.staff_hosts', true) || ')',
    current_setting('check081.staff_hosts', true) = '1' AND current_setting('check081.staff_own_host', true) = '1'
  UNION ALL SELECT 5, 'staff sees no other host''s bookings (' || current_setting('check081.staff_other_bookings', true) || ')',
    current_setting('check081.staff_other_bookings', true) = '0'
  UNION ALL SELECT 6, 'staff sees no invoices or wallet transactions',
    current_setting('check081.staff_invoices', true) = '0' AND current_setting('check081.staff_wallet', true) = '0'
  UNION ALL SELECT 7, 'staff sees only its own host_staff row (' || current_setting('check081.staff_rows', true) || ')',
    current_setting('check081.staff_rows', true) = '1'
  UNION ALL SELECT 8, 'staff cannot read the PIN hash (' || current_setting('check081.staff_read_pin', true) || ')',
    current_setting('check081.staff_read_pin', true) = 'refused'
  UNION ALL SELECT 9, 'staff cannot read the LINE token (' || current_setting('check081.staff_read_line', true) || ')',
    current_setting('check081.staff_read_line', true) = 'refused'
  UNION ALL SELECT 10, 'staff cannot change the LINE token (' || current_setting('check081.staff_set_line', true) || ')',
    current_setting('check081.staff_set_line', true) = 'refused'
  UNION ALL SELECT 11, 'staff cannot rename the host (' || current_setting('check081.staff_set_name', true) || ')',
    current_setting('check081.staff_set_name', true) = 'refused'
  UNION ALL SELECT 12, 'staff can change the deposit (' || current_setting('check081.staff_set_deposit', true) || ')',
    current_setting('check081.staff_set_deposit', true) = 'allowed'
  UNION ALL SELECT 13, 'staff cannot reprice a booking (' || current_setting('check081.staff_reprice', true) || '; needs one booking)',
    current_setting('check081.staff_reprice', true) = 'refused'
  UNION ALL SELECT 14, 'staff can change a booking''s status (' || current_setting('check081.staff_status', true) || '; needs one booking)',
    current_setting('check081.staff_status', true) = 'allowed'
  UNION ALL SELECT 15, 'staff cannot create a homestay (' || current_setting('check081.staff_new_homestay', true) || ')',
    current_setting('check081.staff_new_homestay', true) = 'refused'
  UNION ALL SELECT 16, 'owner still sees its host row (' || current_setting('check081.owner_hosts', true) || ')',
    current_setting('check081.owner_hosts', true) = '1'
  UNION ALL SELECT 17, 'owner cannot read its own PIN hash over REST any more (' || current_setting('check081.owner_read_pin', true) || ')',
    current_setting('check081.owner_read_pin', true) = 'refused'
  UNION ALL SELECT 18, 'owner can still rename the host (' || current_setting('check081.owner_set_name', true) || ')',
    current_setting('check081.owner_set_name', true) = 'allowed'
  UNION ALL SELECT 19, 'owner can still edit a booking, unchanged by 081 (' || current_setting('check081.owner_reprice', true) || '; needs one booking)',
    current_setting('check081.owner_reprice', true) = 'allowed'
  UNION ALL SELECT 20, 'anon sees no host_staff rows (' || current_setting('check081.anon_rows', true) || ')',
    current_setting('check081.anon_rows', true) = '0'
) checks
ORDER BY n;
