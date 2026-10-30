-- ============================================================================
-- 069: A host may only write their own profile columns from the browser.
--
-- WHY
-- "Hosts can update own record" (001) is a row filter, not a column filter.
-- With Supabase's default table grants, a signed-in host could PATCH any
-- column of their own row straight through PostgREST using the public anon
-- key: wallet_balance, plan_type, the Fixed Rate term, the rate overrides,
-- wallet_credit_limit, status, security_pin_hash. Every billing control in
-- the API routes rested on nobody trying.
--
-- RLS cannot restrict columns, so this narrows the privilege instead: UPDATE
-- is revoked from the browser roles and granted back on exactly the columns
-- the dashboard writes with the browser client.
--   profile/page.tsx          avatar_url, name, line_user_id,
--                             line_channel_access_token,
--                             notification_preference, require_otp
--   homestay/page.tsx         deposit_amount, deposit_by_month,
--                             cancellation_days, booking_draft_hours
--   setup-profile-modal.tsx   phone, promptpay_id
--   (all of the above)        updated_by
-- Every other write goes through an API route on the service-role client,
-- which this does not touch. updated_at is set by trg_hosts_updated_at, and a
-- trigger's own assignments are not checked against column privileges.
--
-- A NEW COLUMN THE BROWSER WRITES MUST BE ADDED TO THE GRANT BELOW, or that
-- save fails with 42501 (permission denied for table hosts).
--
-- Revoking the table-level privilege also revokes any column-level ones, so
-- the order matters: revoke first, then grant the allowlist.
-- ============================================================================

REVOKE UPDATE ON public.hosts FROM anon, authenticated;

GRANT UPDATE (
  name,
  avatar_url,
  line_user_id,
  line_channel_access_token,
  notification_preference,
  require_otp,
  deposit_amount,
  deposit_by_month,
  cancellation_days,
  booking_draft_hours,
  phone,
  promptpay_id,
  updated_by
) ON public.hosts TO authenticated;
