-- ============================================================================
-- Demand events: anonymous guest behaviour on the public /[slug] booking page.
--
-- WHY A NEW TABLE INSTEAD OF history_logs
-- history_logs is an audit trail of *mutations*: it is append-only (enforced by
-- prevent_history_log_mutation(), which raises on UPDATE and DELETE), it has no
-- RLS, and its client ingest route requires an authenticated host session. None
-- of that fits guest analytics — in particular the DELETE block would make the
-- retention prune below impossible. The two stay separate on purpose:
--   history_logs  = who changed what (kept forever, audit)
--   demand_events = what anonymous guests did (pruned at 180 days, analytics)
--
-- WHY THERE IS NO INSERT POLICY
-- Every write goes through POST /api/demand with the service-role client, which
-- rate-limits first. An anon INSERT policy (the precedent set by "Anyone can
-- create a hold") would let anyone spam this table straight through the public
-- anon key and bypass that limiter entirely.
--
-- PRIVACY
-- session_id is a random UUID held in sessionStorage for the length of one
-- visit. No cookie, no IP, no name, no contact details — nothing that
-- identifies a person, which keeps PDPA exposure minimal.
-- ============================================================================

CREATE TABLE demand_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homestay_id UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL,
  event_type  TEXT NOT NULL CHECK (event_type IN (
                'page_view',
                'calendar_view',
                'dates_selected',
                'dates_unavailable',
                'checkout_step',
                'slip_uploaded',
                'booking_submitted')),
  check_in    DATE,
  check_out   DATE,
  nights      SMALLINT,
  step        TEXT CHECK (step IS NULL OR step IN ('dates', 'details', 'payment')),
  device      TEXT CHECK (device IS NULL OR device IN ('mobile', 'desktop')),
  locale      TEXT,
  data        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE demand_events IS
  'Anonymous guest funnel + date-demand events from the public /[slug] page. Written only by POST /api/demand via the service-role client. Pruned at 180 days by the daily billing cron.';
COMMENT ON COLUMN demand_events.session_id IS
  'Random UUID from sessionStorage, one per visit. Not a user id and not stable across visits — used only to stitch a funnel and to count sessions instead of raw events.';
COMMENT ON COLUMN demand_events.check_in IS
  'Set on dates_selected / dates_unavailable / booking_submitted. THE demand signal: which nights guests asked for, whether or not we could sell them.';
COMMENT ON COLUMN demand_events.step IS
  'checkout_step only. Recorded when the guest ADVANCES OUT of a step, not on arrival: dates = finished step 1, details = finished step 2, payment = reached step 3 (holds acquired, QR shown). The gap between details and payment is bookings lost to a hold conflict.';
COMMENT ON COLUMN demand_events.data IS
  'Extension point. Any future signal that does not warrant a column (per-house engagement, referrer, promo) goes here rather than in a migration.';

-- (homestay_id, created_at) drives every dashboard range query; adding
-- event_type gives the funnel counts an index-only path. The check_in index is
-- partial because only three of the seven event types set it.
CREATE INDEX idx_demand_events_homestay_created ON demand_events(homestay_id, created_at DESC);
CREATE INDEX idx_demand_events_homestay_type    ON demand_events(homestay_id, event_type, created_at DESC);
CREATE INDEX idx_demand_events_checkin          ON demand_events(homestay_id, check_in) WHERE check_in IS NOT NULL;
CREATE INDEX idx_demand_events_session          ON demand_events(session_id, created_at);

ALTER TABLE demand_events ENABLE ROW LEVEL SECURITY;

-- SELECT only, and only your own homestay. No INSERT/UPDATE/DELETE policy:
-- the beacon route and the retention prune both use the service-role client,
-- which bypasses RLS.
CREATE POLICY "Hosts can view demand events for own homestays"
  ON demand_events FOR SELECT
  USING (homestay_id IN (
    SELECT h.id FROM homestays h
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()));

-- ============================================================================
-- Aggregation. Done in Postgres rather than JS because the funnel needs
-- COUNT(DISTINCT session_id) — counting raw events instead would let one guest
-- re-opening the calendar push a stage above the stage before it, and the
-- funnel would read as going backwards. It also keeps the platform-wide admin
-- query from shipping every row to the serverless function.
--
-- SECURITY INVOKER (the default) on purpose: RLS on demand_events then applies
-- to the caller, so a host who calls this directly from the browser with
-- p_homestay_id => NULL sees only their own rows, never the platform's. The API
-- routes use the service-role client, which bypasses RLS, and do their own
-- auth and scoping.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_demand_stats(
  p_homestay_id UUID DEFAULT NULL,
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH scoped AS (
  SELECT session_id, event_type, step, check_in
  FROM demand_events
  WHERE created_at >= NOW() - (GREATEST(p_days, 1) || ' days')::INTERVAL
    AND (p_homestay_id IS NULL OR homestay_id = p_homestay_id)
),
-- checkout_step fans out into three stages; dates_unavailable is a side metric,
-- not a stage guests pass through, so it is excluded here.
staged AS (
  SELECT session_id,
         CASE WHEN event_type = 'checkout_step' THEN 'step_' || step ELSE event_type END AS stage
  FROM scoped
  WHERE event_type <> 'dates_unavailable'
),
-- LEFT JOIN against the stage list so a stage nobody reached still reports 0
-- rather than vanishing from the funnel.
funnel AS (
  SELECT s.stage, s.ord, COUNT(DISTINCT st.session_id) AS sessions
  FROM unnest(ARRAY[
         'page_view', 'calendar_view', 'dates_selected', 'step_dates',
         'step_details', 'step_payment', 'slip_uploaded', 'booking_submitted'
       ]) WITH ORDINALITY AS s(stage, ord)
  LEFT JOIN staged st ON st.stage = s.stage
  GROUP BY s.stage, s.ord
),
top_dates AS (
  SELECT check_in AS d,
         COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'dates_selected')    AS requested,
         COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'dates_unavailable') AS unavailable
  FROM scoped
  WHERE check_in IS NOT NULL
    AND event_type IN ('dates_selected', 'dates_unavailable')
  GROUP BY check_in
  ORDER BY 2 DESC, 1 ASC
  LIMIT 10
)
SELECT jsonb_build_object(
  'funnel', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('stage', stage, 'sessions', sessions) ORDER BY ord)
    FROM funnel), '[]'::jsonb),
  'top_dates', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('date', d, 'requested', requested, 'unavailable', unavailable)
                     ORDER BY requested DESC, d ASC)
    FROM top_dates), '[]'::jsonb),
  'totals', jsonb_build_object(
    'sessions',    (SELECT COUNT(DISTINCT session_id) FROM scoped WHERE event_type = 'page_view'),
    'conversions', (SELECT COUNT(DISTINCT session_id) FROM scoped WHERE event_type = 'booking_submitted'),
    'lost_demand', (SELECT COUNT(DISTINCT session_id) FROM scoped WHERE event_type = 'dates_unavailable')
  )
);
$$;

-- Revoke from PUBLIC first: a bare REVOKE ... FROM anon leaves the implicit
-- PUBLIC grant in place. Matches 048_admin_revenue_rpc.sql.
REVOKE ALL ON FUNCTION public.get_demand_stats(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_demand_stats(UUID, INT) TO authenticated, service_role;

COMMENT ON FUNCTION get_demand_stats(UUID, INT) IS
  'Funnel + top requested dates for one homestay, or the whole platform when p_homestay_id is NULL. Counts are DISTINCT sessions, never raw events.';

-- Retention. Capped so that shortening the window later can never turn one
-- nightly run into a table-wide delete. Called from the daily billing cron.
CREATE OR REPLACE FUNCTION prune_demand_events(
  p_days INT DEFAULT 180,
  p_limit INT DEFAULT 10000
)
RETURNS INT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  WITH doomed AS (
    SELECT id FROM demand_events
    WHERE created_at < NOW() - (GREATEST(p_days, 1) || ' days')::INTERVAL
    LIMIT GREATEST(p_limit, 1)
  )
  DELETE FROM demand_events d USING doomed WHERE d.id = doomed.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_demand_events(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_demand_events(INT, INT) TO service_role;
