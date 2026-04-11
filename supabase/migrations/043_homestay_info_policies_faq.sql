-- 043: Homestay check-in info, policies, and FAQ
-- Adds three host-editable content sections to the public homestay page.
--   check_in_info: rich HTML narrative shown before the booking form.
--   policies:      rich HTML narrative for cancellation/house/etc. policies.
--   faq:           JSONB array of {question, answer} objects, rendered as an accordion.
-- All three are optional; empty values hide the corresponding section on the public page.
-- No RLS changes needed — "Hosts can manage own homestays" (000_full_schema.sql) is a FOR ALL
-- column-agnostic policy that already covers these. updated_at is refreshed by the existing
-- trg_homestays_updated_at trigger.

ALTER TABLE homestays
  ADD COLUMN IF NOT EXISTS check_in_info TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS policies      TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS faq           JSONB NOT NULL DEFAULT '[]'::jsonb;
