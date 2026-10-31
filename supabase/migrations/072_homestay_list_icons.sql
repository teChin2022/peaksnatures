-- ============================================================================
-- Icons for a homestay's amenities and house rules.
--
-- amenities / prohibitions stay text[] of labels. Every label gets an icon
-- picked from its words at render time (src/lib/list-icons.ts), so existing
-- homestays need no backfill. These columns hold only the icons a host chose
-- by hand: { "<label>": "<icon key>" }. The dashboard prunes keys whose label
-- was removed on every save.
--
-- homestays has no column-level grants (unlike hosts, migration 069), so the
-- host's session can write these through the existing row policy.
--
-- Apply BEFORE deploying the code that writes them: the dashboard's homestay
-- save sends both columns and fails on an unknown column.
-- ============================================================================

ALTER TABLE homestays
  ADD COLUMN IF NOT EXISTS amenity_icons JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS prohibition_icons JSONB NOT NULL DEFAULT '{}'::jsonb;
