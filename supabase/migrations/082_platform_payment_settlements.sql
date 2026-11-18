-- 082: mark a rejected platform payment as settled by hand.
--
-- A PLATFORM_PAYMENT_REJECTED entry in history_logs is a real transfer the
-- platform refused after EasySlip verified it (see the activate, invoice pay
-- and wallet top-up routes). An admin settles it outside the app; this table
-- records that they did, so /admin/billing/rejected and the overview stop
-- counting it. history_logs itself stays append-only (no-delete trigger, 028).
--
-- Written and read only by the admin routes with the service role: RLS is on
-- with no policies, and anon/authenticated hold no grants.
--
-- Rollback (loses the settled marks, nothing else):
--   DROP TABLE public.platform_payment_settlements;

CREATE TABLE public.platform_payment_settlements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One settlement per rejected payment.
  history_log_id  UUID NOT NULL UNIQUE REFERENCES public.history_logs(id),
  settled_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Name at the time, so the record survives the admin account being removed.
  settled_by_name TEXT NOT NULL,
  note            TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_payment_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_payment_settlements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.platform_payment_settlements TO service_role;
