-- ============================================================================
-- 081: Staff logins for hosts (บัญชีทีมงาน).
--
-- WHY
-- Hosts handed their own email + password to the people who run their site,
-- giving them billing, wallet, PromptPay and the security PIN too. An owner
-- now creates separate logins (POST /api/host/staff) for staff who may work
-- the dashboard but not the money or the account ("all but money",
-- 2026-11-16).
--
-- WHAT
-- 1. host_staff: one row per staff login, user_id unique (a login works for
--    one host). Written only by the service role (/api/host/staff); a staff
--    session reads its own row.
-- 2. Staff policies, added NEXT TO the owner policies (owner policies are not
--    touched). Only the operations the dashboard performs from the browser
--    get one; everything else stays owner-only. Not for staff: invoices,
--    wallet_transactions, push_subscriptions, booking_groups, demand_events
--    (the demand panel reads through the service role), reviews, storage.
-- 3. hosts SELECT becomes a column allowlist. Without it a staff SELECT policy
--    would expose security_pin_hash (bcrypt of 4-6 digits, brute-forced
--    offline in minutes), line_channel_access_token, bank details, wallet and
--    commission overrides. The list is every column the app reads from hosts
--    through a user session (browser client or createServerSupabaseClient):
--      dashboard-shell.tsx   id, user_id, plan_type, plan_free_expires_at,
--                            plan_pending_type
--      bookings/page.tsx     id, name, plan_type
--      homestay/page.tsx     id, name, deposit_amount, deposit_by_month,
--                            cancellation_days, booking_draft_hours,
--                            guest_booking_mode
--      calendar, checkins, promo-codes, rooms pages; api/blocked-dates
--                            id, name
--      RLS policies          id, user_id
--    Every select("*") / hosts(*) read of hosts runs on the service role and
--    is not affected. The owner's own row loses the other columns over REST
--    too; the dashboard reads them through /api/host/profile.
--    A NEW COLUMN THE BROWSER READS MUST BE ADDED TO THE GRANT BELOW, or that
--    read fails with 42501 (permission denied for table hosts).
-- 4. Guard triggers. Grants are per role, not per user, so a staff session has
--    the owner's column privileges. BEFORE UPDATE triggers narrow staff
--    writes to an allowlist (new columns are owner-only by default):
--      hosts     the booking settings on the homestay page
--      bookings  status (the bookings page confirms/completes directly);
--                staff cannot reprice or edit guest data over REST. Owners
--                keep today's behaviour (that hardening is still pending).
--    The service role (auth.uid() is null) and owners pass.
--
-- APPLY BEFORE deploying the code that reads host_staff. Safe with the old
-- code: nothing it reads through a user session loses a column.
--
-- Rollback (staff logins stop working; delete their auth users first if the
-- feature is being dropped):
--   DROP TRIGGER IF EXISTS trg_hosts_staff_guard ON public.hosts;
--   DROP TRIGGER IF EXISTS trg_bookings_staff_guard ON public.bookings;
--   DROP FUNCTION IF EXISTS public.hosts_staff_guard();
--   DROP FUNCTION IF EXISTS public.bookings_staff_guard();
--   DROP TABLE IF EXISTS public.host_staff CASCADE;  -- also drops every "Staff can" policy
--   GRANT SELECT ON public.hosts TO authenticated;
--
-- Checks: supabase/tests/081_host_staff.sql.
-- ============================================================================

-- 1. host_staff ---------------------------------------------------------------

CREATE TABLE public.host_staff (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id    UUID NOT NULL REFERENCES public.hosts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_host_staff_host ON public.host_staff (host_id);

ALTER TABLE public.host_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own staff row"
  ON public.host_staff FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Writes go through the service role only.
REVOKE INSERT, UPDATE, DELETE ON public.host_staff FROM anon, authenticated;

-- 2. Staff policies -----------------------------------------------------------
-- Predicates: by host, by homestay, by room. host_staff's own policy never
-- reads hosts, so these cannot recurse.

-- hosts
CREATE POLICY "Staff can view their host"
  ON public.hosts FOR SELECT TO authenticated
  USING (id IN (SELECT s.host_id FROM public.host_staff s WHERE s.user_id = (SELECT auth.uid())));

CREATE POLICY "Staff can update their host"
  ON public.hosts FOR UPDATE TO authenticated
  USING (id IN (SELECT s.host_id FROM public.host_staff s WHERE s.user_id = (SELECT auth.uid())))
  WITH CHECK (id IN (SELECT s.host_id FROM public.host_staff s WHERE s.user_id = (SELECT auth.uid())));

-- homestays (no INSERT/DELETE: the owner sets the homestay up before adding staff)
CREATE POLICY "Staff can view their host's homestays"
  ON public.homestays FOR SELECT TO authenticated
  USING (host_id IN (SELECT s.host_id FROM public.host_staff s WHERE s.user_id = (SELECT auth.uid())));

CREATE POLICY "Staff can update their host's homestays"
  ON public.homestays FOR UPDATE TO authenticated
  USING (host_id IN (SELECT s.host_id FROM public.host_staff s WHERE s.user_id = (SELECT auth.uid())))
  WITH CHECK (host_id IN (SELECT s.host_id FROM public.host_staff s WHERE s.user_id = (SELECT auth.uid())));

-- Tables keyed by homestay_id.
DO $$
DECLARE
  pred CONSTANT TEXT := 'homestay_id IN (SELECT h.id FROM public.homestays h JOIN public.host_staff s ON s.host_id = h.host_id WHERE s.user_id = (SELECT auth.uid()))';
  t TEXT;
  op TEXT;
BEGIN
  FOR t, op IN
    SELECT * FROM (VALUES
      ('homestay_slug_redirects', 'SELECT'), ('homestay_slug_redirects', 'INSERT'), ('homestay_slug_redirects', 'UPDATE'),
      ('rooms', 'SELECT'), ('rooms', 'INSERT'), ('rooms', 'UPDATE'), ('rooms', 'DELETE'),
      ('bookings', 'SELECT'), ('bookings', 'UPDATE'),
      ('blocked_dates', 'SELECT'), ('blocked_dates', 'INSERT'), ('blocked_dates', 'DELETE'),
      ('promo_codes', 'SELECT'), ('promo_codes', 'INSERT'), ('promo_codes', 'UPDATE'),
      ('booking_attachments', 'SELECT')
    ) AS v(t, op)
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR %s TO authenticated %s',
      'Staff can ' || lower(op) || ' ' || t || ' of their host',
      t,
      op,
      CASE op
        WHEN 'INSERT' THEN format('WITH CHECK (%s)', pred)
        WHEN 'UPDATE' THEN format('USING (%s) WITH CHECK (%s)', pred, pred)
        ELSE format('USING (%s)', pred)
      END
    );
  END LOOP;
END $$;

-- Tables keyed by room_id (the houses page edits all four).
DO $$
DECLARE
  pred CONSTANT TEXT := 'room_id IN (SELECT r.id FROM public.rooms r JOIN public.homestays h ON h.id = r.homestay_id JOIN public.host_staff s ON s.host_id = h.host_id WHERE s.user_id = (SELECT auth.uid()))';
  t TEXT;
  op TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['room_seasonal_prices', 'room_special_prices', 'room_options', 'room_guest_pricing'] LOOP
    FOREACH op IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR %s TO authenticated %s',
        'Staff can ' || lower(op) || ' ' || t || ' of their host',
        t,
        op,
        CASE op
          WHEN 'INSERT' THEN format('WITH CHECK (%s)', pred)
          WHEN 'UPDATE' THEN format('USING (%s) WITH CHECK (%s)', pred, pred)
          ELSE format('USING (%s)', pred)
        END
      );
    END LOOP;
  END LOOP;
END $$;

-- Read-only, keyed through another table. Date changes are approved and
-- rejected by API routes on the service role.
CREATE POLICY "Staff can select date_change_requests of their host"
  ON public.date_change_requests FOR SELECT TO authenticated
  USING (booking_id IN (
    SELECT b.id FROM public.bookings b
    JOIN public.homestays h ON h.id = b.homestay_id
    JOIN public.host_staff s ON s.host_id = h.host_id
    WHERE s.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Staff can select promo_redemptions of their host"
  ON public.promo_redemptions FOR SELECT TO authenticated
  USING (promo_code_id IN (
    SELECT pc.id FROM public.promo_codes pc
    JOIN public.homestays h ON h.id = pc.homestay_id
    JOIN public.host_staff s ON s.host_id = h.host_id
    WHERE s.user_id = (SELECT auth.uid())
  ));

-- 3. hosts SELECT allowlist ---------------------------------------------------
-- Revoking the table-level privilege also drops column-level SELECT grants,
-- so revoke first, then grant the list. UPDATE grants (069/075/079) are a
-- different privilege and stay as they are.

REVOKE SELECT ON public.hosts FROM authenticated;

GRANT SELECT (
  id,
  user_id,
  name,
  plan_type,
  plan_free_expires_at,
  plan_pending_type,
  deposit_amount,
  deposit_by_month,
  cancellation_days,
  booking_draft_hours,
  guest_booking_mode
) ON public.hosts TO authenticated;

-- 4. Guard triggers -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hosts_staff_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  allowed CONSTANT TEXT[] := ARRAY[
    'deposit_amount', 'deposit_by_month', 'cancellation_days',
    'booking_draft_hours', 'guest_booking_mode', 'updated_by', 'updated_at'
  ];
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() IS DISTINCT FROM OLD.user_id
     AND (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'Only the host owner can change these settings'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hosts_staff_guard
  BEFORE UPDATE ON public.hosts
  FOR EACH ROW EXECUTE FUNCTION public.hosts_staff_guard();

CREATE OR REPLACE FUNCTION public.bookings_staff_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  allowed CONSTANT TEXT[] := ARRAY['status', 'updated_by', 'updated_at'];
BEGIN
  IF auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.host_staff s WHERE s.user_id = auth.uid())
     AND (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'Staff can only change a booking''s status'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bookings_staff_guard
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_staff_guard();
