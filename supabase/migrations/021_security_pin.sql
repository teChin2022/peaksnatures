-- Add security_pin_hash column to hosts table
-- Stores bcrypt-hashed PIN for protecting sensitive host data
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS security_pin_hash TEXT DEFAULT NULL;
