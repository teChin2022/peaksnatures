-- Remove line_id from hosts table (LINE messaging uses line_user_id + line_channel_access_token instead)
ALTER TABLE hosts DROP COLUMN IF EXISTS line_id;
