-- Add custom invite token columns for configurable invitation expiry
ALTER TABLE host_assistants ADD COLUMN IF NOT EXISTS invite_token_hash text;
ALTER TABLE host_assistants ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_host_assistants_invite_token
  ON host_assistants(invite_token_hash) WHERE invite_token_hash IS NOT NULL;
