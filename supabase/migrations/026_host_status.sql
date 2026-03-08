-- ************************************************************
-- 026: Host approval status
-- ************************************************************

ALTER TABLE hosts ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';

-- Backfill existing hosts as approved (they were already active before this feature)
UPDATE hosts SET status = 'approved' WHERE status = 'pending';
