-- ============================================================================
-- 070: One function writes every Fixed Rate term and the invoice behind it.
--
-- WHY
-- 066 made the host-paid activation atomic: the invoice and the plan flip
-- commit together or not at all. The other three writers of a term — the
-- cron's renewal, the cron's monthly billing and the admin "Set Plan" — still
-- made two PostgREST calls, host row first and invoice second, and swallowed a
-- failed insert. That left a running term with no invoice behind it, the exact
-- bug 066 was written to stop. Nothing made them idempotent either, so a cron
-- delivered twice issued the same invoice twice.
--
-- This generalizes activate_fixed_rate_plan rather than adding a second
-- function, so all four writers share one definition of "start a term":
--   p_status = 'paid'     born settled — a verified slip (activate) or an
--                         arrangement an admin settled offline. Never blocks.
--   p_status = 'pending'  a bill the host still owes (cron renewal and the
--                         lapsed-term sweep), due on p_due_date.
--   p_due_date NULL       means period_start, what a paid row always used.
--
-- GUARDS, taken under the per-host advisory lock the wallet RPCs share:
--   * 'paid' while the host already has a term running on p_period_start
--     raises ALREADY_ACTIVE. Two activations paid with two different slips can
--     both clear the route's own check; only one may buy the period.
--   * 'pending' when this host already has an invoice for exactly this period
--     returns that invoice's id and writes nothing, so a re-run is a no-op.
--
-- The caller still owns the money math (src/lib/billing-calc.ts); this
-- function deliberately prices nothing.
--
-- The old 11-argument signature is dropped: PostgREST resolves an RPC by its
-- argument names, and with both overloads present a call naming only the
-- original eleven matches both and fails as ambiguous.
--
-- DEPLOY ORDER: apply this before the app code that passes p_status. The old
-- code keeps working against this function because the new arguments default.
-- ============================================================================

DROP FUNCTION IF EXISTS public.activate_fixed_rate_plan(UUID, INTEGER, DATE, DATE, INTEGER, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT);

CREATE OR REPLACE FUNCTION activate_fixed_rate_plan(
  p_host_id UUID,
  p_amount INTEGER,
  p_period_start DATE,
  p_period_end DATE,
  p_term_months INTEGER,
  p_discount_pct NUMERIC,
  p_slip_url TEXT DEFAULT NULL,
  p_slip_hash TEXT DEFAULT NULL,
  p_slip_trans_ref TEXT DEFAULT NULL,
  p_easyslip_response JSONB DEFAULT NULL,
  p_created_by TEXT DEFAULT 'host',
  p_status TEXT DEFAULT 'paid',
  p_due_date DATE DEFAULT NULL
)
RETURNS TABLE(invoice_id UUID)
SET search_path = public
AS $$
DECLARE
  v_invoice_id UUID;
BEGIN
  IF p_status NOT IN ('paid', 'pending') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  -- Same lock the wallet RPCs take, so a concurrent commission deduction or
  -- top-up for this host serialises against the plan change.
  PERFORM pg_advisory_xact_lock(hashtext(p_host_id::text));

  IF p_status = 'paid' AND EXISTS (
    SELECT 1 FROM hosts
    WHERE id = p_host_id
      AND plan_type = 'fixed_rate'
      AND fixed_rate_term_ends_at >= p_period_start
  ) THEN
    RAISE EXCEPTION 'ALREADY_ACTIVE';
  END IF;

  IF p_status = 'pending' THEN
    SELECT i.id INTO v_invoice_id
    FROM invoices i
    WHERE i.host_id = p_host_id
      AND i.period_start = p_period_start
      AND i.period_end = p_period_end
    LIMIT 1;

    IF FOUND THEN
      RETURN QUERY SELECT v_invoice_id;
      RETURN;
    END IF;
  END IF;

  INSERT INTO invoices (
    host_id, amount, period_start, period_end, status, paid_at, due_date,
    term_months, discount_pct,
    slip_url, slip_hash, slip_trans_ref, easyslip_verified, easyslip_response,
    created_by, updated_by
  )
  VALUES (
    p_host_id, p_amount, p_period_start, p_period_end, p_status,
    CASE WHEN p_status = 'paid' THEN now() END,
    COALESCE(p_due_date, p_period_start),
    p_term_months, p_discount_pct,
    p_slip_url, p_slip_hash, p_slip_trans_ref, p_slip_hash IS NOT NULL, p_easyslip_response,
    p_created_by, p_created_by
  )
  RETURNING id INTO v_invoice_id;

  UPDATE hosts
  SET plan_type                  = 'fixed_rate',
      fixed_rate_term_months     = p_term_months,
      fixed_rate_term_started_at = p_period_start,
      fixed_rate_term_ends_at    = p_period_end,
      -- A started term supersedes anything that was scheduled, and clears the
      -- free trial the host may have been on.
      plan_pending_type          = NULL,
      plan_pending_effective_at  = NULL,
      plan_pending_term_months   = NULL,
      plan_free_expires_at       = NULL,
      updated_by                 = p_created_by
  WHERE id = p_host_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOST_NOT_FOUND';
  END IF;

  RETURN QUERY SELECT v_invoice_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION activate_fixed_rate_plan(UUID, INTEGER, DATE, DATE, INTEGER, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, DATE) IS
  'Atomically start a Fixed Rate term and write the invoice behind it. Called by POST /api/host/plan/activate (paid, verified slip), the billing cron (pending: renewals and lapsed-term billing) and the admin Set Plan route (paid, settled offline). Callers compute amount and period. Raises ALREADY_ACTIVE for a paid term over a running one, HOST_NOT_FOUND for a missing host; a pending call for a period already invoiced returns that invoice and writes nothing; a duplicate slip_trans_ref raises unique_violation.';

-- Revoke from PUBLIC first: a bare REVOKE ... FROM anon leaves the implicit
-- PUBLIC grant in place. Matches 066_plan_activation.sql.
REVOKE ALL ON FUNCTION public.activate_fixed_rate_plan(UUID, INTEGER, DATE, DATE, INTEGER, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_fixed_rate_plan(UUID, INTEGER, DATE, DATE, INTEGER, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, DATE) TO service_role;
