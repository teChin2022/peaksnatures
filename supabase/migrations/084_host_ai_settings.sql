-- 084: a host's guest AI assistant (docs/ai-admin-plan.md, phase 1).
--
-- One row per host, created when the host asks for the assistant. A platform
-- admin approves, rejects, suspends or resumes it; the host then turns it on
-- or off and chooses what it may do for guests. Nothing calls an AI model yet.
--
-- Owner only, like host_expenses (083). Read and written only by
-- /api/host/ai-admin and the admin routes with the service role, which scope
-- every query to the caller: RLS is on with no policies, and anon /
-- authenticated hold no grants, so a host session cannot approve itself or
-- raise its own cap with a direct PATCH /rest/v1/host_ai_settings. Staff
-- logins (081) never see it.
--
-- Rollback (loses every request and setting, nothing else):
--   DROP TABLE public.host_ai_settings;
--
-- Checks: supabase/tests/084_host_ai_settings.sql.

CREATE TABLE public.host_ai_settings (
  host_id            UUID PRIMARY KEY REFERENCES public.hosts(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'requested'
                     CHECK (status IN ('requested', 'approved', 'rejected', 'suspended')),
  requested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at         TIMESTAMPTZ,
  -- The deciding admin's name, like hosts.updated_by.
  decided_by         TEXT,
  -- The host's own switch. The assistant runs only when status = 'approved' AND enabled.
  enabled            BOOLEAN NOT NULL DEFAULT false,
  can_answer         BOOLEAN NOT NULL DEFAULT true,
  can_set_dates      BOOLEAN NOT NULL DEFAULT true,
  can_suggest_houses BOOLEAN NOT NULL DEFAULT true,
  can_navigate       BOOLEAN NOT NULL DEFAULT true,
  instructions       TEXT CHECK (instructions IS NULL OR char_length(instructions) <= 2000),
  -- Replies per Bangkok day. Set by an admin only; 50 during the trial (owner, 2026-11-19).
  daily_reply_cap    INTEGER NOT NULL DEFAULT 50 CHECK (daily_reply_cap BETWEEN 0 AND 1000),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_host_ai_settings_status ON public.host_ai_settings (status, requested_at);

ALTER TABLE public.host_ai_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.host_ai_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.host_ai_settings TO service_role;
