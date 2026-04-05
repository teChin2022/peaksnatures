-- Add social media link columns to homestays
ALTER TABLE homestays
  ADD COLUMN IF NOT EXISTS facebook_url  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tiktok_url    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS line_id       TEXT DEFAULT NULL;
