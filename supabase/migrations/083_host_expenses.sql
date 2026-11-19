-- 083: expenses a host records for their own monthly profit summary
-- (/dashboard/expenses: booking income − platform charges − these).
--
-- Owner only, like billing and wallet. Read, added, edited and deleted only by
-- /api/host/expenses with the service role, which scopes every query to the
-- caller's own hosts row: RLS is on with no policies, and anon/authenticated
-- hold no grants. Staff logins (081) never see it.
--
-- Rollback (loses every recorded expense, nothing else):
--   DROP TABLE public.host_expenses;
--
-- Checks: supabase/tests/083_host_expenses.sql.

CREATE TABLE public.host_expenses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id    UUID NOT NULL REFERENCES public.hosts(id) ON DELETE CASCADE,
  -- A Bangkok calendar day, chosen by the host.
  spent_on   DATE NOT NULL,
  category   TEXT NOT NULL
             CHECK (category IN ('utilities', 'wages', 'laundry', 'supplies', 'maintenance', 'other')),
  amount     NUMERIC(12,2) NOT NULL CHECK (amount > 0 AND amount <= 10000000),
  note       TEXT CHECK (note IS NULL OR char_length(note) <= 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_host_expenses_host_spent_on ON public.host_expenses (host_id, spent_on);

ALTER TABLE public.host_expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.host_expenses FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.host_expenses TO service_role;
