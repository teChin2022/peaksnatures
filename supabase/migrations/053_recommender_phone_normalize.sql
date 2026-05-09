-- ============================================================
-- 053: Recommender phone — normalize + index
-- The /recommender public stats page looks up codes by exact match
-- on a digits-only phone. Application code now strips non-digits on
-- save; this migration backfills any pre-existing rows and adds the
-- supporting index.
-- ============================================================

UPDATE promo_codes
SET recommender_phone = regexp_replace(recommender_phone, '[^0-9]', '', 'g')
WHERE recommender_phone IS NOT NULL
  AND recommender_phone <> regexp_replace(recommender_phone, '[^0-9]', '', 'g');

CREATE INDEX IF NOT EXISTS idx_promo_codes_recommender_phone
  ON promo_codes (recommender_phone)
  WHERE recommender_phone IS NOT NULL;
