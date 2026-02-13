-- Rename guest_line_id to guest_province in bookings table
ALTER TABLE bookings RENAME COLUMN guest_line_id TO guest_province;
