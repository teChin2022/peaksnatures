-- ============================================================================
-- Plan activation: turn a verified payment slip into an active Fixed Rate plan.
--
-- WHY AN RPC AND NOT TWO POSTGREST CALLS
-- Activating Fixed Rate writes two rows that must agree: the paid invoice and
-- the host's new plan + term. Split across two PostgREST calls, a failure
-- between them leaves either a host on Fixed Rate who never paid, or a host who
-- paid and stayed on their old plan. Both are money bugs, and the second one is
-- worse because the host's receipt says otherwise. One transaction, or neither.
--
-- WHY THE INVOICE IS BORN 'paid'
-- Nothing is persisted until EasySlip verifies the slip, so an abandoned plan
-- change leaves no row at all — there is no pending-activation state to expire,
-- reconcile, or accidentally block a host with. The consequence worth knowing:
-- an activation invoice can never be past-due, so it can never trip
-- isHostBlocked(); only the cron's monthly invoices can, exactly as before.
-- due_date is set to period_start for the same reason — it is already settled,
-- and blockingInvoiceFilter() only ever looks at pending/overdue rows.
--
-- The caller owns the money math (src/lib/billing.ts computeImmediateFixed-
-- RateInvoice) and recomputes it server-side; this function deliberately does no
-- pricing of its own, so there is exactly one place the amounts are decided.
-- ============================================================================

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
  p_created_by TEXT DEFAULT 'host'
)
RETURNS TABLE(invoice_id UUID)
SET search_path = public
AS $$
DECLARE
  v_invoice_id UUID;
BEGIN
  -- Same lock the wallet RPCs take, so a concurrent commission deduction or
  -- top-up for this host serialises against the plan change rather than
  -- interleaving with it.
  PERFORM pg_advisory_xact_lock(hashtext(p_host_id::text));

  INSERT INTO invoices (
    host_id, amount, period_start, period_end, status, paid_at, due_date,
    term_months, discount_pct,
    slip_url, slip_hash, slip_trans_ref, easyslip_verified, easyslip_response,
    created_by, updated_by
  )
  VALUES (
    p_host_id, p_amount, p_period_start, p_period_end, 'paid', now(), p_period_start,
    p_term_months, p_discount_pct,
    p_slip_url, p_slip_hash, p_slip_trans_ref, true, p_easyslip_response,
    p_created_by, p_created_by
  )
  RETURNING id INTO v_invoice_id;

  UPDATE hosts
  SET plan_type                 = 'fixed_rate',
      fixed_rate_term_months    = p_term_months,
      fixed_rate_term_started_at = p_period_start,
      fixed_rate_term_ends_at   = p_period_end,
      -- A paid activation supersedes anything that was scheduled, and clears
      -- the free trial the host may have been on.
      plan_pending_type         = NULL,
      plan_pending_effective_at = NULL,
      plan_pending_term_months  = NULL,
      plan_free_expires_at      = NULL,
      updated_by                = p_created_by
  WHERE id = p_host_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOST_NOT_FOUND';
  END IF;

  RETURN QUERY SELECT v_invoice_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION activate_fixed_rate_plan(UUID, INTEGER, DATE, DATE, INTEGER, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT) IS
  'Atomically record a verified Fixed Rate payment and switch the host onto the plan. Called only by POST /api/host/plan/activate, which computes the amount and period. Raises HOST_NOT_FOUND if the host row is missing; a duplicate slip_trans_ref raises unique_violation, which the route maps to 409.';

-- Revoke from PUBLIC first: a bare REVOKE ... FROM anon leaves the implicit
-- PUBLIC grant in place. Matches 065_demand_events.sql.
REVOKE ALL ON FUNCTION public.activate_fixed_rate_plan(UUID, INTEGER, DATE, DATE, INTEGER, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_fixed_rate_plan(UUID, INTEGER, DATE, DATE, INTEGER, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT) TO service_role;
