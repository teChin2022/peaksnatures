-- ============================================================================
-- 076: Close the direct anon/authenticated paths the API routes already cover.
--
-- Security audit 2026-11-15, findings F-07, F-08 and F-17. Every app reader and
-- writer of the objects below uses the service-role client, which bypasses
-- RLS and these grants, so the app does not change. What closes is the path
-- around the API: PostgREST with the public anon key (or any signed-in user).
--
-- F-07: four anon INSERT policies with WITH CHECK (true), plus a DELETE on
-- holds with USING (true). Through them anyone could insert a 'confirmed'
-- booking at any price with no overlap check, a hold with expires_at in 2099
-- (acquire_booking_hold then answers DATES_HELD to every other guest), a
-- review against any booking id, or a date-change request for any booking.
-- No browser code writes these tables: guests go through /api/bookings*,
-- /api/reviews and /api/bookings/change-dates (service role). The host
-- policies ("Hosts can manage ...") stay as they are; tightening hosts'
-- direct writes to bookings is the separate, deferred hardening.
--
-- F-08: history_logs (028) never had RLS, so under Supabase's default grants
-- anon could read every audit row (IP addresses, guest emails, booking ids)
-- and insert forged ones. Readers and the writer are service-role only
-- (src/lib/history-log.ts, /api/admin/logs, /api/health/cron). Same posture
-- as 074.
--
-- F-17: 048-071 revoke EXECUTE from PUBLIC only. Supabase grants EXECUTE on
-- new public functions to anon and authenticated directly, and revoking from
-- PUBLIC leaves those grants in place (CLAUDE.md). get_admin_revenue_total is
-- SECURITY DEFINER, so anon could read the platform's revenue. Every caller
-- below is a route or lib using the service-role client. get_demand_stats
-- keeps its deliberate grant to authenticated (065: SECURITY INVOKER over an
-- RLS-filtered table). Revoked per overload from pg_proc, because old
-- signatures may still exist on the live database and this repo cannot see it.
--
-- Rollback (restores the previous, open state; run only to undo this file):
--   CREATE POLICY "Anyone can create a booking" ON bookings FOR INSERT WITH CHECK (true);
--   CREATE POLICY "Anyone can create a hold" ON booking_holds FOR INSERT WITH CHECK (true);
--   CREATE POLICY "Users can delete own holds" ON booking_holds FOR DELETE USING (true);
--   CREATE POLICY "Anyone can insert a review" ON reviews FOR INSERT WITH CHECK (true);
--   CREATE POLICY "Anyone can insert date change requests" ON date_change_requests FOR INSERT WITH CHECK (true);
--   GRANT INSERT, UPDATE, DELETE ON bookings, reviews, date_change_requests TO anon;
--   GRANT ALL ON booking_holds, history_logs TO anon, authenticated;
--   ALTER TABLE history_logs DISABLE ROW LEVEL SECURITY;
--   GRANT EXECUTE ON FUNCTION <each function below> TO anon, authenticated;
--
-- Checks to run after applying: supabase/tests/076_close_anon_writes.sql.
-- ============================================================================

-- F-07 -----------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can create a booking" ON bookings;
DROP POLICY IF EXISTS "Anyone can create a hold" ON booking_holds;
DROP POLICY IF EXISTS "Users can delete own holds" ON booking_holds;
DROP POLICY IF EXISTS "Anyone can insert a review" ON reviews;
DROP POLICY IF EXISTS "Anyone can insert date change requests" ON date_change_requests;

-- Belt and braces under RLS: anon has no business writing any of these, and
-- nobody but the service role touches holds.
REVOKE INSERT, UPDATE, DELETE ON bookings, reviews, date_change_requests FROM anon;
REVOKE ALL ON booking_holds FROM anon, authenticated;

-- F-08 -----------------------------------------------------------------------
ALTER TABLE history_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON history_logs FROM anon, authenticated;

-- F-17 -----------------------------------------------------------------------
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'get_admin_revenue_total',
        'create_booking_atomic',
        'create_booking_group_atomic',
        'acquire_booking_hold',
        'approve_date_change_atomic',
        'topup_wallet',
        'refund_wallet_commission',
        'deduct_wallet_commission',
        'adjust_wallet',
        'activate_fixed_rate_plan',
        'prune_demand_events',
        'prune_booking_drafts'
      ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
