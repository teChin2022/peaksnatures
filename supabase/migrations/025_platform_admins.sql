-- ************************************************************
-- 025: Platform Admins
-- ************************************************************

CREATE TABLE platform_admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  promptpay_id TEXT,
  line_user_id TEXT,
  line_channel_access_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX idx_platform_admins_user_id ON platform_admins(user_id);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
-- No RLS policies = service-role only access
