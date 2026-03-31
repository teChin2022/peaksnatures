-- Add per-host OTP requirement toggle
-- Default: true (OTP always required, preserving existing behavior)
ALTER TABLE hosts ADD COLUMN require_otp BOOLEAN NOT NULL DEFAULT true;
