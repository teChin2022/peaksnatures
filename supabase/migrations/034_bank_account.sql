-- Add bank account fields and payment display toggle to hosts
ALTER TABLE hosts
  ADD COLUMN bank_name TEXT,
  ADD COLUMN bank_account_number TEXT,
  ADD COLUMN bank_account_name TEXT,
  ADD COLUMN payment_display TEXT NOT NULL DEFAULT 'qr';

-- Ensure payment_display is one of the allowed values
ALTER TABLE hosts
  ADD CONSTRAINT hosts_payment_display_check CHECK (payment_display IN ('qr', 'bank'));
