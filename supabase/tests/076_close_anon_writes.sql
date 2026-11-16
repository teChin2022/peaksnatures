-- Checks for migration 076. Run the whole file in the Supabase SQL editor
-- AFTER applying 076. It writes nothing: the anon writes it tries are refused
-- (or, if a check fails, point at a homestay/room that does not exist and die
-- on the foreign key). The last statement returns one row per check; every
-- row should say PASS. pgTAP is owed (not set up yet).

-- Behaviour: try, as anon, the writes the audit found. Results go to session
-- settings because RAISE NOTICE output may not reach the SQL editor.
SET ROLE anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO booking_holds (room_id, check_in, check_out, session_id, expires_at)
    VALUES ('00000000-0000-0000-0000-000000000000', '2099-01-01', '2099-01-02', 'audit-076', '2099-01-01');
    PERFORM set_config('check076.hold', 'inserted', false);
  EXCEPTION
    WHEN insufficient_privilege THEN PERFORM set_config('check076.hold', 'refused', false);
    WHEN OTHERS THEN PERFORM set_config('check076.hold', 'got past the privilege check: ' || SQLERRM, false);
  END;

  BEGIN
    INSERT INTO bookings (homestay_id, guest_name, guest_email, guest_phone, check_in, check_out, num_guests, total_price, status)
    VALUES ('00000000-0000-0000-0000-000000000000', 'audit-076', 'a@b.co', '0800000000', '2099-01-01', '2099-01-02', 1, 0, 'confirmed');
    PERFORM set_config('check076.booking', 'inserted', false);
  EXCEPTION
    WHEN insufficient_privilege THEN PERFORM set_config('check076.booking', 'refused', false);
    WHEN OTHERS THEN PERFORM set_config('check076.booking', 'got past the privilege check: ' || SQLERRM, false);
  END;

  BEGIN
    PERFORM count(*) FROM history_logs;
    PERFORM set_config('check076.logs', 'read', false);
  EXCEPTION
    WHEN insufficient_privilege THEN PERFORM set_config('check076.logs', 'refused', false);
  END;

  BEGIN
    PERFORM get_admin_revenue_total();
    PERFORM set_config('check076.revenue', 'called', false);
  EXCEPTION
    WHEN insufficient_privilege THEN PERFORM set_config('check076.revenue', 'refused', false);
  END;
END $$;
RESET ROLE;

-- Results ---------------------------------------------------------------------
SELECT check_name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result
FROM (
  SELECT 1 AS n, 'no INSERT/DELETE policy open to everyone on bookings, booking_holds, reviews, date_change_requests' AS check_name,
    NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('bookings', 'booking_holds', 'reviews', 'date_change_requests')
        AND cmd IN ('INSERT', 'DELETE')
        AND (coalesce(with_check, '') = 'true' OR coalesce(qual, '') = 'true')
    ) AS ok
  UNION ALL
  SELECT 2, 'history_logs has RLS on',
    EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'history_logs' AND rowsecurity)
  UNION ALL
  SELECT 3, 'anon and authenticated hold no privilege on history_logs or booking_holds',
    NOT EXISTS (
      SELECT 1
      FROM (VALUES ('anon'), ('authenticated')) r(rolname)
      CROSS JOIN (VALUES ('history_logs'), ('booking_holds')) t(tbl)
      CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
      WHERE has_table_privilege(r.rolname, 'public.' || t.tbl, p.priv)
    )
  UNION ALL
  SELECT 4, 'anon cannot insert, update or delete bookings, reviews, date_change_requests',
    NOT EXISTS (
      SELECT 1
      FROM (VALUES ('bookings'), ('reviews'), ('date_change_requests')) t(tbl)
      CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
      WHERE has_table_privilege('anon', 'public.' || t.tbl, p.priv)
    )
  UNION ALL
  SELECT 5, 'anon and authenticated cannot execute the 12 service-role RPCs (any overload)',
    NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
      CROSS JOIN (VALUES ('anon'), ('authenticated')) r(rolname)
      WHERE ns.nspname = 'public'
        AND p.proname IN ('get_admin_revenue_total', 'create_booking_atomic', 'create_booking_group_atomic',
                          'acquire_booking_hold', 'approve_date_change_atomic', 'topup_wallet',
                          'refund_wallet_commission', 'deduct_wallet_commission', 'adjust_wallet',
                          'activate_fixed_rate_plan', 'prune_demand_events', 'prune_booking_drafts')
        AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
    )
  UNION ALL
  SELECT 6, 'service_role can still execute create_booking_atomic and acquire_booking_hold',
    NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname = 'public' AND p.proname IN ('create_booking_atomic', 'acquire_booking_hold')
        AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
    )
  UNION ALL
  SELECT 7, 'get_demand_stats still executable by authenticated (065, on purpose)',
    EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname = 'public' AND p.proname = 'get_demand_stats'
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
  UNION ALL
  SELECT 8, 'anon insert into booking_holds is refused (' || coalesce(current_setting('check076.hold', true), 'not run') || ')',
    current_setting('check076.hold', true) = 'refused'
  UNION ALL
  SELECT 9, 'anon insert into bookings is refused (' || coalesce(current_setting('check076.booking', true), 'not run') || ')',
    current_setting('check076.booking', true) = 'refused'
  UNION ALL
  SELECT 10, 'anon read of history_logs is refused (' || coalesce(current_setting('check076.logs', true), 'not run') || ')',
    current_setting('check076.logs', true) = 'refused'
  UNION ALL
  SELECT 11, 'anon call of get_admin_revenue_total is refused (' || coalesce(current_setting('check076.revenue', true), 'not run') || ')',
    current_setting('check076.revenue', true) = 'refused'
) checks
ORDER BY n;
