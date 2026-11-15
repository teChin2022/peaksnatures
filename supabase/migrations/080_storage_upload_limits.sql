-- ============================================================================
-- 080: Size and type limits on the storage buckets that had none, and no
-- anonymous uploads to payment-slips.
--
-- Security audit 2026-11-15, F-18. 001 and 035 created homestay-photos,
-- payment-slips and review-photos with no file_size_limit and no
-- allowed_mime_types (068 notes it: "every existing bucket will accept a 2GB
-- video"). review-photos is public and takes anonymous uploads, so anyone
-- with the anon key could host any file (HTML, SVG, executables) under this
-- project's storage domain. payment-slips also took anonymous uploads,
-- which no browser code makes: every slip is uploaded by a route on the
-- service role (verify-slip, slip-upload, the platform payment routes).
--
-- Types: what reaches each bucket today. Browser uploads go through
-- compressImage() first (WebP or JPEG; PNG where a browser cannot encode
-- WebP); the slip routes accept JPEG, PNG, WebP and HEIC/HEIF. No SVG
-- anywhere. Limits apply to new uploads only; existing files are untouched.
-- Bucket limits bind the service role too.
--
-- Not changed: review-photos keeps its anonymous INSERT (guests upload review
-- photos from the browser), now images only and at most 10 MB.
--
-- Rollback:
--   UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL
--   WHERE id IN ('homestay-photos', 'review-photos', 'payment-slips');
--   CREATE POLICY "Anyone can upload payment slips"
--     ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'payment-slips');
--
-- Check after applying:
--   SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets ORDER BY id;
--   SELECT policyname FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'INSERT'
--     AND coalesce(with_check, '') LIKE '%payment-slips%';   -- expect no rows
-- ============================================================================

UPDATE storage.buckets
SET file_size_limit = 10485760, -- 10 MiB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif']
WHERE id IN ('homestay-photos', 'review-photos');

UPDATE storage.buckets
SET file_size_limit = 5242880, -- 5 MiB: slip-upload's own cap; verify-slip caps at 4 MiB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
WHERE id = 'payment-slips';

DROP POLICY IF EXISTS "Anyone can upload payment slips" ON storage.objects;
