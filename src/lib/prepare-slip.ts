import { compressImage } from "@/lib/compress-image";

/**
 * Below this, a slip is already cheap to send and re-encoding buys nothing —
 * it only risks fidelity on the one image the whole booking depends on.
 */
export const SLIP_COMPRESS_THRESHOLD_BYTES = 600 * 1024;

/**
 * Deliberately generous. A slip's payload is its QR code and reference
 * numbers, and EasySlip has to read both — this is not a photo where softness
 * is invisible. The win comes from phone screenshots being 2-4MB of PNG, not
 * from encoding hard.
 */
export const SLIP_MAX_DIMENSION = 2000;
export const SLIP_QUALITY = 0.92;

/**
 * Shrink a payment slip before it goes to /api/verify-slip.
 *
 * Guests on this platform book rural homestays, frequently on mobile data,
 * where an untouched phone screenshot is several seconds of upload before the
 * server does any work at all. This is the largest single cost in the booking
 * flow.
 *
 * Two deliberate constraints:
 *  - JPEG, never WebP. The consumer is EasySlip, a third party that has only
 *    ever been sent JPEG/PNG. A live booking is the wrong place to find out
 *    whether it decodes WebP.
 *  - Never throws. HEIC with no decoder, a canvas the browser refuses,
 *    anything at all — the guest's original file goes instead. A compression
 *    failure must not cost someone a booking.
 */
export async function prepareSlip(file: File): Promise<File> {
  if (file.size <= SLIP_COMPRESS_THRESHOLD_BYTES) return file;

  try {
    return await compressImage(file, {
      maxDimension: SLIP_MAX_DIMENSION,
      quality: SLIP_QUALITY,
      type: "image/jpeg",
    });
  } catch (err) {
    console.error("[Slip] compression failed, sending the original:", err);
    return file;
  }
}
