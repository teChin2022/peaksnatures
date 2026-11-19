-- 087: what the guest AI assistant costs the platform (docs/ai-admin-plan.md, phase 5).
--
-- Real Gemini token counts per host per Bangkok day, and the admin's own
-- estimate of what a million tokens costs in baht (Google bills in USD and the
-- rate changes; it is entered by hand on /admin/guest-ai, 0 until set). The
-- admin report sets the estimated model cost against what hosts were charged.
-- No guest text is stored, still: only counts.
--
-- Applies after 086. Service-role only, like 085 / 086.
--
-- Rollback:
--   DROP FUNCTION public.record_guest_ai_tokens(UUID, DATE, INTEGER, INTEGER);
--   ALTER TABLE public.ai_usage_daily DROP COLUMN input_tokens, DROP COLUMN output_tokens;
--   ALTER TABLE public.platform_guest_ai_config DROP COLUMN cost_in_per_mtok, DROP COLUMN cost_out_per_mtok;
--
-- Checks: supabase/tests/087_guest_ai_tokens.sql.

ALTER TABLE public.ai_usage_daily
  ADD COLUMN input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  ADD COLUMN output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0);

ALTER TABLE public.platform_guest_ai_config
  -- Baht per 1,000,000 tokens, entered by an admin from Google's price list.
  ADD COLUMN cost_in_per_mtok NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cost_in_per_mtok BETWEEN 0 AND 100000),
  ADD COLUMN cost_out_per_mtok NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cost_out_per_mtok BETWEEN 0 AND 100000);

-- Adds one reply's tokens to the day reserve_guest_ai_reply already counted.
CREATE OR REPLACE FUNCTION public.record_guest_ai_tokens(
  p_host UUID,
  p_day DATE,
  p_input INTEGER,
  p_output INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE ai_usage_daily
  SET input_tokens = input_tokens + greatest(coalesce(p_input, 0), 0),
      output_tokens = output_tokens + greatest(coalesce(p_output, 0), 0)
  WHERE host_id = p_host AND day = p_day;
END;
$$;

COMMENT ON FUNCTION public.record_guest_ai_tokens(UUID, DATE, INTEGER, INTEGER) IS
  'Adds one guest AI reply''s Gemini token counts to its host''s day. Called only by POST /api/guest-ai after the model answers.';

REVOKE ALL ON FUNCTION public.record_guest_ai_tokens(UUID, DATE, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_guest_ai_tokens(UUID, DATE, INTEGER, INTEGER) TO service_role;
