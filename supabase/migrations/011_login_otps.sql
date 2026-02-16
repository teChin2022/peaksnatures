-- Login OTP codes for host two-factor authentication
CREATE TABLE login_otps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_otps_email_code ON login_otps(email, code);

-- RLS: no public access, only service role can read/write
ALTER TABLE login_otps ENABLE ROW LEVEL SECURITY;

-- Deny all access via RLS (service role bypasses RLS automatically)
-- No policies = no access for anon/authenticated roles
