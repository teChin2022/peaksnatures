-- Replace "push" notification preference with "sms" (sms-kub.com)
-- Remove "both" option — hosts now choose either "sms" or "line"

-- Step 1: Drop the existing CHECK constraint on notification_preference
-- (inline CHECK from migration 017 may have an auto-generated name)
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT con.conname INTO con_name
  FROM pg_constraint con
  JOIN pg_attribute att ON att.attnum = ANY(con.conkey) AND att.attrelid = con.conrelid
  WHERE con.conrelid = 'hosts'::regclass
    AND att.attname = 'notification_preference'
    AND con.contype = 'c';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE hosts DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

-- Step 2: Update existing values
UPDATE hosts SET notification_preference = 'sms' WHERE notification_preference IN ('push', 'both');

-- Step 3: Add new constraint and default
ALTER TABLE hosts ADD CONSTRAINT hosts_notification_preference_check
  CHECK (notification_preference IN ('sms', 'line'));

ALTER TABLE hosts ALTER COLUMN notification_preference SET DEFAULT 'sms';
