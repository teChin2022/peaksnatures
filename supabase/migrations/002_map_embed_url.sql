-- Replace latitude/longitude with map_embed_url for embedded Google Maps
ALTER TABLE homestays ADD COLUMN map_embed_url TEXT;
ALTER TABLE homestays DROP COLUMN IF EXISTS latitude;
ALTER TABLE homestays DROP COLUMN IF EXISTS longitude;
