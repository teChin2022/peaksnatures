-- 086: charging the guest AI assistant to the host's wallet (docs/ai-admin-plan.md, phase 3).
--
-- Owner decisions, 2026-11-19:
--   D7  price per reply set by an admin, 0 until set (the trial stays free)
--   D8  replies accrue at the price of the moment; a daily cron charges each
--       finished Bangkok day as one wallet row, rounded UP to whole baht
--       (the wallet holds whole baht)
--   D9  the assistant stops when the wallet, less what is accrued but not yet
--       charged, would fall below the floor: ฿300 (LOW_WALLET_THRESHOLD) on
--       Commission so it never eats the commission money, ฿0 on other plans.
--       The floor comes from the app (one constant), not from this file.
--
-- Security review F-02: the floor is checked inside reserve_guest_ai_reply,
-- under its lock, so concurrent questions cannot all pass on the same balance;
-- and charge_guest_ai_usage never takes the wallet below zero (it charges at
-- most what is there), so the assistant can never set wallet_negative_since
-- and block a host's bookings (isHostBlocked).
--
-- Applies after 085. Service-role only, like 066 / 070 / 071 / 085.
--
-- Rollback (accrued amounts and the stop notice are lost; wallet rows written
-- by charge_guest_ai_usage stay, as every ledger row does):
--   DROP FUNCTION public.charge_guest_ai_usage(UUID, DATE);
--   DROP FUNCTION public.release_guest_ai_reply(UUID, UUID, DATE);
--   DROP FUNCTION public.reserve_guest_ai_reply(UUID, UUID, DATE, INTEGER);
--   then re-run the two functions from 085, and:
--   ALTER TABLE public.ai_usage_daily DROP COLUMN amount, DROP COLUMN charged_amount,
--     DROP COLUMN charged_at, DROP COLUMN transaction_id;
--   ALTER TABLE public.platform_guest_ai_config DROP COLUMN price_per_reply;
--   ALTER TABLE public.host_ai_settings DROP COLUMN wallet_low_notified_at;
--
-- Checks: supabase/tests/086_guest_ai_billing.sql.

ALTER TABLE public.platform_guest_ai_config
  ADD COLUMN price_per_reply NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price_per_reply BETWEEN 0 AND 100);

ALTER TABLE public.ai_usage_daily
  -- Baht accrued at the price of each reply (fractions allowed).
  ADD COLUMN amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  -- Set once by charge_guest_ai_usage: what was taken (whole baht) and its ledger row.
  ADD COLUMN charged_amount INTEGER,
  ADD COLUMN charged_at TIMESTAMPTZ,
  ADD COLUMN transaction_id UUID REFERENCES public.wallet_transactions(id);

-- When the host was last told the assistant stopped for want of money (one notice a day).
ALTER TABLE public.host_ai_settings ADD COLUMN wallet_low_notified_at TIMESTAMPTZ;

-- 085's version had no floor argument; a new signature would otherwise leave it callable.
DROP FUNCTION public.reserve_guest_ai_reply(UUID, UUID, DATE);

-- As in 085, plus 'wallet_low' and the price. p_floor is the lowest wallet the
-- assistant may leave once everything accrued is charged.
CREATE OR REPLACE FUNCTION public.reserve_guest_ai_reply(
  p_session UUID,
  p_host UUID,
  p_day DATE,
  p_floor INTEGER
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_platform_cap INTEGER;
  v_price NUMERIC(10,2);
  v_session RECORD;
  v_host_cap INTEGER;
  v_total INTEGER;
  v_used INTEGER;
  v_balance INTEGER;
  v_accrued NUMERIC;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('reserve_guest_ai_reply'));

  SELECT enabled, daily_cap, price_per_reply INTO v_enabled, v_platform_cap, v_price
  FROM platform_guest_ai_config WHERE id;
  IF NOT FOUND OR NOT v_enabled THEN
    RETURN 'platform_off';
  END IF;

  SELECT host_id, replies, reply_cap, expires_at INTO v_session FROM guest_ai_sessions WHERE id = p_session;
  IF NOT FOUND OR v_session.host_id <> p_host OR v_session.expires_at < now() THEN
    RETURN 'session_invalid';
  END IF;
  IF v_session.replies >= v_session.reply_cap THEN
    RETURN 'session_cap';
  END IF;

  SELECT daily_reply_cap INTO v_host_cap
  FROM host_ai_settings
  WHERE host_id = p_host AND status = 'approved' AND enabled;
  IF NOT FOUND THEN
    RETURN 'host_off';
  END IF;

  SELECT coalesce(sum(replies), 0) INTO v_total FROM ai_usage_daily WHERE day = p_day;
  IF v_total >= v_platform_cap THEN
    RETURN 'platform_cap';
  END IF;

  SELECT replies INTO v_used FROM ai_usage_daily WHERE host_id = p_host AND day = p_day;
  IF coalesce(v_used, 0) >= v_host_cap THEN
    RETURN 'host_cap';
  END IF;

  IF v_price > 0 THEN
    SELECT wallet_balance INTO v_balance FROM hosts WHERE id = p_host;
    SELECT coalesce(sum(amount), 0) INTO v_accrued FROM ai_usage_daily WHERE host_id = p_host AND charged_at IS NULL;
    -- Charging rounds each day up, so count the whole accrued amount plus this reply, rounded up.
    IF coalesce(v_balance, 0) - ceil(v_accrued + v_price) < p_floor THEN
      RETURN 'wallet_low';
    END IF;
  END IF;

  INSERT INTO ai_usage_daily (host_id, day, replies, amount) VALUES (p_host, p_day, 1, v_price)
  ON CONFLICT (host_id, day) DO UPDATE
    SET replies = ai_usage_daily.replies + 1, amount = ai_usage_daily.amount + v_price;
  UPDATE guest_ai_sessions SET replies = replies + 1 WHERE id = p_session;
  RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION public.reserve_guest_ai_reply(UUID, UUID, DATE, INTEGER) IS
  'Counts one guest AI reply (and accrues its price) if the platform switch, the platform and host daily caps, the session cap and the wallet floor all allow it. Called only by POST /api/guest-ai before Gemini.';

-- Gives a reply back when the Gemini call failed, with the price of the moment.
CREATE OR REPLACE FUNCTION public.release_guest_ai_reply(
  p_session UUID,
  p_host UUID,
  p_day DATE
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_price NUMERIC(10,2);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('reserve_guest_ai_reply'));
  SELECT price_per_reply INTO v_price FROM platform_guest_ai_config WHERE id;
  UPDATE ai_usage_daily
  SET replies = replies - 1, amount = greatest(amount - coalesce(v_price, 0), 0)
  WHERE host_id = p_host AND day = p_day AND replies > 0 AND charged_at IS NULL;
  UPDATE guest_ai_sessions SET replies = replies - 1 WHERE id = p_session AND replies > 0;
END;
$$;

-- Charges one host's finished day, once: the accrued amount rounded up to whole
-- baht, but never more than the wallet holds (any rest is written off), so the
-- wallet never goes below zero. Same per-host lock as 071's wallet writers.
-- Returns what was charged and the balance after; charged 0 for a day already
-- charged or with nothing owed.
CREATE OR REPLACE FUNCTION public.charge_guest_ai_usage(
  p_host UUID,
  p_day DATE
) RETURNS TABLE(charged INTEGER, new_balance INTEGER)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_usage RECORD;
  v_owed BOOLEAN;
  v_balance INTEGER;
  v_charge INTEGER;
  v_txn UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_host::text));

  SELECT replies, amount INTO v_usage
  FROM ai_usage_daily
  WHERE host_id = p_host AND day = p_day AND charged_at IS NULL
  FOR UPDATE;
  v_owed := FOUND;

  SELECT wallet_balance INTO v_balance FROM hosts WHERE id = p_host FOR UPDATE;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'HOST_NOT_FOUND';
  END IF;
  IF NOT v_owed THEN
    RETURN QUERY SELECT 0, v_balance;
    RETURN;
  END IF;

  v_charge := least(ceil(v_usage.amount)::INTEGER, greatest(v_balance, 0));

  IF v_charge > 0 THEN
    UPDATE hosts SET wallet_balance = wallet_balance - v_charge, updated_by = 'system'
    WHERE id = p_host
    RETURNING wallet_balance INTO v_balance;

    INSERT INTO wallet_transactions (host_id, type, amount, balance_after, description, status, created_by)
    VALUES (p_host, 'ai_usage', -v_charge, v_balance,
            format('ค่าผู้ช่วย AI %s (%s คำตอบ)', p_day, v_usage.replies), 'verified', 'system')
    RETURNING id INTO v_txn;
  END IF;

  UPDATE ai_usage_daily
  SET charged_amount = v_charge, charged_at = now(), transaction_id = v_txn
  WHERE host_id = p_host AND day = p_day;

  RETURN QUERY SELECT v_charge, v_balance;
END;
$$;

COMMENT ON FUNCTION public.charge_guest_ai_usage(UUID, DATE) IS
  'Charges a host''s finished Bangkok day of guest AI replies to the wallet once: accrued amount rounded up, capped at the balance so the wallet never goes negative. Called only by the billing cron.';

REVOKE ALL ON FUNCTION public.reserve_guest_ai_reply(UUID, UUID, DATE, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_guest_ai_reply(UUID, UUID, DATE, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.release_guest_ai_reply(UUID, UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_guest_ai_reply(UUID, UUID, DATE) TO service_role;
REVOKE ALL ON FUNCTION public.charge_guest_ai_usage(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_guest_ai_usage(UUID, DATE) TO service_role;
