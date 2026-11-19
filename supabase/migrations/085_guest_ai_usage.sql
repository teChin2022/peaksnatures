-- 085: limits for the guest AI assistant on /[slug]/book (docs/ai-admin-plan.md, phase 2).
--
-- Every reply costs a real Gemini call that the platform pays for during the
-- trial, so the caps live in the database, not in the rate limiter (which is
-- per instance without Redis and fails open): security review F-01 / F-02.
--
--   platform_guest_ai_config  one row: the platform kill switch and the daily
--                             cap over all hosts (300, owner 2026-11-19)
--   guest_ai_sessions         a guest's session, created after Turnstile; its
--                             random id is the httpOnly cookie, so no signing
--                             secret is needed
--   ai_usage_daily            replies per host per Bangkok day
--   reserve_guest_ai_reply    checks every cap and counts the reply, in one
--                             transaction under one lock
--   release_guest_ai_reply    gives a reply back when the Gemini call failed
--
-- No guest text is stored anywhere (owner, 2026-11-19): only counts.
--
-- Service role only, like 083 / 084: RLS on with no policies, no grants to
-- anon / authenticated; the functions follow 066 / 070 / 071.
--
-- Rollback:
--   DROP FUNCTION public.release_guest_ai_reply(UUID, UUID, DATE);
--   DROP FUNCTION public.reserve_guest_ai_reply(UUID, UUID, DATE);
--   DROP TABLE public.ai_usage_daily, public.guest_ai_sessions, public.platform_guest_ai_config;
--
-- Checks: supabase/tests/085_guest_ai_usage.sql.

CREATE TABLE public.platform_guest_ai_config (
  id         BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  enabled    BOOLEAN NOT NULL DEFAULT true,
  daily_cap  INTEGER NOT NULL DEFAULT 300 CHECK (daily_cap BETWEEN 0 AND 100000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);
INSERT INTO public.platform_guest_ai_config DEFAULT VALUES;

CREATE TABLE public.guest_ai_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id     UUID NOT NULL REFERENCES public.hosts(id) ON DELETE CASCADE,
  homestay_id UUID NOT NULL REFERENCES public.homestays(id) ON DELETE CASCADE,
  replies     INTEGER NOT NULL DEFAULT 0,
  -- 20 after a Turnstile pass; 5 when Cloudflare could not be reached (fail open, but small).
  reply_cap   INTEGER NOT NULL DEFAULT 20 CHECK (reply_cap BETWEEN 0 AND 100),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '2 hours'
);
CREATE INDEX idx_guest_ai_sessions_expires ON public.guest_ai_sessions (expires_at);

CREATE TABLE public.ai_usage_daily (
  host_id UUID NOT NULL REFERENCES public.hosts(id) ON DELETE CASCADE,
  -- A Bangkok calendar day (billingTodayStr()).
  day     DATE NOT NULL,
  replies INTEGER NOT NULL DEFAULT 0 CHECK (replies >= 0),
  PRIMARY KEY (host_id, day)
);
CREATE INDEX idx_ai_usage_daily_day ON public.ai_usage_daily (day);

ALTER TABLE public.platform_guest_ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_guest_ai_config, public.guest_ai_sessions, public.ai_usage_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_guest_ai_config, public.guest_ai_sessions, public.ai_usage_daily TO service_role;

-- Returns 'ok' (counted), or why not: 'platform_off', 'session_invalid',
-- 'session_cap', 'host_off', 'platform_cap', 'host_cap'. One platform-wide
-- lock: the platform cap sums every host, so reservations queue (fine at
-- hundreds a day; revisit with a counter row if it ever grows).
CREATE OR REPLACE FUNCTION public.reserve_guest_ai_reply(
  p_session UUID,
  p_host UUID,
  p_day DATE
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_platform_cap INTEGER;
  v_session RECORD;
  v_host_cap INTEGER;
  v_total INTEGER;
  v_used INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('reserve_guest_ai_reply'));

  SELECT enabled, daily_cap INTO v_enabled, v_platform_cap FROM platform_guest_ai_config WHERE id;
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

  INSERT INTO ai_usage_daily (host_id, day, replies) VALUES (p_host, p_day, 1)
  ON CONFLICT (host_id, day) DO UPDATE SET replies = ai_usage_daily.replies + 1;
  UPDATE guest_ai_sessions SET replies = replies + 1 WHERE id = p_session;
  RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION public.reserve_guest_ai_reply(UUID, UUID, DATE) IS
  'Counts one guest AI reply if the platform switch, the platform and host daily caps and the session cap all allow it. Called only by POST /api/guest-ai before Gemini.';

-- Gives back a reply reserve_guest_ai_reply counted, when the Gemini call failed.
CREATE OR REPLACE FUNCTION public.release_guest_ai_reply(
  p_session UUID,
  p_host UUID,
  p_day DATE
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('reserve_guest_ai_reply'));
  UPDATE ai_usage_daily SET replies = replies - 1 WHERE host_id = p_host AND day = p_day AND replies > 0;
  UPDATE guest_ai_sessions SET replies = replies - 1 WHERE id = p_session AND replies > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_guest_ai_reply(UUID, UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_guest_ai_reply(UUID, UUID, DATE) TO service_role;
REVOKE ALL ON FUNCTION public.release_guest_ai_reply(UUID, UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_guest_ai_reply(UUID, UUID, DATE) TO service_role;
