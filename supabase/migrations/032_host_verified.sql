-- Add is_verified column to hosts table
-- This is set by platform admins after manual verification of the host
ALTER TABLE hosts ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT false;
