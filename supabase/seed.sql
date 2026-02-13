-- PeaksNature Seed Data
-- Run after migrations to populate sample data for development

-- NOTE: Replace 'AUTH_USER_ID' with an actual auth.users UUID after creating a test user

-- Sample Host (you'll need to update user_id after creating auth user)
INSERT INTO hosts (id, user_id, name, email, phone, line_id, promptpay_id, line_user_id) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'Somchai Peaks', 'somchai@peaksnature.com', '081-234-5678', '@somchai_peaks', '0812345678', NULL);

-- Sample Homestays
INSERT INTO homestays (id, host_id, slug, name, description, tagline, location, latitude, longitude, price_per_night, max_guests, amenities, hero_image_url, gallery, theme_color) VALUES
(
  'b1b2c3d4-0000-0000-0000-000000000001',
  'a1b2c3d4-0000-0000-0000-000000000001',
  'mountain-breeze-chiangmai',
  'Mountain Breeze Homestay',
  'Nestled in the lush mountains of Chiang Mai, Mountain Breeze offers a serene escape surrounded by nature. Wake up to stunning sunrise views over misty valleys, enjoy fresh mountain air, and experience authentic Northern Thai hospitality. Perfect for nature lovers seeking tranquility away from the city.',
  'Where mountains meet the sky',
  'Chiang Mai, Thailand',
  18.7883,
  98.9853,
  1500,
  6,
  '["WiFi", "Parking", "Kitchen", "Mountain View", "Garden", "BBQ", "Hiking Trails", "Waterfall Nearby"]',
  'https://images.unsplash.com/photo-1587061949409-02df41d5e562?w=1200',
  '["https://images.unsplash.com/photo-1587061949409-02df41d5e562?w=800", "https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=800", "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800", "https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=800"]',
  '#16a34a'
),
(
  'b1b2c3d4-0000-0000-0000-000000000002',
  'a1b2c3d4-0000-0000-0000-000000000001',
  'riverside-retreat-kanchanaburi',
  'Riverside Retreat',
  'A peaceful riverside homestay in Kanchanaburi where the River Kwai flows gently past your doorstep. Float on bamboo rafts, explore nearby waterfalls, and enjoy spectacular sunsets over the river. Our traditional Thai wooden house provides an authentic experience with modern comforts.',
  'Life flows gently by the river',
  'Kanchanaburi, Thailand',
  14.0227,
  99.5328,
  1200,
  4,
  '["WiFi", "River View", "Kayaking", "Fishing", "Restaurant", "Parking", "Swimming"]',
  'https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=1200',
  '["https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=800", "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800", "https://images.unsplash.com/photo-1587061949409-02df41d5e562?w=800"]',
  '#0284c7'
),
(
  'b1b2c3d4-0000-0000-0000-000000000003',
  'a1b2c3d4-0000-0000-0000-000000000001',
  'forest-hideaway-khaoyai',
  'Forest Hideaway',
  'Surrounded by the ancient forests of Khao Yai, this cozy hideaway puts you right at the edge of one of Thailand''s most beautiful national parks. Spot wild elephants, hornbills, and gibbons from your terrace. Fall asleep to the symphony of the forest and wake to birdsong.',
  'Your secret forest sanctuary',
  'Khao Yai, Nakhon Ratchasima',
  14.4415,
  101.3700,
  1800,
  4,
  '["WiFi", "Forest View", "Bird Watching", "National Park Access", "Telescope", "Fireplace", "Library"]',
  'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200',
  '["https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800", "https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=800", "https://images.unsplash.com/photo-1587061949409-02df41d5e562?w=800"]',
  '#854d0e'
);

-- Sample Rooms
INSERT INTO rooms (id, homestay_id, name, description, price_per_night, max_guests, quantity, images) VALUES
-- Mountain Breeze rooms
('c1b2c3d4-0000-0000-0000-000000000001', 'b1b2c3d4-0000-0000-0000-000000000001', 'Mountain View Room', 'Spacious room with panoramic mountain views and private balcony', 1500, 2, 3, '["https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=600"]'),
('c1b2c3d4-0000-0000-0000-000000000002', 'b1b2c3d4-0000-0000-0000-000000000001', 'Garden Cottage', 'Cozy standalone cottage surrounded by tropical garden', 1200, 2, 2, '["https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600"]'),
('c1b2c3d4-0000-0000-0000-000000000003', 'b1b2c3d4-0000-0000-0000-000000000001', 'Family Suite', 'Large suite with separate living area, perfect for families', 2500, 4, 1, '["https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=600"]'),
-- Riverside Retreat rooms
('c1b2c3d4-0000-0000-0000-000000000004', 'b1b2c3d4-0000-0000-0000-000000000002', 'River View Bungalow', 'Traditional Thai bungalow right on the riverbank', 1200, 2, 4, '["https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=600"]'),
('c1b2c3d4-0000-0000-0000-000000000005', 'b1b2c3d4-0000-0000-0000-000000000002', 'Floating Raft Room', 'Unique floating room on the river with glass floor panels', 1800, 2, 2, '["https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600"]'),
-- Forest Hideaway rooms
('c1b2c3d4-0000-0000-0000-000000000006', 'b1b2c3d4-0000-0000-0000-000000000003', 'Treehouse Suite', 'Elevated treehouse with forest canopy views', 1800, 2, 2, '["https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600"]'),
('c1b2c3d4-0000-0000-0000-000000000007', 'b1b2c3d4-0000-0000-0000-000000000003', 'Forest Cabin', 'Rustic cabin with modern amenities and fireplace', 2200, 3, 2, '["https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=600"]');

-- Sample Blocked Dates (for Mountain Breeze)
INSERT INTO blocked_dates (homestay_id, date, reason) VALUES
('b1b2c3d4-0000-0000-0000-000000000001', '2026-03-01', 'Maintenance'),
('b1b2c3d4-0000-0000-0000-000000000001', '2026-03-02', 'Maintenance'),
('b1b2c3d4-0000-0000-0000-000000000001', '2026-04-13', 'Songkran - Fully Booked'),
('b1b2c3d4-0000-0000-0000-000000000001', '2026-04-14', 'Songkran - Fully Booked'),
('b1b2c3d4-0000-0000-0000-000000000001', '2026-04-15', 'Songkran - Fully Booked');
