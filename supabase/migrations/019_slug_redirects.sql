-- Slug redirect table: stores old slugs so previously shared URLs redirect to the new slug
CREATE TABLE IF NOT EXISTS homestay_slug_redirects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homestay_id UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,
  old_slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_slug_redirects_old_slug ON homestay_slug_redirects(old_slug);

-- RLS: anyone can read redirects (needed for public redirect lookup), only hosts manage their own
ALTER TABLE homestay_slug_redirects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read slug redirects"
  ON homestay_slug_redirects FOR SELECT
  USING (true);

CREATE POLICY "Hosts can manage slug redirects for own homestays"
  ON homestay_slug_redirects FOR ALL
  USING (homestay_id IN (
    SELECT h.id FROM homestays h
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));
