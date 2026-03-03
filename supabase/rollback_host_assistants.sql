-- Rollback script for host_assistants feature
-- Run this in the Supabase SQL Editor AFTER deploying the code changes
-- This removes all database objects created by migrations 021 and 022

-- 1. Drop host_assistants table FIRST (CASCADE removes its RLS policies, indexes,
--    and policy dependencies on functions so they can be dropped cleanly)
DROP TABLE IF EXISTS host_assistants CASCADE;

-- 2. Drop trigger on hosts table
DROP TRIGGER IF EXISTS trg_prevent_assistant_sensitive_update ON hosts;

-- 3. Drop functions (now safe — dependent policies were removed with the table)
DROP FUNCTION IF EXISTS prevent_assistant_sensitive_update();
DROP FUNCTION IF EXISTS get_host_ids_for_owner(uuid);
DROP FUNCTION IF EXISTS get_host_ids_for_assistant(uuid);
DROP FUNCTION IF EXISTS get_homestay_ids_for_hosts(uuid[]);

-- 4. Drop assistant-related RLS policies from other tables
-- hosts
DROP POLICY IF EXISTS "Assistants can view their linked host" ON hosts;
DROP POLICY IF EXISTS "Assistants can update linked host" ON hosts;

-- homestays
DROP POLICY IF EXISTS "Assistants can view homestays of linked host" ON homestays;
DROP POLICY IF EXISTS "Assistants can update homestays of linked host" ON homestays;

-- rooms
DROP POLICY IF EXISTS "Assistants can view rooms of linked host" ON rooms;
DROP POLICY IF EXISTS "Assistants can manage rooms of linked host" ON rooms;

-- bookings
DROP POLICY IF EXISTS "Assistants can view bookings of linked host" ON bookings;
DROP POLICY IF EXISTS "Assistants can update bookings of linked host" ON bookings;

-- blocked_dates
DROP POLICY IF EXISTS "Assistants can view blocked dates of linked host" ON blocked_dates;
DROP POLICY IF EXISTS "Assistants can manage blocked dates of linked host" ON blocked_dates;
