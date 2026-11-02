-- ============================================================
-- Peaksnature — Full Database Schema
-- Combined from migrations 001–074 for one-shot production setup.
-- Run this in Supabase SQL Editor on a fresh project.
-- Do not run 001–074 after it: this file already contains them.
-- Data backfills (the UPDATEs in 016, 026, 030, 036, 045, 053, 073) are
-- left out because a fresh project has no rows. Only the latest version of
-- each function is kept, not the older overloads the chain left behind.
-- ============================================================

-- ************************************************************
-- 001: Initial Schema
-- ************************************************************

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- AUDIT: auto-set updated_at trigger function (027)
-- Defined first: tables below attach it as they are created.
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- HOSTS
-- (017 + 036: notification_preference, sms | line)
-- (021: security_pin_hash)
-- (034: payment_display CHECK)
-- (056: Fixed Rate term columns)
-- (062: wallet_low_notified_at)
-- (067: booking_draft_hours)
-- (073: quick_commission_pct_override)
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
  notification_preference TEXT NOT NULL DEFAULT 'sms'
    CHECK (notification_preference IN ('sms', 'line')),
  security_pin_hash TEXT DEFAULT NULL,
  deposit_amount INTEGER NOT NULL DEFAULT 0,
  deposit_by_month JSONB DEFAULT NULL,
  cancellation_days INTEGER NOT NULL DEFAULT 0,
  booking_draft_hours INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  avatar_url TEXT,
  bank_name TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  payment_display TEXT NOT NULL DEFAULT 'qr'
    CHECK (payment_display IN ('qr', 'bank')),
  require_otp BOOLEAN NOT NULL DEFAULT true,
  plan_type TEXT NOT NULL DEFAULT 'free'
    CHECK (plan_type IN ('free', 'commission', 'fixed_rate')),
  plan_free_expires_at TIMESTAMPTZ DEFAULT NULL,
  plan_pending_type TEXT DEFAULT NULL
    CHECK (plan_pending_type IS NULL OR plan_pending_type IN ('commission', 'fixed_rate')),
  plan_pending_effective_at DATE DEFAULT NULL,
  plan_pending_term_months INTEGER DEFAULT NULL
    CHECK (plan_pending_term_months IS NULL OR (plan_pending_term_months BETWEEN 1 AND 60)),
  fixed_rate_term_months INTEGER DEFAULT NULL
    CHECK (fixed_rate_term_months IS NULL OR (fixed_rate_term_months BETWEEN 1 AND 60)),
  fixed_rate_term_started_at DATE DEFAULT NULL,
  fixed_rate_term_ends_at DATE DEFAULT NULL,
  wallet_balance INTEGER NOT NULL DEFAULT 0,
  wallet_credit_limit NUMERIC(10,2) NOT NULL DEFAULT 0,
  wallet_negative_since TIMESTAMPTZ DEFAULT NULL,
  wallet_low_notified_at TIMESTAMPTZ,
  commission_pct_override NUMERIC(5,2) DEFAULT NULL,
  quick_commission_pct_override NUMERIC(5,2) DEFAULT NULL
    CHECK (quick_commission_pct_override >= 0 AND quick_commission_pct_override <= 100),
  fixed_rate_override INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system',
  UNIQUE(user_id),
  CONSTRAINT hosts_booking_draft_hours_range
    CHECK (booking_draft_hours >= 0 AND booking_draft_hours <= 168)
);

-- 062: the daily cron scans for commission hosts still owed a low-balance warning.
CREATE INDEX IF NOT EXISTS idx_hosts_wallet_low_pending
  ON hosts (wallet_balance)
  WHERE plan_type = 'commission' AND wallet_low_notified_at IS NULL;

COMMENT ON COLUMN hosts.wallet_low_notified_at IS
  'When the low-wallet-balance alert was last sent. NULL = armed, ready to warn.';
COMMENT ON COLUMN hosts.booking_draft_hours IS
  'How long a booking that reached the payment step stays payable by phone + email, in hours. 0 = feature off for this host. Capped at 168 (7 days) to match the absolute ceiling in prune_booking_drafts, so the setting and the sweep can never disagree.';
COMMENT ON COLUMN hosts.quick_commission_pct_override IS
  'Per-host quick-booking commission %. NULL = platform quick_commission_pct.';

-- ============================================================
-- HOMESTAYS
-- (002: map_embed_url replaces lat/lng)
-- (004: logo_url added)
-- (012: prohibitions + check-in/out times added)
-- (013: price_per_night dropped — pricing lives on rooms)
-- (040: social media links)
-- (043: check_in_info, policies, faq)
-- (051: promo_codes_enabled)
-- (072: amenity_icons, prohibition_icons — hand-picked { label: icon key })
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
  amenity_icons JSONB NOT NULL DEFAULT '{}'::jsonb,
  prohibition_icons JSONB NOT NULL DEFAULT '{}'::jsonb,
  check_in_time TEXT DEFAULT '14:00',
  check_out_time TEXT DEFAULT '11:00',
  hero_image_url TEXT,
  logo_url TEXT,
  gallery JSONB NOT NULL DEFAULT '[]',
  theme_color TEXT NOT NULL DEFAULT '#16a34a',
  is_active BOOLEAN NOT NULL DEFAULT true,
  check_in_info TEXT,
  policies TEXT,
  faq JSONB NOT NULL DEFAULT '[]',
  facebook_url TEXT DEFAULT NULL,
  tiktok_url TEXT DEFAULT NULL,
  instagram_url TEXT DEFAULT NULL,
  line_id TEXT DEFAULT NULL,
  promo_codes_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system'
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system'
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
  images JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX idx_rooms_homestay_id ON rooms(homestay_id);

-- ============================================================
-- ROOM OPTIONS (add-on extras per room)
-- (055: pricing_type — per_night charges price × nights, per_time a flat fee)
-- ============================================================
CREATE TABLE room_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  pricing_type TEXT NOT NULL DEFAULT 'per_night'
    CHECK (pricing_type IN ('per_night', 'per_time')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX idx_room_options_room_id ON room_options(room_id);

CREATE TRIGGER trg_room_options_updated_at
  BEFORE UPDATE ON room_options FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Room Options RLS
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

-- ============================================================
-- BOOKINGS
-- (005: guest_line_id renamed to guest_province)
-- (006: payment_slip_hash + slip_trans_ref added)
-- (014: checked_in_at + checked_out_at added)
-- (041: booking_source)
-- (052: discount_amount — total_price + discount_amount = subtotal)
-- (058: guest pricing snapshot)
-- (059: group_id — member row of a multi-room cart)
-- (063: commission_base)
-- ============================================================
CREATE TYPE booking_status AS ENUM (
  'pending',
  'verified',
  'confirmed',
  'rejected',
  'cancelled',
  'completed'
);

-- ------------------------------------------------------------
-- BOOKING GROUPS (059): the ONE payment + slip a multi-room cart
-- shares. Defined before bookings, whose group_id references it.
-- The canonical slip_trans_ref lives here; member bookings mirror
-- only the hash + url (bookings.slip_trans_ref is UNIQUE).
-- ------------------------------------------------------------
CREATE TABLE booking_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homestay_id UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,

  -- Shared guest info (one set for the whole cart)
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  guest_phone TEXT NOT NULL,
  guest_province TEXT,
  notes TEXT,

  -- Combined money (authoritative for the cart). Per-row shares live
  -- on each member booking and sum back to these values.
  total_price INTEGER NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  payment_type TEXT NOT NULL DEFAULT 'full',
  amount_paid INTEGER NOT NULL DEFAULT 0,

  -- Coordinating status (per-row status stays authoritative for
  -- availability; this mirrors the group's overall state).
  status booking_status NOT NULL DEFAULT 'pending',

  -- The ONE slip for the whole cart (canonical home for trans_ref).
  easyslip_verified BOOLEAN NOT NULL DEFAULT false,
  payment_slip_url TEXT,
  payment_slip_hash TEXT,
  slip_trans_ref TEXT,
  easyslip_response JSONB,

  booking_source TEXT NOT NULL DEFAULT 'guest',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE UNIQUE INDEX idx_booking_groups_slip_trans_ref
  ON booking_groups(slip_trans_ref) WHERE slip_trans_ref IS NOT NULL;
CREATE INDEX idx_booking_groups_slip_hash
  ON booking_groups(payment_slip_hash) WHERE payment_slip_hash IS NOT NULL;
CREATE INDEX idx_booking_groups_homestay_id ON booking_groups(homestay_id);

CREATE TRIGGER trg_booking_groups_updated_at
  BEFORE UPDATE ON booking_groups FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homestay_id UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  group_id UUID REFERENCES booking_groups(id) ON DELETE SET NULL,
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  guest_phone TEXT NOT NULL,
  guest_province TEXT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  num_guests INTEGER NOT NULL DEFAULT 1,
  total_price INTEGER NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0
    CHECK (discount_amount >= 0),
  commission_base INTEGER,
  status booking_status NOT NULL DEFAULT 'pending',
  payment_slip_url TEXT,
  easyslip_verified BOOLEAN NOT NULL DEFAULT false,
  easyslip_response JSONB,
  payment_slip_hash TEXT,
  slip_trans_ref TEXT,
  notes TEXT,
  cancel_reason TEXT,
  payment_type TEXT NOT NULL DEFAULT 'full',
  amount_paid INTEGER NOT NULL DEFAULT 0,
  booking_source TEXT DEFAULT 'guest',
  guest_pricing_label TEXT,
  guest_pricing_surcharge INTEGER NOT NULL DEFAULT 0,
  checked_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  cancelled_by TEXT,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  selected_options JSONB NOT NULL DEFAULT '[]',
  updated_by TEXT NOT NULL DEFAULT 'system',
  CONSTRAINT check_dates CHECK (check_out > check_in)
);

CREATE INDEX idx_bookings_homestay_id ON bookings(homestay_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_check_in ON bookings(check_in);
CREATE INDEX IF NOT EXISTS idx_bookings_slip_hash ON bookings(payment_slip_hash) WHERE payment_slip_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slip_trans_ref ON bookings(slip_trans_ref) WHERE slip_trans_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_group_id ON bookings(group_id) WHERE group_id IS NOT NULL;

COMMENT ON COLUMN bookings.commission_base IS
  'Overrides total_price + discount_amount as the commission base. Set for quick bookings, where total_price is the host''s own OTA/walk-in figure rather than the room rate. NULL = use the normal GMV base.';

-- ============================================================
-- BLOCKED DATES
-- ============================================================
CREATE TABLE blocked_dates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homestay_id UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX idx_blocked_dates_homestay_id ON blocked_dates(homestay_id);
CREATE INDEX idx_blocked_dates_room_id ON blocked_dates(room_id);
CREATE UNIQUE INDEX idx_blocked_dates_homestay_date_room
  ON blocked_dates (homestay_id, date, room_id) WHERE room_id IS NOT NULL;
CREATE UNIQUE INDEX idx_blocked_dates_homestay_date_all
  ON blocked_dates (homestay_id, date) WHERE room_id IS NULL;

-- ************************************************************
-- 007: Booking Holds
-- (049: guest_phone — a returning guest reclaims their own orphaned hold)
-- ************************************************************
CREATE TABLE booking_holds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  session_id TEXT NOT NULL,
  guest_phone TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_booking_holds_room_id ON booking_holds(room_id);
CREATE INDEX idx_booking_holds_expires_at ON booking_holds(expires_at);
CREATE UNIQUE INDEX idx_booking_holds_session_room_dates
  ON booking_holds(room_id, session_id, check_in, check_out);
CREATE INDEX idx_booking_holds_phone
  ON booking_holds(guest_phone) WHERE guest_phone IS NOT NULL;

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
  topic TEXT,
  rating_environment INTEGER CHECK (rating_environment >= 1 AND rating_environment <= 5),
  rating_cleanliness INTEGER CHECK (rating_cleanliness >= 1 AND rating_cleanliness <= 5),
  rating_service INTEGER CHECK (rating_service >= 1 AND rating_service <= 5),
  rating_value INTEGER CHECK (rating_value >= 1 AND rating_value <= 5),
  photos TEXT[] DEFAULT '{}',
  impression_tags TEXT[] DEFAULT '{}',
  would_return TEXT CHECK (would_return IN ('yes', 'maybe', 'no')),
  stay_highlight TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system',
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
-- 017: Push Subscriptions
-- Unused since 036 moved host notifications to SMS / LINE, but no
-- migration drops it, so it stays to match the migrated database.
-- (027: audit columns)
-- ************************************************************
CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_host_endpoint
  ON push_subscriptions(host_id, endpoint);

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
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system',
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

-- 069: that policy filters rows, not columns. The browser may UPDATE only the
-- columns the dashboard writes with the browser client; billing columns stay
-- service-role only. A NEW COLUMN THE BROWSER WRITES MUST BE ADDED TO THIS
-- GRANT, or that save fails with 42501. Revoke first: revoking the
-- table-level privilege also revokes any column-level ones.
REVOKE UPDATE ON public.hosts FROM anon, authenticated;

GRANT UPDATE (
  name,
  avatar_url,
  line_user_id,
  line_channel_access_token,
  notification_preference,
  require_otp,
  deposit_amount,
  deposit_by_month,
  cancellation_days,
  booking_draft_hours,
  phone,
  promptpay_id,
  updated_by
) ON public.hosts TO authenticated;

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

-- Booking groups (059: mirrors bookings; writes go through the
-- service-role RPC, hosts read groups for their own homestays)
ALTER TABLE booking_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts can view booking groups for own homestays"
  ON booking_groups FOR SELECT
  USING (
    homestay_id IN (
      SELECT h.id FROM homestays h
      JOIN hosts ho ON h.host_id = ho.id
      WHERE ho.user_id = auth.uid()
    )
  );

CREATE POLICY "Hosts can manage booking groups for their homestays"
  ON booking_groups FOR ALL
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

-- Booking holds (049: no public SELECT; it exposed guest_phone to the anon key.
-- App code reads holds with the service-role client.)
ALTER TABLE booking_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create a hold"
  ON booking_holds FOR INSERT WITH CHECK (true);

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

-- Push subscriptions (017)
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts can view own push subscriptions"
  ON push_subscriptions FOR SELECT
  USING (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

CREATE POLICY "Hosts can insert own push subscriptions"
  ON push_subscriptions FOR INSERT
  WITH CHECK (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

CREATE POLICY "Hosts can delete own push subscriptions"
  ON push_subscriptions FOR DELETE
  USING (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role full access on push_subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.role() = 'service_role');

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

INSERT INTO storage.buckets (id, name, public)
VALUES ('review-photos', 'review-photos', true)
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

CREATE POLICY "Anyone can view review photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'review-photos');

CREATE POLICY "Anyone can upload review photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'review-photos');

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- acquire_booking_hold (049: p_guest_phone same-phone takeover; 007 + 007_fix before that)
CREATE OR REPLACE FUNCTION acquire_booking_hold(
  p_room_id UUID,
  p_check_in DATE,
  p_check_out DATE,
  p_session_id TEXT,
  p_hold_minutes INT DEFAULT 5,
  p_guest_phone TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_room_qty INT;
  v_active_count INT;
  v_hold_id UUID;
  v_phone TEXT := NULLIF(trim(p_guest_phone), '');
BEGIN
  -- Serialize concurrent hold attempts for the same room
  PERFORM pg_advisory_xact_lock(hashtext(p_room_id::text));

  -- Get room quantity
  SELECT quantity INTO v_room_qty FROM rooms WHERE id = p_room_id;
  IF v_room_qty IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  -- Delete expired holds for this room (opportunistic cleanup)
  DELETE FROM booking_holds WHERE room_id = p_room_id AND expires_at <= NOW();

  -- Same-phone takeover: drop any overlapping holds owned by this phone
  -- before computing conflicts. This lets a returning guest reclaim their
  -- own orphaned hold from a previous browser session.
  IF v_phone IS NOT NULL THEN
    DELETE FROM booking_holds
    WHERE room_id = p_room_id
      AND guest_phone = v_phone
      AND check_in < p_check_out
      AND check_out > p_check_in;
  END IF;

  -- First check: confirmed bookings alone
  SELECT COUNT(*) INTO v_active_count
  FROM bookings
  WHERE room_id = p_room_id
    AND status IN ('pending', 'confirmed', 'verified')
    AND check_in < p_check_out
    AND check_out > p_check_in;

  IF v_active_count >= v_room_qty THEN
    RAISE EXCEPTION 'DATES_UNAVAILABLE';
  END IF;

  -- Second check: bookings + active holds from other sessions
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

  -- Upsert: create or refresh hold for this session
  INSERT INTO booking_holds (room_id, check_in, check_out, session_id, expires_at, guest_phone)
  VALUES (p_room_id, p_check_in, p_check_out, p_session_id, NOW() + (p_hold_minutes || ' minutes')::interval, v_phone)
  ON CONFLICT (room_id, session_id, check_in, check_out)
  DO UPDATE SET
    expires_at = NOW() + (p_hold_minutes || ' minutes')::interval,
    guest_phone = COALESCE(EXCLUDED.guest_phone, booking_holds.guest_phone)
  RETURNING id INTO v_hold_id;

  RETURN v_hold_id;
END;
$$ LANGUAGE plpgsql;

-- create_booking_atomic (052: canonical 24-arg version with p_discount_amount.
-- 050 added the same-phone hold cleanup; 042 and 054 dropped the 22- and
-- 23-arg overloads, which PostgREST could not tell apart from this one.)
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
  p_amount_paid INT DEFAULT 0,
  p_created_by TEXT DEFAULT 'unknown',
  p_selected_options JSONB DEFAULT '[]',
  p_booking_source TEXT DEFAULT 'guest',
  p_discount_amount INT DEFAULT 0
) RETURNS UUID AS $$
DECLARE
  v_booking_id UUID;
  v_room_qty INT;
  v_overlap_count INT;
  v_blocked BOOLEAN;
  v_phone TEXT := NULLIF(trim(p_guest_phone), '');
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_room_id::text));

  SELECT quantity INTO v_room_qty FROM rooms WHERE id = p_room_id;
  IF v_room_qty IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  SELECT COUNT(*) INTO v_overlap_count
  FROM bookings
  WHERE room_id = p_room_id
    AND status IN ('confirmed', 'pending', 'verified')
    AND check_in < p_check_out
    AND check_out > p_check_in;

  IF v_overlap_count >= v_room_qty THEN
    RAISE EXCEPTION 'DATES_UNAVAILABLE';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM blocked_dates
    WHERE (homestay_id = p_homestay_id AND room_id IS NULL AND date >= p_check_in AND date < p_check_out)
       OR (room_id = p_room_id AND date >= p_check_in AND date < p_check_out)
  ) INTO v_blocked;

  IF v_blocked THEN
    RAISE EXCEPTION 'DATES_BLOCKED';
  END IF;

  INSERT INTO bookings (
    homestay_id, room_id, guest_name, guest_email, guest_phone, guest_province,
    check_in, check_out, num_guests, total_price, status,
    easyslip_verified, payment_slip_hash, slip_trans_ref, payment_slip_url, easyslip_response,
    notes, payment_type, amount_paid, created_by, selected_options, booking_source,
    discount_amount
  ) VALUES (
    p_homestay_id, p_room_id, p_guest_name, p_guest_email, p_guest_phone, p_guest_province,
    p_check_in, p_check_out, p_num_guests, p_total_price, p_status,
    p_easyslip_verified, p_payment_slip_hash, p_slip_trans_ref, p_payment_slip_url, p_easyslip_response,
    p_notes, p_payment_type, p_amount_paid, p_created_by, p_selected_options, p_booking_source,
    GREATEST(0, p_discount_amount)
  ) RETURNING id INTO v_booking_id;

  IF p_session_id IS NOT NULL THEN
    DELETE FROM booking_holds WHERE session_id = p_session_id;
  END IF;

  IF v_phone IS NOT NULL THEN
    DELETE FROM booking_holds
    WHERE room_id = p_room_id
      AND guest_phone = v_phone
      AND check_in < p_check_out
      AND check_out > p_check_in;
  END IF;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql;

-- ************************************************************
-- 025: Platform Admins
-- ************************************************************
CREATE TABLE platform_admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  promptpay_id TEXT,
  line_user_id TEXT,
  line_channel_access_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system',
  UNIQUE(user_id)
);

CREATE INDEX idx_platform_admins_user_id ON platform_admins(user_id);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
-- No RLS policies = service-role only access

-- ============================================================
-- AUDIT: auto-set updated_at triggers (027)
-- (set_updated_at() itself is defined at the top of this file)
-- ============================================================
CREATE TRIGGER trg_hosts_updated_at
  BEFORE UPDATE ON hosts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_homestays_updated_at
  BEFORE UPDATE ON homestays FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_homestay_slug_redirects_updated_at
  BEFORE UPDATE ON homestay_slug_redirects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_rooms_updated_at
  BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_blocked_dates_updated_at
  BEFORE UPDATE ON blocked_dates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_room_seasonal_prices_updated_at
  BEFORE UPDATE ON room_seasonal_prices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_platform_admins_updated_at
  BEFORE UPDATE ON platform_admins FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- HISTORY LOGS (append-only audit/event log)
-- ============================================================
CREATE TABLE history_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homestay_id UUID REFERENCES homestays(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('guest', 'host', 'admin', 'system')),
  actor_id    TEXT,
  data        JSONB DEFAULT '{}',
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_history_entity ON history_logs (entity_type, entity_id);
CREATE INDEX idx_history_homestay ON history_logs (homestay_id);
CREATE INDEX idx_history_created ON history_logs (created_at);
CREATE INDEX idx_history_event ON history_logs (event_type);

CREATE OR REPLACE FUNCTION prevent_history_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'history_logs is append-only: % not allowed', TG_OP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_history_logs_no_update
  BEFORE UPDATE ON history_logs FOR EACH ROW
  EXECUTE FUNCTION prevent_history_log_mutation();

CREATE TRIGGER trg_history_logs_no_delete
  BEFORE DELETE ON history_logs FOR EACH ROW
  EXECUTE FUNCTION prevent_history_log_mutation();

-- ************************************************************
-- 029: Date Change Requests
-- (030: old/new room; 031: additional_payment; 047: slip indexes)
-- (052: new_discount_amount; 061: approve is group-aware)
-- ************************************************************
CREATE TABLE date_change_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  old_check_in      DATE NOT NULL,
  old_check_out     DATE NOT NULL,
  new_check_in      DATE NOT NULL,
  new_check_out     DATE NOT NULL,
  old_total_price   INTEGER NOT NULL,
  new_total_price   INTEGER NOT NULL,
  price_difference  INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by      TEXT NOT NULL,
  slip_hash         TEXT,
  slip_trans_ref    TEXT,
  payment_slip_url  TEXT,
  easyslip_response JSONB,
  easyslip_verified BOOLEAN DEFAULT FALSE,
  reject_reason     TEXT,
  old_room_id       UUID REFERENCES rooms(id),
  new_room_id       UUID REFERENCES rooms(id),
  additional_payment INTEGER NOT NULL DEFAULT 0,
  new_discount_amount INTEGER NOT NULL DEFAULT 0
    CHECK (new_discount_amount >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT NOT NULL DEFAULT 'guest',
  updated_by        TEXT NOT NULL DEFAULT 'guest'
);

CREATE INDEX idx_date_change_booking ON date_change_requests (booking_id);
CREATE INDEX idx_date_change_status ON date_change_requests (status);
CREATE INDEX IF NOT EXISTS idx_date_change_requests_slip_hash
  ON date_change_requests(slip_hash) WHERE slip_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_date_change_requests_slip_trans_ref
  ON date_change_requests(slip_trans_ref) WHERE slip_trans_ref IS NOT NULL;

ALTER TABLE date_change_requests ENABLE ROW LEVEL SECURITY;

-- Hosts can view date change requests for bookings at their homestays
CREATE POLICY "Hosts can view date change requests for own homestays"
  ON date_change_requests FOR SELECT
  USING (
    booking_id IN (
      SELECT b.id FROM bookings b
      WHERE b.homestay_id IN (
        SELECT h.id FROM homestays h
        WHERE h.host_id IN (
          SELECT ho.id FROM hosts ho WHERE ho.user_id = auth.uid()
        )
      )
    )
  );

-- Hosts can update date change requests (approve/reject) for their homestays
CREATE POLICY "Hosts can manage date change requests for own homestays"
  ON date_change_requests FOR UPDATE
  USING (
    booking_id IN (
      SELECT b.id FROM bookings b
      WHERE b.homestay_id IN (
        SELECT h.id FROM homestays h
        WHERE h.host_id IN (
          SELECT ho.id FROM hosts ho WHERE ho.user_id = auth.uid()
        )
      )
    )
  );

-- Anyone can insert a date change request (guest-initiated via service role, but allow for safety)
CREATE POLICY "Anyone can insert date change requests"
  ON date_change_requests FOR INSERT
  WITH CHECK (true);

CREATE TRIGGER trg_date_change_requests_updated_at
  BEFORE UPDATE ON date_change_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- approve_date_change_atomic (061: 052's version + group reconcile)
CREATE OR REPLACE FUNCTION approve_date_change_atomic(
  p_request_id UUID,
  p_approved_by TEXT DEFAULT 'unknown'
) RETURNS BOOLEAN AS $$
DECLARE
  v_req RECORD;
  v_booking RECORD;
  v_target_room_id UUID;
  v_room_qty INT;
  v_overlap_count INT;
  v_blocked_count INT;
  v_new_amount_paid INT;
BEGIN
  SELECT * INTO v_req FROM date_change_requests WHERE id = p_request_id AND status = 'pending';
  IF v_req IS NULL THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND';
  END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = v_req.booking_id;
  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  v_target_room_id := COALESCE(v_req.new_room_id, v_booking.room_id);

  IF v_target_room_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_target_room_id::text));

    IF v_req.new_room_id IS NOT NULL AND v_req.new_room_id != v_booking.room_id THEN
      PERFORM pg_advisory_xact_lock(hashtext(v_booking.room_id::text));
    END IF;

    SELECT quantity INTO v_room_qty FROM rooms WHERE id = v_target_room_id;
    IF v_room_qty IS NULL THEN
      RAISE EXCEPTION 'ROOM_NOT_FOUND';
    END IF;

    SELECT COUNT(*) INTO v_overlap_count
    FROM bookings
    WHERE room_id = v_target_room_id
      AND id != v_booking.id
      AND status IN ('pending', 'confirmed', 'verified')
      AND check_in < v_req.new_check_out
      AND check_out > v_req.new_check_in;

    IF v_overlap_count >= v_room_qty THEN
      RAISE EXCEPTION 'DATES_UNAVAILABLE';
    END IF;

    SELECT COUNT(*) INTO v_blocked_count
    FROM blocked_dates
    WHERE homestay_id = v_booking.homestay_id
      AND date >= v_req.new_check_in
      AND date < v_req.new_check_out
      AND (room_id IS NULL OR room_id = v_target_room_id);

    IF v_blocked_count > 0 THEN
      RAISE EXCEPTION 'DATES_BLOCKED';
    END IF;
  END IF;

  -- KNOWN GAP, mirrored from 061 as applied: 031 credited the deposit-aware
  -- additional_payment here; 052 copied 030 and went back to price_difference.
  v_new_amount_paid := v_booking.amount_paid;
  IF v_req.price_difference > 0 AND v_req.easyslip_verified THEN
    v_new_amount_paid := v_booking.amount_paid + v_req.price_difference;
  END IF;
  IF v_new_amount_paid > v_req.new_total_price THEN
    v_new_amount_paid := v_req.new_total_price;
  END IF;

  UPDATE bookings
  SET check_in = v_req.new_check_in,
      check_out = v_req.new_check_out,
      total_price = v_req.new_total_price,
      discount_amount = COALESCE(v_req.new_discount_amount, 0),
      amount_paid = v_new_amount_paid,
      room_id = v_target_room_id,
      updated_by = p_approved_by
  WHERE id = v_booking.id;

  -- Keep promo_redemptions.discount_amount in sync if a redemption exists.
  -- Commission stays locked at its original value (host's deal with the recommender
  -- doesn't change just because the guest moved their dates).
  UPDATE promo_redemptions
  SET discount_amount = COALESCE(v_req.new_discount_amount, 0),
      updated_by = p_approved_by
  WHERE booking_id = v_booking.id;

  -- ---- Group reconcile (multi-room cart) -------------------------------
  -- For a grouped booking, the member row above just changed, so re-sum the
  -- member rows into the booking_groups parent and the group-keyed redemption.
  -- Single-room bookings (group_id IS NULL) skip this entirely.
  IF v_booking.group_id IS NOT NULL THEN
    UPDATE booking_groups g
    SET total_price = sums.total_price,
        discount_amount = sums.discount_amount,
        amount_paid = sums.amount_paid,
        updated_by = p_approved_by
    FROM (
      SELECT COALESCE(SUM(total_price), 0)     AS total_price,
             COALESCE(SUM(discount_amount), 0) AS discount_amount,
             COALESCE(SUM(amount_paid), 0)     AS amount_paid
      FROM bookings
      WHERE group_id = v_booking.group_id
    ) sums
    WHERE g.id = v_booking.group_id;

    UPDATE promo_redemptions
    SET discount_amount = (
          SELECT COALESCE(SUM(discount_amount), 0)
          FROM bookings
          WHERE group_id = v_booking.group_id
        ),
        updated_by = p_approved_by
    WHERE group_id = v_booking.group_id;
  END IF;
  -- ---------------------------------------------------------------------

  UPDATE date_change_requests
  SET status = 'approved',
      updated_by = p_approved_by
  WHERE id = p_request_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ************************************************************
-- 038: Billing & Plans System
-- (039: refund RPC; 045 + 046: wallet credit floor; 047: slip indexes)
-- (056: Fixed Rate term tiers + invoice term metadata)
-- (071: deduct_wallet_commission charges a booking at most once)
-- (073: quick_commission_pct — rate for host quick bookings)
-- ************************************************************

-- ============================================================
-- PLATFORM BILLING CONFIG (singleton)
-- ============================================================
CREATE TABLE platform_billing_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  commission_pct NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  quick_commission_pct NUMERIC(5,2) NOT NULL DEFAULT 5.00
    CHECK (quick_commission_pct >= 0 AND quick_commission_pct <= 100),
  fixed_rate_amount INTEGER NOT NULL DEFAULT 0,
  fixed_rate_term_tiers JSONB NOT NULL DEFAULT
    '[
       {"months": 1,  "discount_pct": 0},
       {"months": 3,  "discount_pct": 0},
       {"months": 6,  "discount_pct": 8},
       {"months": 12, "discount_pct": 15}
     ]'::jsonb,
  promptpay_id TEXT,
  bank_name TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  payment_display TEXT NOT NULL DEFAULT 'qr'
    CHECK (payment_display IN ('qr', 'bank')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE platform_billing_config ENABLE ROW LEVEL SECURITY;
-- No RLS policies = service-role only access

CREATE TRIGGER trg_platform_billing_config_updated_at
  BEFORE UPDATE ON platform_billing_config FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed default row
INSERT INTO platform_billing_config (commission_pct, fixed_rate_amount, payment_display)
VALUES (5.00, 0, 'qr');

COMMENT ON COLUMN platform_billing_config.quick_commission_pct IS
  'Commission % charged on host quick bookings (booking_source <> ''guest''). commission_pct is the guest-booking rate.';

-- ============================================================
-- WALLET TRANSACTIONS (append-only ledger)
-- ============================================================
CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('topup', 'commission', 'refund', 'adjustment')),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reference_id TEXT,
  description TEXT,
  slip_url TEXT,
  slip_hash TEXT,
  slip_trans_ref TEXT,
  easyslip_verified BOOLEAN DEFAULT false,
  easyslip_response JSONB,
  status TEXT NOT NULL DEFAULT 'verified'
    CHECK (status IN ('pending', 'verified', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX idx_wallet_transactions_host_id ON wallet_transactions(host_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_slip_hash
  ON wallet_transactions(slip_hash) WHERE slip_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_slip_trans_ref
  ON wallet_transactions(slip_trans_ref) WHERE slip_trans_ref IS NOT NULL;

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts can view own wallet transactions"
  ON wallet_transactions FOR SELECT
  USING (host_id IN (
    SELECT id FROM hosts WHERE user_id = auth.uid()
  ));

-- ============================================================
-- INVOICES (fixed-rate monthly billing)
-- ============================================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'overdue')),
  slip_url TEXT,
  slip_hash TEXT,
  slip_trans_ref TEXT,
  easyslip_verified BOOLEAN DEFAULT false,
  easyslip_response JSONB,
  paid_at TIMESTAMPTZ,
  due_date DATE NOT NULL,
  term_months INTEGER NOT NULL DEFAULT 1
    CHECK (term_months BETWEEN 1 AND 60),
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX idx_invoices_host_status ON invoices(host_id, status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_slip_hash
  ON invoices(slip_hash) WHERE slip_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_slip_trans_ref
  ON invoices(slip_trans_ref) WHERE slip_trans_ref IS NOT NULL;

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts can view own invoices"
  ON invoices FOR SELECT
  USING (host_id IN (
    SELECT id FROM hosts WHERE user_id = auth.uid()
  ));

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- BILLING FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION deduct_wallet_commission(
  p_host_id UUID,
  p_amount INTEGER,
  p_booking_id TEXT,
  p_description TEXT DEFAULT 'Commission deduction'
)
RETURNS TABLE(new_balance INTEGER, transaction_id UUID) AS $$
DECLARE
  v_new_balance INTEGER;
  v_txn_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_host_id::text));

  -- Already charged, and not refunded since: write nothing.
  IF (SELECT count(*) FROM wallet_transactions
        WHERE reference_id = p_booking_id AND type = 'commission')
   > (SELECT count(*) FROM wallet_transactions
        WHERE reference_id = p_booking_id AND type = 'refund') THEN
    SELECT h.wallet_balance INTO v_new_balance FROM hosts h WHERE h.id = p_host_id;
    RETURN QUERY SELECT v_new_balance, NULL::UUID;
    RETURN;
  END IF;

  UPDATE hosts
  SET wallet_balance = wallet_balance - p_amount,
      wallet_negative_since = CASE
        WHEN (wallet_balance - p_amount) < 0 AND wallet_negative_since IS NULL THEN now()
        ELSE wallet_negative_since
      END
  WHERE id = p_host_id
  RETURNING wallet_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOST_NOT_FOUND';
  END IF;

  INSERT INTO wallet_transactions (host_id, type, amount, balance_after, reference_id, description, status, created_by)
  VALUES (p_host_id, 'commission', -p_amount, v_new_balance, p_booking_id, p_description, 'verified', 'system')
  RETURNING id INTO v_txn_id;

  RETURN QUERY SELECT v_new_balance, v_txn_id;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.deduct_wallet_commission(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_wallet_commission(UUID, INTEGER, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION topup_wallet(
  p_host_id UUID,
  p_amount INTEGER,
  p_slip_url TEXT DEFAULT NULL,
  p_slip_hash TEXT DEFAULT NULL,
  p_slip_trans_ref TEXT DEFAULT NULL,
  p_easyslip_verified BOOLEAN DEFAULT false,
  p_easyslip_response JSONB DEFAULT NULL,
  p_created_by TEXT DEFAULT 'host'
)
RETURNS TABLE(new_balance INTEGER, transaction_id UUID) AS $$
DECLARE
  v_new_balance INTEGER;
  v_txn_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_host_id::text));

  UPDATE hosts
  SET wallet_balance = wallet_balance + p_amount,
      wallet_negative_since = CASE
        WHEN (wallet_balance + p_amount) >= 0 THEN NULL
        ELSE wallet_negative_since
      END
  WHERE id = p_host_id
  RETURNING wallet_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOST_NOT_FOUND';
  END IF;

  INSERT INTO wallet_transactions (
    host_id, type, amount, balance_after, description,
    slip_url, slip_hash, slip_trans_ref, easyslip_verified, easyslip_response,
    status, created_by
  )
  VALUES (
    p_host_id, 'topup', p_amount, v_new_balance, 'Wallet top-up',
    p_slip_url, p_slip_hash, p_slip_trans_ref, p_easyslip_verified, p_easyslip_response,
    'verified', p_created_by
  )
  RETURNING id INTO v_txn_id;

  RETURN QUERY SELECT v_new_balance, v_txn_id;
END;
$$ LANGUAGE plpgsql;

-- Index for efficient commission/refund lookups by booking
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reference_id
  ON wallet_transactions(reference_id) WHERE reference_id IS NOT NULL;

-- Atomic wallet commission refund function
CREATE OR REPLACE FUNCTION refund_wallet_commission(
  p_host_id UUID,
  p_amount INTEGER,
  p_booking_id TEXT,
  p_description TEXT DEFAULT 'Commission refund'
)
RETURNS TABLE(new_balance INTEGER, transaction_id UUID) AS $$
DECLARE
  v_new_balance INTEGER;
  v_txn_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_host_id::text));

  UPDATE hosts
  SET wallet_balance = wallet_balance + p_amount,
      wallet_negative_since = CASE
        WHEN (wallet_balance + p_amount) >= 0 THEN NULL
        ELSE wallet_negative_since
      END
  WHERE id = p_host_id
  RETURNING wallet_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOST_NOT_FOUND';
  END IF;

  INSERT INTO wallet_transactions (host_id, type, amount, balance_after, reference_id, description, status, created_by)
  VALUES (p_host_id, 'refund', p_amount, v_new_balance, p_booking_id, p_description, 'verified', 'system')
  RETURNING id INTO v_txn_id;

  RETURN QUERY SELECT v_new_balance, v_txn_id;
END;
$$ LANGUAGE plpgsql;

-- ************************************************************
-- 044: Billing Retry Queue
-- Failed commission deduct/refund RPCs, retried by the daily cron.
-- (074: RLS on, no policies = service-role only)
-- ************************************************************
CREATE TABLE billing_retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL CHECK (operation IN ('deduct_commission','refund_commission')),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Partial index: only pending rows (resolved_at IS NULL).
CREATE INDEX IF NOT EXISTS billing_retry_queue_pending_idx
  ON billing_retry_queue (next_attempt_at)
  WHERE resolved_at IS NULL;

-- Prevent duplicate pending rows for the same (operation, booking_id) pair.
CREATE UNIQUE INDEX IF NOT EXISTS billing_retry_queue_pending_unique_idx
  ON billing_retry_queue (operation, booking_id)
  WHERE resolved_at IS NULL;

ALTER TABLE billing_retry_queue ENABLE ROW LEVEL SECURITY;
-- No RLS policies = service-role only access

-- ************************************************************
-- 048: Admin Revenue RPC
-- (052: GMV — total_price + discount_amount, so a promo doesn't
--  shrink the platform's reported revenue)
-- ************************************************************

CREATE OR REPLACE FUNCTION public.get_admin_revenue_total()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(total_price + COALESCE(discount_amount, 0)), 0)::BIGINT
  FROM bookings
  WHERE status IN ('confirmed', 'completed');
$$;

REVOKE ALL ON FUNCTION public.get_admin_revenue_total() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_revenue_total() TO service_role;

-- ************************************************************
-- 051: Promo Codes & Affiliate Recommender Commission
-- (homestays.promo_codes_enabled is the per-homestay opt-in)
-- (052: host UPDATE policy on redemptions dropped)
-- (053: recommender_phone stored digits-only, indexed)
-- (059: a redemption targets a booking OR a booking group)
-- ************************************************************
CREATE TABLE promo_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homestay_id UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,
  code TEXT NOT NULL,

  -- Discount applied to the guest's booking total.
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value >= 0),

  -- Optional Recommender block. If recommender_name is set, host can also
  -- attach a commission_type/value so the system computes per-redemption payout.
  recommender_name TEXT,
  recommender_phone TEXT,
  recommender_promptpay TEXT,
  recommender_note TEXT,
  commission_type TEXT CHECK (commission_type IN ('percentage', 'fixed')),
  commission_value NUMERIC(10,2) CHECK (commission_value IS NULL OR commission_value >= 0),

  -- Constraints
  start_at DATE,
  expires_at DATE,
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  times_used INTEGER NOT NULL DEFAULT 0,
  one_use_per_guest BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system',

  -- Validity range must be coherent
  CONSTRAINT promo_codes_dates_chk CHECK (start_at IS NULL OR expires_at IS NULL OR expires_at >= start_at),
  -- Commission fields require recommender_name
  CONSTRAINT promo_codes_commission_chk CHECK (
    (commission_type IS NULL AND commission_value IS NULL)
    OR (recommender_name IS NOT NULL AND commission_type IS NOT NULL AND commission_value IS NOT NULL)
  ),
  -- Percentage discounts must be 0..100
  CONSTRAINT promo_codes_pct_range_chk CHECK (
    discount_type <> 'percentage' OR (discount_value >= 0 AND discount_value <= 100)
  ),
  CONSTRAINT promo_codes_commission_pct_range_chk CHECK (
    commission_type IS NULL OR commission_type <> 'percentage' OR (commission_value >= 0 AND commission_value <= 100)
  )
);

CREATE UNIQUE INDEX idx_promo_codes_homestay_code ON promo_codes(homestay_id, code);
CREATE INDEX idx_promo_codes_homestay_active ON promo_codes(homestay_id, is_active);
CREATE INDEX IF NOT EXISTS idx_promo_codes_recommender_phone
  ON promo_codes (recommender_phone)
  WHERE recommender_phone IS NOT NULL;

CREATE TRIGGER trg_promo_codes_updated_at
  BEFORE UPDATE ON promo_codes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE promo_redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  -- 059: one of booking_id / group_id is set (promo_redemption_target_chk).
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  group_id UUID REFERENCES booking_groups(id) ON DELETE CASCADE,
  discount_amount INTEGER NOT NULL CHECK (discount_amount >= 0),
  commission_amount INTEGER NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  payout_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payout_status IN ('pending', 'paid', 'cancelled')),
  paid_at TIMESTAMPTZ,
  paid_note TEXT,

  -- Denormalized for one-use-per-guest enforcement & quick host display
  guest_phone TEXT NOT NULL,
  guest_email TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system',

  UNIQUE (booking_id),
  CONSTRAINT promo_redemption_target_chk
    CHECK (booking_id IS NOT NULL OR group_id IS NOT NULL)
);

CREATE INDEX idx_promo_redemptions_code_phone ON promo_redemptions(promo_code_id, guest_phone);
CREATE INDEX idx_promo_redemptions_code_email ON promo_redemptions(promo_code_id, guest_email);
CREATE INDEX idx_promo_redemptions_code_status ON promo_redemptions(promo_code_id, payout_status);
CREATE UNIQUE INDEX idx_promo_redemptions_group
  ON promo_redemptions(group_id) WHERE group_id IS NOT NULL;

CREATE TRIGGER trg_promo_redemptions_updated_at
  BEFORE UPDATE ON promo_redemptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;

-- Hosts manage promo codes for homestays they own
CREATE POLICY "Hosts can manage promo codes for own homestays"
  ON promo_codes FOR ALL
  USING (homestay_id IN (
    SELECT h.id FROM homestays h
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ))
  WITH CHECK (homestay_id IN (
    SELECT h.id FROM homestays h
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));

-- Hosts can only SELECT redemptions for their own codes. INSERT is not
-- exposed (only the service-role booking API creates rows), and since 052
-- "mark as paid" runs through /api/host/promo-redemptions/[id]/mark-paid
-- on the service role, which validates ownership.
CREATE POLICY "Hosts can view redemptions for own codes"
  ON promo_redemptions FOR SELECT
  USING (promo_code_id IN (
    SELECT pc.id FROM promo_codes pc
    JOIN homestays h ON pc.homestay_id = h.id
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));

-- ************************************************************
-- 057: Room Guest Pricing (per-composition surcharge tiers per room)
-- A host lists guest compositions (adults + children), each adding a
-- per-night surcharge on top of the room base price.
-- ************************************************************
CREATE TABLE room_guest_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  adults INTEGER NOT NULL DEFAULT 2,
  children INTEGER NOT NULL DEFAULT 0,
  detail TEXT,
  surcharge INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX idx_room_guest_pricing_room_id ON room_guest_pricing(room_id);

CREATE TRIGGER trg_room_guest_pricing_updated_at
  BEFORE UPDATE ON room_guest_pricing FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE room_guest_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view room guest pricing"
  ON room_guest_pricing FOR SELECT
  USING (true);

CREATE POLICY "Hosts can manage guest pricing of own rooms"
  ON room_guest_pricing FOR ALL
  USING (room_id IN (
    SELECT r.id FROM rooms r
    JOIN homestays h ON r.homestay_id = h.id
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));

-- ************************************************************
-- 060: create_booking_group_atomic
-- All-or-nothing creation of a multi-room cart: N member bookings
-- sharing one booking_groups parent + one slip/payment. Rooms are
-- locked in sorted order, in the same lock space as the single-room
-- RPC and holds, so it cannot deadlock against them. Money shares are
-- computed and price-verified by the API route; this only enforces
-- availability.
-- p_items: JSONB array, one element per room:
--   { room_id, check_in, check_out, num_guests,
--     total_price, discount_amount, amount_paid,
--     selected_options, guest_pricing_label, guest_pricing_surcharge }
-- ************************************************************
CREATE OR REPLACE FUNCTION create_booking_group_atomic(
  p_homestay_id UUID,
  p_guest_name TEXT,
  p_guest_email TEXT,
  p_guest_phone TEXT,
  p_guest_province TEXT,
  p_notes TEXT,
  p_status booking_status,
  p_easyslip_verified BOOLEAN,
  p_payment_slip_hash TEXT,
  p_slip_trans_ref TEXT,
  p_payment_slip_url TEXT,
  p_easyslip_response JSONB,
  p_payment_type TEXT,
  p_amount_paid INT,
  p_total_price INT,
  p_discount_amount INT,
  p_session_id TEXT,
  p_created_by TEXT,
  p_booking_source TEXT,
  p_items JSONB
) RETURNS UUID AS $$
DECLARE
  v_group_id UUID;
  v_room UUID;
  v_item JSONB;
  v_room_qty INT;
  v_overlap_count INT;
  v_blocked BOOLEAN;
  v_phone TEXT := NULLIF(trim(p_guest_phone), '');
BEGIN
  -- 1) Lock every distinct room, in sorted order → deadlock-free.
  FOR v_room IN
    SELECT DISTINCT (e->>'room_id')::uuid AS rid
    FROM jsonb_array_elements(p_items) e
    ORDER BY rid
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext(v_room::text));
  END LOOP;

  -- 2) Create the shared parent (canonical slip + combined money).
  INSERT INTO booking_groups (
    homestay_id, guest_name, guest_email, guest_phone, guest_province, notes,
    total_price, discount_amount, payment_type, amount_paid, status,
    easyslip_verified, payment_slip_url, payment_slip_hash, slip_trans_ref, easyslip_response,
    booking_source, created_by, updated_by
  ) VALUES (
    p_homestay_id, p_guest_name, p_guest_email, p_guest_phone, p_guest_province, p_notes,
    p_total_price, GREATEST(0, p_discount_amount), p_payment_type, p_amount_paid, p_status,
    p_easyslip_verified, p_payment_slip_url, p_payment_slip_hash, p_slip_trans_ref, p_easyslip_response,
    p_booking_source, p_created_by, p_created_by
  ) RETURNING id INTO v_group_id;

  -- 3) Per item: re-check availability (sees prior inserts in THIS txn)
  --    + blocked dates, then insert the member booking row.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT quantity INTO v_room_qty FROM rooms WHERE id = (v_item->>'room_id')::uuid;
    IF v_room_qty IS NULL THEN
      RAISE EXCEPTION 'ROOM_NOT_FOUND';
    END IF;

    SELECT COUNT(*) INTO v_overlap_count
    FROM bookings
    WHERE room_id = (v_item->>'room_id')::uuid
      AND status IN ('confirmed', 'pending', 'verified')
      AND check_in < (v_item->>'check_out')::date
      AND check_out > (v_item->>'check_in')::date;

    IF v_overlap_count >= v_room_qty THEN
      RAISE EXCEPTION 'DATES_UNAVAILABLE:%', (v_item->>'room_id');
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM blocked_dates
      WHERE (homestay_id = p_homestay_id AND room_id IS NULL
             AND date >= (v_item->>'check_in')::date AND date < (v_item->>'check_out')::date)
         OR (room_id = (v_item->>'room_id')::uuid
             AND date >= (v_item->>'check_in')::date AND date < (v_item->>'check_out')::date)
    ) INTO v_blocked;

    IF v_blocked THEN
      RAISE EXCEPTION 'DATES_BLOCKED:%', (v_item->>'room_id');
    END IF;

    INSERT INTO bookings (
      homestay_id, group_id, room_id, guest_name, guest_email, guest_phone, guest_province,
      check_in, check_out, num_guests, total_price, discount_amount, status,
      easyslip_verified, payment_slip_hash, slip_trans_ref, payment_slip_url, easyslip_response,
      notes, payment_type, amount_paid, created_by, updated_by, selected_options, booking_source,
      guest_pricing_label, guest_pricing_surcharge
    ) VALUES (
      p_homestay_id, v_group_id, (v_item->>'room_id')::uuid, p_guest_name, p_guest_email, p_guest_phone, p_guest_province,
      (v_item->>'check_in')::date, (v_item->>'check_out')::date, (v_item->>'num_guests')::int,
      (v_item->>'total_price')::int, GREATEST(0, COALESCE((v_item->>'discount_amount')::int, 0)), p_status,
      -- Mirror only hash + url onto the row; trans_ref stays canonical on the group.
      p_easyslip_verified, p_payment_slip_hash, NULL, p_payment_slip_url, NULL,
      p_notes, p_payment_type, COALESCE((v_item->>'amount_paid')::int, 0), p_created_by, p_created_by,
      COALESCE(v_item->'selected_options', '[]'::jsonb), p_booking_source,
      NULLIF(v_item->>'guest_pricing_label', ''), COALESCE((v_item->>'guest_pricing_surcharge')::int, 0)
    );
  END LOOP;

  -- 4) Clear holds for this session and this phone across all items
  --    (mirror create_booking_atomic's hold cleanup).
  IF p_session_id IS NOT NULL THEN
    DELETE FROM booking_holds WHERE session_id = p_session_id;
  END IF;

  IF v_phone IS NOT NULL THEN
    DELETE FROM booking_holds h
    USING jsonb_array_elements(p_items) e
    WHERE h.room_id = (e->>'room_id')::uuid
      AND h.guest_phone = v_phone
      AND h.check_in < (e->>'check_out')::date
      AND h.check_out > (e->>'check_in')::date;
  END IF;

  RETURN v_group_id;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION create_booking_group_atomic(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, booking_status, BOOLEAN, TEXT, TEXT, TEXT, JSONB,
  TEXT, INT, INT, INT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_booking_group_atomic(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, booking_status, BOOLEAN, TEXT, TEXT, TEXT, JSONB,
  TEXT, INT, INT, INT, TEXT, TEXT, TEXT, JSONB
) TO service_role;

-- ************************************************************
-- 064: Room Special Prices (weekday + specific-date surcharges)
-- A SURCHARGE on top of the night's seasonal (or base) price, not a
-- replacement. Only the most specific rule applies per night, ranked in
-- src/lib/calculate-price.ts; overlap is resolved by that precedence, so
-- there is deliberately no exclusion constraint.
-- ************************************************************
CREATE TABLE room_special_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('weekday', 'date')),
  weekdays SMALLINT[] NOT NULL DEFAULT '{}',
  dates DATE[] NOT NULL DEFAULT '{}',
  start_date DATE,
  end_date DATE,
  surcharge INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system',
  CONSTRAINT check_special_window
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT check_special_payload CHECK (
    (rule_type = 'weekday' AND array_length(weekdays, 1) > 0) OR
    (rule_type = 'date'    AND array_length(dates, 1) > 0)
  )
);

COMMENT ON COLUMN room_special_prices.weekdays IS
  '0=Sunday … 6=Saturday, matching JS Date.getDay(). Empty for rule_type=''date''.';
COMMENT ON COLUMN room_special_prices.start_date IS
  'Optional window start for weekday rules. NULL means unbounded on this side.';
COMMENT ON COLUMN room_special_prices.surcharge IS
  'THB added per night on top of the seasonal price (or the room base price when no season covers the night). NOT a replacement price.';

CREATE INDEX idx_room_special_prices_room_id ON room_special_prices(room_id);

CREATE TRIGGER trg_room_special_prices_updated_at
  BEFORE UPDATE ON room_special_prices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE room_special_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view room special prices"
  ON room_special_prices FOR SELECT
  USING (true);

CREATE POLICY "Hosts can manage special prices of own rooms"
  ON room_special_prices FOR ALL
  USING (room_id IN (
    SELECT r.id FROM rooms r
    JOIN homestays h ON r.homestay_id = h.id
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));

-- ************************************************************
-- 065: Demand Events (anonymous guest funnel on /[slug])
-- Kept apart from history_logs on purpose: that is an append-only audit
-- trail, this is analytics pruned at 180 days. No INSERT policy on
-- purpose: every write goes through POST /api/demand on the service role,
-- which rate-limits first. See 065_demand_events.sql for the rationale.
-- ************************************************************
CREATE TABLE demand_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homestay_id UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL,
  event_type  TEXT NOT NULL CHECK (event_type IN (
                'page_view',
                'calendar_view',
                'dates_selected',
                'dates_unavailable',
                'checkout_step',
                'slip_uploaded',
                'booking_submitted')),
  check_in    DATE,
  check_out   DATE,
  nights      SMALLINT,
  step        TEXT CHECK (step IS NULL OR step IN ('dates', 'details', 'payment')),
  device      TEXT CHECK (device IS NULL OR device IN ('mobile', 'desktop')),
  locale      TEXT,
  data        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE demand_events IS
  'Anonymous guest funnel + date-demand events from the public /[slug] page. Written only by POST /api/demand via the service-role client. Pruned at 180 days by the daily billing cron.';
COMMENT ON COLUMN demand_events.session_id IS
  'Random UUID from sessionStorage, one per visit. Not a user id and not stable across visits — used only to stitch a funnel and to count sessions instead of raw events.';
COMMENT ON COLUMN demand_events.check_in IS
  'Set on dates_selected / dates_unavailable / booking_submitted. THE demand signal: which nights guests asked for, whether or not we could sell them.';
COMMENT ON COLUMN demand_events.step IS
  'checkout_step only. Recorded when the guest ADVANCES OUT of a step, not on arrival: dates = finished step 1, details = finished step 2, payment = reached step 3 (holds acquired, QR shown). The gap between details and payment is bookings lost to a hold conflict.';
COMMENT ON COLUMN demand_events.data IS
  'Extension point. Any future signal that does not warrant a column (per-house engagement, referrer, promo) goes here rather than in a migration.';

CREATE INDEX idx_demand_events_homestay_created ON demand_events(homestay_id, created_at DESC);
CREATE INDEX idx_demand_events_homestay_type    ON demand_events(homestay_id, event_type, created_at DESC);
CREATE INDEX idx_demand_events_checkin          ON demand_events(homestay_id, check_in) WHERE check_in IS NOT NULL;
CREATE INDEX idx_demand_events_session          ON demand_events(session_id, created_at);

ALTER TABLE demand_events ENABLE ROW LEVEL SECURITY;

-- SELECT only, and only your own homestay. No INSERT/UPDATE/DELETE policy:
-- the beacon route and the retention prune both use the service-role client,
-- which bypasses RLS.
CREATE POLICY "Hosts can view demand events for own homestays"
  ON demand_events FOR SELECT
  USING (homestay_id IN (
    SELECT h.id FROM homestays h
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()));

-- Aggregation in Postgres: the funnel needs COUNT(DISTINCT session_id).
-- SECURITY INVOKER (the default) on purpose: RLS on demand_events applies
-- to the caller, so a host calling this from the browser with
-- p_homestay_id => NULL sees only their own rows, never the platform's.
CREATE OR REPLACE FUNCTION get_demand_stats(
  p_homestay_id UUID DEFAULT NULL,
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH scoped AS (
  SELECT session_id, event_type, step, check_in
  FROM demand_events
  WHERE created_at >= NOW() - (GREATEST(p_days, 1) || ' days')::INTERVAL
    AND (p_homestay_id IS NULL OR homestay_id = p_homestay_id)
),
-- checkout_step fans out into three stages; dates_unavailable is a side metric,
-- not a stage guests pass through, so it is excluded here.
staged AS (
  SELECT session_id,
         CASE WHEN event_type = 'checkout_step' THEN 'step_' || step ELSE event_type END AS stage
  FROM scoped
  WHERE event_type <> 'dates_unavailable'
),
-- LEFT JOIN against the stage list so a stage nobody reached still reports 0
-- rather than vanishing from the funnel.
funnel AS (
  SELECT s.stage, s.ord, COUNT(DISTINCT st.session_id) AS sessions
  FROM unnest(ARRAY[
         'page_view', 'calendar_view', 'dates_selected', 'step_dates',
         'step_details', 'step_payment', 'slip_uploaded', 'booking_submitted'
       ]) WITH ORDINALITY AS s(stage, ord)
  LEFT JOIN staged st ON st.stage = s.stage
  GROUP BY s.stage, s.ord
),
top_dates AS (
  SELECT check_in AS d,
         COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'dates_selected')    AS requested,
         COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'dates_unavailable') AS unavailable
  FROM scoped
  WHERE check_in IS NOT NULL
    AND event_type IN ('dates_selected', 'dates_unavailable')
  GROUP BY check_in
  ORDER BY 2 DESC, 1 ASC
  LIMIT 10
)
SELECT jsonb_build_object(
  'funnel', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('stage', stage, 'sessions', sessions) ORDER BY ord)
    FROM funnel), '[]'::jsonb),
  'top_dates', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('date', d, 'requested', requested, 'unavailable', unavailable)
                     ORDER BY requested DESC, d ASC)
    FROM top_dates), '[]'::jsonb),
  'totals', jsonb_build_object(
    'sessions',    (SELECT COUNT(DISTINCT session_id) FROM scoped WHERE event_type = 'page_view'),
    'conversions', (SELECT COUNT(DISTINCT session_id) FROM scoped WHERE event_type = 'booking_submitted'),
    'lost_demand', (SELECT COUNT(DISTINCT session_id) FROM scoped WHERE event_type = 'dates_unavailable')
  )
);
$$;

-- Revoke from PUBLIC first: a bare REVOKE ... FROM anon leaves the implicit
-- PUBLIC grant in place. Matches 048_admin_revenue_rpc.sql.
REVOKE ALL ON FUNCTION public.get_demand_stats(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_demand_stats(UUID, INT) TO authenticated, service_role;

COMMENT ON FUNCTION get_demand_stats(UUID, INT) IS
  'Funnel + top requested dates for one homestay, or the whole platform when p_homestay_id is NULL. Counts are DISTINCT sessions, never raw events.';

-- Retention. Capped so that shortening the window later can never turn one
-- nightly run into a table-wide delete. Called from the daily billing cron.
CREATE OR REPLACE FUNCTION prune_demand_events(
  p_days INT DEFAULT 180,
  p_limit INT DEFAULT 10000
)
RETURNS INT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  WITH doomed AS (
    SELECT id FROM demand_events
    WHERE created_at < NOW() - (GREATEST(p_days, 1) || ' days')::INTERVAL
    LIMIT GREATEST(p_limit, 1)
  )
  DELETE FROM demand_events d USING doomed WHERE d.id = doomed.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_demand_events(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_demand_events(INT, INT) TO service_role;

-- ************************************************************
-- 066 + 070: activate_fixed_rate_plan
-- The ONLY writer of a Fixed Rate term and the invoice behind it, in one
-- transaction: 'paid' for activation, renewal and admin Set Plan;
-- 'pending' for the cron's renewals and lapsed-term billing. Callers own
-- the money math; this prices nothing. (070 dropped 066's 11-arg version.)
-- ************************************************************
CREATE OR REPLACE FUNCTION activate_fixed_rate_plan(
  p_host_id UUID,
  p_amount INTEGER,
  p_period_start DATE,
  p_period_end DATE,
  p_term_months INTEGER,
  p_discount_pct NUMERIC,
  p_slip_url TEXT DEFAULT NULL,
  p_slip_hash TEXT DEFAULT NULL,
  p_slip_trans_ref TEXT DEFAULT NULL,
  p_easyslip_response JSONB DEFAULT NULL,
  p_created_by TEXT DEFAULT 'host',
  p_status TEXT DEFAULT 'paid',
  p_due_date DATE DEFAULT NULL
)
RETURNS TABLE(invoice_id UUID)
SET search_path = public
AS $$
DECLARE
  v_invoice_id UUID;
BEGIN
  IF p_status NOT IN ('paid', 'pending') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  -- Same lock the wallet RPCs take, so a concurrent commission deduction or
  -- top-up for this host serialises against the plan change.
  PERFORM pg_advisory_xact_lock(hashtext(p_host_id::text));

  IF p_status = 'paid' AND EXISTS (
    SELECT 1 FROM hosts
    WHERE id = p_host_id
      AND plan_type = 'fixed_rate'
      AND fixed_rate_term_ends_at >= p_period_start
  ) THEN
    RAISE EXCEPTION 'ALREADY_ACTIVE';
  END IF;

  IF p_status = 'pending' THEN
    SELECT i.id INTO v_invoice_id
    FROM invoices i
    WHERE i.host_id = p_host_id
      AND i.period_start = p_period_start
      AND i.period_end = p_period_end
    LIMIT 1;

    IF FOUND THEN
      RETURN QUERY SELECT v_invoice_id;
      RETURN;
    END IF;
  END IF;

  INSERT INTO invoices (
    host_id, amount, period_start, period_end, status, paid_at, due_date,
    term_months, discount_pct,
    slip_url, slip_hash, slip_trans_ref, easyslip_verified, easyslip_response,
    created_by, updated_by
  )
  VALUES (
    p_host_id, p_amount, p_period_start, p_period_end, p_status,
    CASE WHEN p_status = 'paid' THEN now() END,
    COALESCE(p_due_date, p_period_start),
    p_term_months, p_discount_pct,
    p_slip_url, p_slip_hash, p_slip_trans_ref, p_slip_hash IS NOT NULL, p_easyslip_response,
    p_created_by, p_created_by
  )
  RETURNING id INTO v_invoice_id;

  UPDATE hosts
  SET plan_type                  = 'fixed_rate',
      fixed_rate_term_months     = p_term_months,
      fixed_rate_term_started_at = p_period_start,
      fixed_rate_term_ends_at    = p_period_end,
      -- A started term supersedes anything that was scheduled, and clears the
      -- free trial the host may have been on.
      plan_pending_type          = NULL,
      plan_pending_effective_at  = NULL,
      plan_pending_term_months   = NULL,
      plan_free_expires_at       = NULL,
      updated_by                 = p_created_by
  WHERE id = p_host_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOST_NOT_FOUND';
  END IF;

  RETURN QUERY SELECT v_invoice_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION activate_fixed_rate_plan(UUID, INTEGER, DATE, DATE, INTEGER, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, DATE) IS
  'Atomically start a Fixed Rate term and write the invoice behind it. Called by POST /api/host/plan/activate (paid, verified slip), the billing cron (pending: renewals and lapsed-term billing) and the admin Set Plan route (paid, settled offline). Callers compute amount and period. Raises ALREADY_ACTIVE for a paid term over a running one, HOST_NOT_FOUND for a missing host; a pending call for a period already invoiced returns that invoice and writes nothing; a duplicate slip_trans_ref raises unique_violation.';

-- Revoke from PUBLIC first: a bare REVOKE ... FROM anon leaves the implicit
-- PUBLIC grant in place. Matches 066_plan_activation.sql.
REVOKE ALL ON FUNCTION public.activate_fixed_rate_plan(UUID, INTEGER, DATE, DATE, INTEGER, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_fixed_rate_plan(UUID, INTEGER, DATE, DATE, INTEGER, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, DATE) TO service_role;

-- ************************************************************
-- 067: Booking Drafts (resume an abandoned booking with phone + email)
-- The highest-PII, lowest-value data in the product: RLS on with ZERO
-- policies (service-role only), a per-host TTL stamped at write time
-- (hosts.booking_draft_hours), a nightly capped sweep and a hard 7-day
-- ceiling. See 067_booking_drafts.sql for why this is not booking_holds.
-- ************************************************************
CREATE TABLE booking_drafts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homestay_id UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,
  guest_phone TEXT NOT NULL CHECK (guest_phone ~ '^[0-9]{10}$'),
  guest_email TEXT NOT NULL,
  check_in    DATE NOT NULL,
  check_out   DATE NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  TEXT NOT NULL DEFAULT 'system',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT NOT NULL DEFAULT 'system',
  CONSTRAINT booking_drafts_dates_ordered CHECK (check_out > check_in)
);

COMMENT ON TABLE booking_drafts IS
  'One unfinished booking per (homestay, phone, email). Written by POST /api/bookings/draft at the step 2 -> 3 transition, read by POST /api/bookings/draft/lookup, deleted on successful booking and by the nightly sweep. Never a source of price or availability truth.';
COMMENT ON COLUMN booking_drafts.guest_phone IS
  'Digits-only, 10 chars. Normalised server-side with the same rule as sanitizePhoneInput() in src/lib/utils.ts, which is also what booking_holds.guest_phone stores -- the two must match exactly or 049 same-phone takeover will not fire on restore.';
COMMENT ON COLUMN booking_drafts.guest_email IS
  'Trimmed + lowercased. Half of the lookup key: phone alone is guessable, phone plus the matching email is not. Matches the .toLowerCase() comparison convention in pay-balance and checkin.';
COMMENT ON COLUMN booking_drafts.payload IS
  'The rest of the form snapshot (guest name/province/note, cart lines, promo CODE, payment option, subtotal at save). Deliberately schemaless: the shape follows the booking form, which changes often, and every extra PII column is another thing to remember to purge. Versioned by payload->>''v'', typed in src/lib/booking-draft.ts.';
COMMENT ON COLUMN booking_drafts.expires_at IS
  'Stamped at write time from the host''s booking_draft_hours. Stamping rather than joining hosts at read/purge time keeps the lookup filter and the sweep predicate identical, so "invisible" and "deleted" can never disagree.';

-- The lookup predicate AND the ON CONFLICT target -- identical by design.
CREATE UNIQUE INDEX idx_booking_drafts_lookup
  ON booking_drafts(homestay_id, guest_phone, guest_email);
CREATE INDEX idx_booking_drafts_expires_at ON booking_drafts(expires_at);

-- RLS on, ZERO policies: every read, write and purge uses the service role.
ALTER TABLE booking_drafts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_booking_drafts_updated_at
  BEFORE UPDATE ON booking_drafts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Lowering hosts.booking_draft_hours applies retroactively; raising it does not.
-- SECURITY DEFINER is load-bearing: the dashboard writes booking_draft_hours with
-- the BROWSER client (as authenticated), and booking_drafts has zero policies, so
-- a SECURITY INVOKER trigger would delete nothing and still report success.
CREATE OR REPLACE FUNCTION clamp_booking_drafts_on_host_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.booking_draft_hours IS NOT DISTINCT FROM OLD.booking_draft_hours THEN
    RETURN NEW;
  END IF;

  IF NEW.booking_draft_hours <= 0 THEN
    DELETE FROM booking_drafts d
    USING homestays h
    WHERE d.homestay_id = h.id AND h.host_id = NEW.id;
  ELSE
    -- LEAST plus the WHERE guard: shortening the window shortens existing
    -- drafts, lengthening it never resurrects PII the guest was promised a
    -- shorter life for.
    UPDATE booking_drafts d
    SET expires_at = LEAST(d.expires_at,
                           d.created_at + make_interval(hours => NEW.booking_draft_hours))
    FROM homestays h
    WHERE d.homestay_id = h.id
      AND h.host_id = NEW.id
      AND d.expires_at > d.created_at + make_interval(hours => NEW.booking_draft_hours);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clamp_booking_drafts_on_host_change() FROM PUBLIC;

-- AFTER UPDATE OF fires whenever the column is MENTIONED, even if unchanged,
-- and the dashboard sends it on every homestay save -- hence the early return.
CREATE TRIGGER trg_hosts_clamp_booking_drafts
  AFTER UPDATE OF booking_draft_hours ON hosts
  FOR EACH ROW EXECUTE FUNCTION clamp_booking_drafts_on_host_change();

-- Retention sweep, capped per run like prune_demand_events (065). The
-- created_at ceiling is a PDPA cap that holds even if a writer stamps a bad
-- expires_at.
CREATE OR REPLACE FUNCTION prune_booking_drafts(p_limit INT DEFAULT 5000)
RETURNS INT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  WITH doomed AS (
    SELECT id FROM booking_drafts
    WHERE expires_at < NOW()
       OR created_at < NOW() - INTERVAL '7 days'
    LIMIT GREATEST(p_limit, 1)
  )
  DELETE FROM booking_drafts d USING doomed WHERE d.id = doomed.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_booking_drafts(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_booking_drafts(INT) TO service_role;

COMMENT ON FUNCTION prune_booking_drafts(INT) IS
  'Deletes expired drafts, capped per run. Called from the daily billing cron. Correctness does NOT depend on this running: every read filters expires_at > NOW(), so a late sweep costs retention, never a wrong answer.';

-- ************************************************************
-- 068: Booking Attachments (host-private chat screenshots per booking)
-- Host-private: guests match no policy, admins get no surface. Writes are
-- service-role only through POST /api/bookings/attachments and
-- DELETE /api/bookings/attachments/[id]. ON DELETE CASCADE clears rows
-- but NOT the storage objects: see 068_booking_attachments.sql.
-- ************************************************************
CREATE TABLE booking_attachments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id   UUID NOT NULL REFERENCES bookings(id)  ON DELETE CASCADE,
  homestay_id  UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type    TEXT NOT NULL,
  byte_size    INTEGER NOT NULL CHECK (byte_size > 0),
  -- Immutable rows (upload or delete, never edit): no updated_at/updated_by
  -- and no set_updated_at() trigger, deliberately.
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   TEXT NOT NULL DEFAULT 'host',
  CONSTRAINT booking_attachments_mime_allowed
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'))
);

COMMENT ON TABLE booking_attachments IS
  'Host-private images attached to a booking (chat screenshots of agreed special requests). Written only by POST /api/bookings/attachments, deleted only by DELETE /api/bookings/attachments/[id]. Never shown to guests or admins. Text belongs in bookings.notes.';
COMMENT ON COLUMN booking_attachments.storage_path IS
  'Plain path in the booking-attachments bucket: {homestay_id}/{booking_id}/{id}.{ext}. Never a signed URL -- unlike bookings.payment_slip_url, which carries legacy signed URLs and needs extractStoragePath() to untangle. UNIQUE so a retried upload can never double-register one object.';
COMMENT ON COLUMN booking_attachments.homestay_id IS
  'Denormalised from bookings on purpose: it is the FIRST path segment, so the table policy below and the storage.objects policy can use the identical ownership predicate. Two policies that must agree should not be written two different ways. Kept honest by a single writer -- the POST route derives it from the booking it just loaded and verified.';
COMMENT ON COLUMN booking_attachments.byte_size IS
  'Size as stored, i.e. AFTER the client-side compressImage() pass. Recorded so a future storage sweep can reconcile bytes without listing the bucket.';

CREATE INDEX idx_booking_attachments_booking_created
  ON booking_attachments (booking_id, created_at);
CREATE INDEX idx_booking_attachments_homestay
  ON booking_attachments (homestay_id);

ALTER TABLE booking_attachments ENABLE ROW LEVEL SECURITY;

-- Reads come straight from the browser client, so this policy is load-bearing.
-- DELIBERATELY NO INSERT / UPDATE / DELETE POLICY.
CREATE POLICY "Hosts can view attachments for own homestays"
  ON booking_attachments FOR SELECT
  USING (
    homestay_id IN (
      SELECT h.id FROM homestays h
      JOIN hosts ho ON h.host_id = ho.id
      WHERE ho.user_id = auth.uid()
    )
  );

-- Private bucket with a size cap and MIME allowlist. ON CONFLICT DO UPDATE so
-- a hand-created bucket converges on this config instead of staying open.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'booking-attachments',
  'booking-attachments',
  FALSE,
  5242880,  -- 5 MiB. The API route caps at 4 MiB (MAX_ATTACHMENT_BYTES in
            -- src/lib/booking-attachments.ts); this is the floor under any
            -- future direct-upload path.
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage SELECT scoped by the first path segment. h.id::text on the inner
-- side: a ::uuid cast on a non-uuid folder name would raise inside the policy
-- and turn a 403 into a 500. No INSERT / UPDATE / DELETE policy: uploads and
-- removals run on the service role.
CREATE POLICY "Hosts can read own booking attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'booking-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT h.id::text FROM homestays h
      JOIN hosts ho ON h.host_id = ho.id
      WHERE ho.user_id = auth.uid()
    )
  );

-- ************************************************************
-- 071: adjust_wallet
-- Admin wallet adjustment under the per-host lock, with its ledger row and
-- the same wallet_negative_since rule as topup_wallet and
-- deduct_wallet_commission. (071's deduct_wallet_commission change is in
-- the 038 section above.)
-- ************************************************************
CREATE OR REPLACE FUNCTION adjust_wallet(
  p_host_id UUID,
  p_amount INTEGER,
  p_description TEXT,
  p_created_by TEXT
)
RETURNS TABLE(new_balance INTEGER, transaction_id UUID) AS $$
DECLARE
  v_new_balance INTEGER;
  v_txn_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_host_id::text));

  UPDATE hosts
  SET wallet_balance = wallet_balance + p_amount,
      wallet_negative_since = CASE
        WHEN (wallet_balance + p_amount) >= 0 THEN NULL
        WHEN wallet_negative_since IS NULL THEN now()
        ELSE wallet_negative_since
      END,
      updated_by = p_created_by
  WHERE id = p_host_id
  RETURNING wallet_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOST_NOT_FOUND';
  END IF;

  INSERT INTO wallet_transactions (host_id, type, amount, balance_after, description, status, created_by)
  VALUES (p_host_id, 'adjustment', p_amount, v_new_balance, p_description, 'verified', p_created_by)
  RETURNING id INTO v_txn_id;

  RETURN QUERY SELECT v_new_balance, v_txn_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION adjust_wallet(UUID, INTEGER, TEXT, TEXT) IS
  'Atomically apply an admin wallet adjustment (positive credits, negative debits) with its ledger row, maintaining wallet_negative_since. Called only by POST /api/admin/hosts/[id]/wallet. Raises HOST_NOT_FOUND.';

REVOKE ALL ON FUNCTION public.adjust_wallet(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_wallet(UUID, INTEGER, TEXT, TEXT) TO service_role;
