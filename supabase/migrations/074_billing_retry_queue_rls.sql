-- ============================================================================
-- 074: Turn on RLS for billing_retry_queue.
--
-- 044 created the table without ENABLE ROW LEVEL SECURITY, and nothing since
-- has enabled it. Under Supabase's default grants on public tables, anyone
-- holding the public anon key could then read, insert, update or delete retry
-- rows through PostgREST: queue a refund_commission row that the daily cron
-- pays out, or mark a pending deduction resolved so it is never retried.
--
-- Every reader and writer (enqueueBillingRetry and processBillingRetryQueue in
-- src/lib/billing.ts) uses the service-role client, which bypasses RLS, so RLS
-- with zero policies changes nothing for the app. Same posture as login_otps
-- (011) and booking_drafts (067).
--
-- Rollback: ALTER TABLE billing_retry_queue DISABLE ROW LEVEL SECURITY;
-- ============================================================================

ALTER TABLE billing_retry_queue ENABLE ROW LEVEL SECURITY;
