-- ============================================================================
-- 068: Booking attachments -- host-private chat screenshots pinned to a booking.
--
-- THE PROBLEM
-- Hosts agree special requests with guests over LINE: a late check-in, an extra
-- mattress, a dietary note, a discount someone promised. Weeks and dozens of
-- bookings later the guest arrives and nobody remembers what was said, because
-- the only record is a chat thread in an app that knows nothing about the
-- booking. bookings.notes stays the TEXT place; this is the EVIDENCE place.
--
-- WHY NOT THE payment-slips BUCKET
-- Its SELECT policy (000_full_schema.sql:515) is
--   bucket_id = 'payment-slips' AND auth.role() = 'authenticated'
-- with no ownership predicate -- ANY logged-in host can read ANY other host's
-- objects there. Tolerable for a slip the payer already saw. The exact opposite
-- of what is needed for private host<->guest correspondence.
--
-- WHY NOT AN ARRAY COLUMN ON bookings
-- homestays.gallery and rooms.images are TEXT[], but the count badge needs
-- counts for a page of 20 bookings in ONE query, and an array column would ride
-- along in every bookings select("*") on the busiest page in the dashboard.
--
-- VISIBILITY
-- Host-private. Guests hold the anon key and match no policy. Admins get no
-- policy and no surface. State it plainly: service_role bypasses RLS, so
-- "admins cannot see these" is enforced by NOT BUILDING an admin surface, not
-- by the database.
-- ============================================================================

-- 1) The table.
--
-- uuid_generate_v4() rather than 029's gen_random_uuid(): the former is what
-- this schema actually standardised on (37 uses vs 6), including 059, 064, 065
-- and 067.
CREATE TABLE booking_attachments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id   UUID NOT NULL REFERENCES bookings(id)  ON DELETE CASCADE,
  homestay_id  UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type    TEXT NOT NULL,
  byte_size    INTEGER NOT NULL CHECK (byte_size > 0),
  -- No updated_at / updated_by and no set_updated_at() trigger, deliberately
  -- departing from 027's audit quartet: these rows are immutable. A host
  -- uploads or deletes, never edits. A trigger that can never fire is clutter
  -- that reads like a promise the schema does not keep.
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

-- Leading booking_id serves both .in("booking_id", ids) for the count badges
-- and the ordered per-booking grid, in one index. Same shape as 029's
-- idx_date_change_booking, plus the created_at tiebreak the grid orders on.
CREATE INDEX idx_booking_attachments_booking_created
  ON booking_attachments (booking_id, created_at);
-- Backs the homestay_id side of the RLS predicate below. Not speculative: every
-- SELECT a host makes goes through it.
CREATE INDEX idx_booking_attachments_homestay
  ON booking_attachments (homestay_id);

-- 2) RLS: a SELECT policy and nothing else.
--
-- Reads come straight from the browser client (the dashboard already reads
-- bookings that way), so this policy is load-bearing. Same shape as the
-- bookings host policy at 000_full_schema.sql:384.
ALTER TABLE booking_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts can view attachments for own homestays"
  ON booking_attachments FOR SELECT
  USING (
    homestay_id IN (
      SELECT h.id FROM homestays h
      JOIN hosts ho ON h.host_id = ho.id
      WHERE ho.user_id = auth.uid()
    )
  );

-- DELIBERATELY NO INSERT / UPDATE / DELETE POLICY, following 067's stance.
-- Writes are service-role only, through the two API routes. A browser-side
-- insert would skip the per-booking cap, the MIME check and the storage upload
-- itself, leaving rows that point at nothing -- which is the failure this whole
-- design is arranged to prevent.

-- ============================================================
-- STORAGE
-- ============================================================

-- 3) The bucket. First one in this project to set file_size_limit and
-- allowed_mime_types -- 000 and 035 set neither, so every existing bucket will
-- accept a 2GB video.
--
-- ON CONFLICT DO UPDATE, not 000/035's DO NOTHING: if someone hand-creates this
-- bucket in the Supabase dashboard before the migration runs, DO NOTHING would
-- silently leave it unlimited and possibly public. Re-running must converge on
-- the intended config, not defer to whatever is already there.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'booking-attachments',
  'booking-attachments',
  FALSE,
  5242880,  -- 5 MiB. The API route caps at 4 MiB (MAX_ATTACHMENT_BYTES in
            -- src/lib/booking-attachments.ts), so this never fires through the
            -- app. It is the floor under any future direct-upload path and it
            -- documents the intent where an operator will actually look.
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 4) Storage SELECT, scoped by the first path segment.
--
-- h.id::text on the INNER side rather than (storage.foldername(name))[1]::uuid
-- on the outer side: a uuid cast RAISES inside a policy when the folder name is
-- not a uuid, and a policy that raises turns a 403 into a 500. Text comparison
-- cannot raise.
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

-- DELIBERATELY NO INSERT / UPDATE / DELETE POLICY on storage.objects for this
-- bucket. Uploads and removals run through createServiceRoleClient(), which
-- bypasses storage RLS. Granting authenticated INSERT here would reopen the
-- untransacted two-phase write (upload, then insert, with no way to undo the
-- upload) that the API route exists to compensate for.
--
-- Checked: every other storage policy in this schema is scoped to a specific
-- bucket_id (000_full_schema.sql:487-530, 035_review_enhancements.sql:24-29),
-- so nothing grants blanket access that could reach this bucket by accident.

-- ============================================================
-- RETENTION -- READ THIS BEFORE ASSUMING THE CASCADE IS ENOUGH
-- ============================================================
-- ON DELETE CASCADE clears ROWS when a booking or homestay goes, but Postgres
-- cannot reach into storage: THE OBJECTS SURVIVE THE CASCADE. Today the only
-- path that frees an object is an explicit host delete, which removes the
-- object first and the row second (see the DELETE route).
--
-- The honest fix is a prune_booking_attachments() in the style of 067's
-- prune_booking_drafts, paired with a storage sweep in the daily billing cron.
-- It is deliberately not in this migration: a sweep that deletes storage
-- objects wants its own change, its own tests and its own dry run.
