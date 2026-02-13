-- PeaksNature Initial Schema
-- Run this in Supabase SQL Editor to set up the database

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
  line_id TEXT,
  promptpay_id TEXT NOT NULL,
  line_user_id TEXT,
  line_channel_access_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ============================================================
-- HOMESTAYS
-- ============================================================
CREATE TABLE homestays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tagline TEXT,
  location TEXT NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  price_per_night INTEGER NOT NULL DEFAULT 0,
  max_guests INTEGER NOT NULL DEFAULT 2,
  amenities JSONB NOT NULL DEFAULT '[]',
  hero_image_url TEXT,
  gallery JSONB NOT NULL DEFAULT '[]',
  theme_color TEXT NOT NULL DEFAULT '#16a34a',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_homestays_slug ON homestays(slug);
CREATE INDEX idx_homestays_host_id ON homestays(host_id);

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
  guest_line_id TEXT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  num_guests INTEGER NOT NULL DEFAULT 1,
  total_price INTEGER NOT NULL DEFAULT 0,
  status booking_status NOT NULL DEFAULT 'pending',
  payment_slip_url TEXT,
  easyslip_verified BOOLEAN NOT NULL DEFAULT false,
  easyslip_response JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_dates CHECK (check_out > check_in)
);

CREATE INDEX idx_bookings_homestay_id ON bookings(homestay_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_check_in ON bookings(check_in);

-- ============================================================
-- BLOCKED DATES
-- ============================================================
CREATE TABLE blocked_dates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homestay_id UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT,
  UNIQUE(homestay_id, date)
);

CREATE INDEX idx_blocked_dates_homestay_id ON blocked_dates(homestay_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Hosts: owners can manage their own records
ALTER TABLE hosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts can view own record"
  ON hosts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Hosts can update own record"
  ON hosts FOR UPDATE
  USING (auth.uid() = user_id);

-- Homestays: public read, owner write
ALTER TABLE homestays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active homestays"
  ON homestays FOR SELECT
  USING (is_active = true);

CREATE POLICY "Hosts can manage own homestays"
  ON homestays FOR ALL
  USING (host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid()));

-- Rooms: public read, owner write
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

-- Bookings: guests can insert, hosts can view/update their homestay bookings
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create a booking"
  ON bookings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Guests can view own bookings by email"
  ON bookings FOR SELECT
  USING (true);

CREATE POLICY "Hosts can manage bookings for their homestays"
  ON bookings FOR ALL
  USING (homestay_id IN (
    SELECT h.id FROM homestays h
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));

-- Blocked dates: public read, owner write
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

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================

-- Public bucket for homestay photos (hero images, gallery, room images)
INSERT INTO storage.buckets (id, name, public)
VALUES ('homestay-photos', 'homestay-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Private bucket for payment slips
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-slips', 'payment-slips', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STORAGE POLICIES
-- ============================================================

-- homestay-photos: anyone can view, authenticated hosts can upload/delete
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

-- payment-slips: anyone can upload (guests are anonymous), hosts can view their homestay slips
CREATE POLICY "Anyone can upload payment slips"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'payment-slips');

CREATE POLICY "Authenticated users can view payment slips"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payment-slips'
    AND auth.role() = 'authenticated'
  );
