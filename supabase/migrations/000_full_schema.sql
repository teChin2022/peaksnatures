-- ============================================================
-- PeaksNature — Full Database Schema
-- Combined from migrations 001–014 for one-shot production setup.
-- Run this in Supabase SQL Editor on a fresh project.
-- ============================================================

-- ************************************************************
-- 001: Initial Schema
-- ************************************************************

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- HOSTS
-- ============================================================
CREATE TABLE hosts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  promptpay_id TEXT NOT NULL,
  line_user_id TEXT,
  line_channel_access_token TEXT,
  deposit_amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ============================================================
-- HOMESTAYS
-- (002: map_embed_url replaces lat/lng)
-- (004: logo_url added)
-- (012: prohibitions + check-in/out times added)
-- (013: price_per_night dropped — pricing lives on rooms)
-- ============================================================
CREATE TABLE homestays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tagline TEXT,
  location TEXT NOT NULL DEFAULT '',
  map_embed_url TEXT,
  max_guests INTEGER NOT NULL DEFAULT 2,
  amenities JSONB NOT NULL DEFAULT '[]',
  prohibitions TEXT[] NOT NULL DEFAULT '{}',
  check_in_time TEXT DEFAULT '14:00',
  check_out_time TEXT DEFAULT '11:00',
  hero_image_url TEXT,
  logo_url TEXT,
  gallery JSONB NOT NULL DEFAULT '[]',
  theme_color TEXT NOT NULL DEFAULT '#16a34a',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_homestays_slug ON homestays(slug);
CREATE INDEX idx_homestays_host_id ON homestays(host_id);

-- ============================================================
-- SLUG REDIRECTS (019)
-- ============================================================
CREATE TABLE homestay_slug_redirects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homestay_id UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,
  old_slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_slug_redirects_old_slug ON homestay_slug_redirects(old_slug);

-- ============================================================
-- ROOMS
-- ============================================================
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homestay_id UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_per_night INTEGER NOT NULL DEFAULT 0,
  max_guests INTEGER NOT NULL DEFAULT 2,
  quantity INTEGER NOT NULL DEFAULT 1,
  images JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX idx_rooms_homestay_id ON rooms(homestay_id);

-- ============================================================
-- BOOKINGS
-- (005: guest_line_id renamed to guest_province)
-- (006: payment_slip_hash + slip_trans_ref added)
-- (014: checked_in_at + checked_out_at added)
-- ============================================================
CREATE TYPE booking_status AS ENUM (
  'pending',
  'verified',
  'confirmed',
  'rejected',
  'cancelled',
  'completed'
);

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homestay_id UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  guest_phone TEXT NOT NULL,
  guest_province TEXT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  num_guests INTEGER NOT NULL DEFAULT 1,
  total_price INTEGER NOT NULL DEFAULT 0,
  status booking_status NOT NULL DEFAULT 'pending',
  payment_slip_url TEXT,
  easyslip_verified BOOLEAN NOT NULL DEFAULT false,
  easyslip_response JSONB,
  payment_slip_hash TEXT,
  slip_trans_ref TEXT,
  notes TEXT,
  payment_type TEXT NOT NULL DEFAULT 'full',
  amount_paid INTEGER NOT NULL DEFAULT 0,
  checked_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_dates CHECK (check_out > check_in)
);

CREATE INDEX idx_bookings_homestay_id ON bookings(homestay_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_check_in ON bookings(check_in);
CREATE INDEX IF NOT EXISTS idx_bookings_slip_hash ON bookings(payment_slip_hash) WHERE payment_slip_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slip_trans_ref ON bookings(slip_trans_ref) WHERE slip_trans_ref IS NOT NULL;

-- ============================================================
-- BLOCKED DATES
-- ============================================================
CREATE TABLE blocked_dates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homestay_id UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE INDEX idx_blocked_dates_homestay_id ON blocked_dates(homestay_id);
CREATE INDEX idx_blocked_dates_room_id ON blocked_dates(room_id);
CREATE UNIQUE INDEX idx_blocked_dates_homestay_date_room
  ON blocked_dates (homestay_id, date, room_id) WHERE room_id IS NOT NULL;
CREATE UNIQUE INDEX idx_blocked_dates_homestay_date_all
  ON blocked_dates (homestay_id, date) WHERE room_id IS NULL;

-- ************************************************************
-- 007: Booking Holds
-- ************************************************************
CREATE TABLE booking_holds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  session_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_booking_holds_room_id ON booking_holds(room_id);
CREATE INDEX idx_booking_holds_expires_at ON booking_holds(expires_at);
CREATE UNIQUE INDEX idx_booking_holds_session_room_dates
  ON booking_holds(room_id, session_id, check_in, check_out);

-- ************************************************************
-- 008: Reviews
-- ************************************************************
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homestay_id UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(booking_id)
);

CREATE INDEX idx_reviews_homestay_id ON reviews(homestay_id);

-- ************************************************************
-- 011: Login OTPs
-- ************************************************************
CREATE TABLE login_otps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_otps_email_code ON login_otps(email, code);

-- ************************************************************
-- 018: Room Seasonal Prices
-- ************************************************************
CREATE TABLE room_seasonal_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  price_per_night INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_date_range CHECK (end_date >= start_date)
);

CREATE INDEX idx_seasonal_prices_room_id ON room_seasonal_prices(room_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Hosts
ALTER TABLE hosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts can view own record"
  ON hosts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Hosts can update own record"
  ON hosts FOR UPDATE
  USING (auth.uid() = user_id);

-- Homestays
ALTER TABLE homestays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active homestays"
  ON homestays FOR SELECT
  USING (is_active = true);

CREATE POLICY "Hosts can manage own homestays"
  ON homestays FOR ALL
  USING (host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid()));

-- Slug Redirects
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

-- Rooms
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rooms"
  ON rooms FOR SELECT
  USING (true);

CREATE POLICY "Hosts can manage rooms of own homestays"
  ON rooms FOR ALL
  USING (homestay_id IN (
    SELECT h.id FROM homestays h
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));

-- Bookings (010: hardened SELECT to host-only)
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create a booking"
  ON bookings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Hosts can view bookings for own homestays"
  ON bookings FOR SELECT
  USING (
    homestay_id IN (
      SELECT h.id FROM homestays h
      JOIN hosts ho ON h.host_id = ho.id
      WHERE ho.user_id = auth.uid()
    )
  );

CREATE POLICY "Hosts can manage bookings for their homestays"
  ON bookings FOR ALL
  USING (homestay_id IN (
    SELECT h.id FROM homestays h
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));

-- Blocked dates
ALTER TABLE blocked_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view blocked dates"
  ON blocked_dates FOR SELECT
  USING (true);

CREATE POLICY "Hosts can manage blocked dates for own homestays"
  ON blocked_dates FOR ALL
  USING (homestay_id IN (
    SELECT h.id FROM homestays h
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));

-- Booking holds
ALTER TABLE booking_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create a hold"
  ON booking_holds FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view holds"
  ON booking_holds FOR SELECT USING (true);

CREATE POLICY "Users can delete own holds"
  ON booking_holds FOR DELETE USING (true);

-- Reviews (010: added INSERT for anonymous guests)
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reviews"
  ON reviews FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert a review"
  ON reviews FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Hosts can manage reviews for their homestays"
  ON reviews FOR ALL
  USING (homestay_id IN (
    SELECT h.id FROM homestays h
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));

-- Room Seasonal Prices
ALTER TABLE room_seasonal_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view seasonal prices"
  ON room_seasonal_prices FOR SELECT
  USING (true);

CREATE POLICY "Hosts can manage seasonal prices of own rooms"
  ON room_seasonal_prices FOR ALL
  USING (room_id IN (
    SELECT r.id FROM rooms r
    JOIN homestays h ON r.homestay_id = h.id
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));

-- Login OTPs (no policies = service-role only)
ALTER TABLE login_otps ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('homestay-photos', 'homestay-photos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-slips', 'payment-slips', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STORAGE POLICIES
-- ============================================================

CREATE POLICY "Anyone can view homestay photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'homestay-photos');

CREATE POLICY "Hosts can upload homestay photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'homestay-photos'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Hosts can update own homestay photos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'homestay-photos'
    AND auth.uid() = owner
  );

CREATE POLICY "Hosts can delete own homestay photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'homestay-photos'
    AND auth.uid() = owner
  );

CREATE POLICY "Anyone can upload payment slips"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'payment-slips');

CREATE POLICY "Authenticated users can view payment slips"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payment-slips'
    AND auth.role() = 'authenticated'
  );

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- acquire_booking_hold (007 + 007_fix merged)
CREATE OR REPLACE FUNCTION acquire_booking_hold(
  p_room_id UUID,
  p_check_in DATE,
  p_check_out DATE,
  p_session_id TEXT,
  p_hold_minutes INT DEFAULT 5
) RETURNS UUID AS $$
DECLARE
  v_room_qty INT;
  v_active_count INT;
  v_hold_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_room_id::text));

  SELECT quantity INTO v_room_qty FROM rooms WHERE id = p_room_id;
  IF v_room_qty IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  DELETE FROM booking_holds WHERE room_id = p_room_id AND expires_at <= NOW();

  SELECT COUNT(*) INTO v_active_count
  FROM bookings
  WHERE room_id = p_room_id
    AND status IN ('pending', 'confirmed', 'verified')
    AND check_in < p_check_out
    AND check_out > p_check_in;

  IF v_active_count >= v_room_qty THEN
    RAISE EXCEPTION 'DATES_UNAVAILABLE';
  END IF;

  SELECT COUNT(*) INTO v_active_count FROM (
    SELECT id FROM booking_holds
    WHERE room_id = p_room_id
      AND expires_at > NOW()
      AND session_id != p_session_id
      AND check_in < p_check_out
      AND check_out > p_check_in
    UNION ALL
    SELECT id FROM bookings
    WHERE room_id = p_room_id
      AND status IN ('pending', 'confirmed', 'verified')
      AND check_in < p_check_out
      AND check_out > p_check_in
  ) AS active;

  IF v_active_count >= v_room_qty THEN
    RAISE EXCEPTION 'DATES_HELD';
  END IF;

  INSERT INTO booking_holds (room_id, check_in, check_out, session_id, expires_at)
  VALUES (p_room_id, p_check_in, p_check_out, p_session_id, NOW() + (p_hold_minutes || ' minutes')::interval)
  ON CONFLICT (room_id, session_id, check_in, check_out)
  DO UPDATE SET expires_at = NOW() + (p_hold_minutes || ' minutes')::interval
  RETURNING id INTO v_hold_id;

  RETURN v_hold_id;
END;
$$ LANGUAGE plpgsql;

-- create_booking_atomic (007 + 009 merged — includes p_notes)
CREATE OR REPLACE FUNCTION create_booking_atomic(
  p_homestay_id UUID,
  p_room_id UUID,
  p_guest_name TEXT,
  p_guest_email TEXT,
  p_guest_phone TEXT,
  p_guest_province TEXT,
  p_check_in DATE,
  p_check_out DATE,
  p_num_guests INT,
  p_total_price INT,
  p_status booking_status,
  p_easyslip_verified BOOLEAN,
  p_payment_slip_hash TEXT,
  p_slip_trans_ref TEXT,
  p_payment_slip_url TEXT,
  p_easyslip_response JSONB,
  p_session_id TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_payment_type TEXT DEFAULT 'full',
  p_amount_paid INT DEFAULT 0
) RETURNS UUID AS $$
DECLARE
  v_room_qty INT;
  v_overlap_count INT;
  v_blocked_count INT;
  v_booking_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_room_id::text));

  SELECT quantity INTO v_room_qty FROM rooms WHERE id = p_room_id;
  IF v_room_qty IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  SELECT COUNT(*) INTO v_overlap_count
  FROM bookings
  WHERE room_id = p_room_id
    AND status IN ('pending', 'confirmed', 'verified')
    AND check_in < p_check_out
    AND check_out > p_check_in;

  IF v_overlap_count >= v_room_qty THEN
    RAISE EXCEPTION 'DATES_UNAVAILABLE';
  END IF;

  SELECT COUNT(*) INTO v_blocked_count
  FROM blocked_dates
  WHERE homestay_id = p_homestay_id
    AND date >= p_check_in
    AND date < p_check_out
    AND (room_id IS NULL OR room_id = p_room_id);

  IF v_blocked_count > 0 THEN
    RAISE EXCEPTION 'DATES_BLOCKED';
  END IF;

  INSERT INTO bookings (
    homestay_id, room_id, guest_name, guest_email, guest_phone,
    guest_province, check_in, check_out, num_guests, total_price,
    status, easyslip_verified, payment_slip_hash, slip_trans_ref,
    payment_slip_url, easyslip_response, notes, payment_type, amount_paid
  ) VALUES (
    p_homestay_id, p_room_id, p_guest_name, p_guest_email, p_guest_phone,
    p_guest_province, p_check_in, p_check_out, p_num_guests, p_total_price,
    p_status, p_easyslip_verified, p_payment_slip_hash, p_slip_trans_ref,
    p_payment_slip_url, p_easyslip_response, p_notes, p_payment_type, p_amount_paid
  ) RETURNING id INTO v_booking_id;

  IF p_session_id IS NOT NULL THEN
    DELETE FROM booking_holds
    WHERE room_id = p_room_id
      AND session_id = p_session_id
      AND check_in = p_check_in
      AND check_out = p_check_out;
  END IF;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql;
