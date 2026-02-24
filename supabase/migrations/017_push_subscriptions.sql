-- Push subscriptions for Web Push notifications (host only for now)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Prevent duplicate subscriptions per host+endpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_host_endpoint
  ON push_subscriptions(host_id, endpoint);

-- RLS: hosts can only manage their own subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts can view own push subscriptions"
  ON push_subscriptions FOR SELECT
  USING (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

CREATE POLICY "Hosts can insert own push subscriptions"
  ON push_subscriptions FOR INSERT
  WITH CHECK (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

CREATE POLICY "Hosts can delete own push subscriptions"
  ON push_subscriptions FOR DELETE
  USING (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

-- Service role can do everything (for Edge Function cleanup)
CREATE POLICY "Service role full access on push_subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.role() = 'service_role');

-- Add notification_preference to hosts table
ALTER TABLE hosts
  ADD COLUMN IF NOT EXISTS notification_preference text NOT NULL DEFAULT 'push'
  CHECK (notification_preference IN ('push', 'line', 'both'));
