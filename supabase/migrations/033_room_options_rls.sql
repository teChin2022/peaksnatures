-- ============================================================
-- RLS POLICIES FOR room_options
-- ============================================================
ALTER TABLE room_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view room options"
  ON room_options FOR SELECT
  USING (true);

CREATE POLICY "Hosts can manage options of own rooms"
  ON room_options FOR ALL
  USING (room_id IN (
    SELECT r.id FROM rooms r
    JOIN homestays h ON r.homestay_id = h.id
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));
