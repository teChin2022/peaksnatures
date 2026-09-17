/**
 * Booking attachments: host-private chat screenshots pinned to a booking.
 *
 * Deliberately import-free, like wallet-thresholds.ts and billing-dates.ts.
 * The uploader component is `"use client"` and the API routes are server-side;
 * both need the same limits, the same path scheme and — critically — the same
 * validation predicate, so neither can be the one that owns it.
 *
 * Everything here is pure. That is not incidental: `vitest.config.mts` scopes
 * coverage to `src/lib/**` and `src/app/api/**`, so anything left inside a
 * page component is untestable in this project by construction. The arithmetic
 * and the string handling live here for exactly that reason.
 */

export const ATTACHMENTS_BUCKET = "booking-attachments";

/**
 * Per-booking ceiling. The homestay gallery allows 15 and a review 5; ten is
 * the number of chat screenshots a special-requests conversation actually
 * produces, and it bounds the signed-URL batch the detail dialog mints.
 */
export const MAX_ATTACHMENTS_PER_BOOKING = 10;

/**
 * Matches MAX_FILE_SIZE in easyslip.ts so a host never meets two different
 * size rules in one dashboard.
 *
 * Do NOT raise this past ~4.4MB: Vercel caps a serverless request body at
 * 4.5MB and multipart framing eats into that, so a larger limit would fail at
 * the edge with a response this code never gets to shape.
 */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

/** Same list as easyslip.ts ALLOWED_TYPES, and as the bucket's allowed_mime_types. */
export const ALLOWED_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Extensions we are willing to put in a storage path, in MIME order. */
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
]);

const FALLBACK_EXTENSION = "jpg";

export type AttachmentRejectReason =
  | "NO_FILE"
  | "FILE_TOO_LARGE"
  | "INVALID_FILE_TYPE"
  | "LIMIT_REACHED";

export type AttachmentValidation =
  | { ok: true }
  | { ok: false; reason: AttachmentRejectReason };

/**
 * A safe extension for the storage path.
 *
 * Order matters: the file's own extension wins when it is one we allow, because
 * compressImage() returns `.webp` for a re-encoded file and the ORIGINAL file
 * untouched when re-encoding would not shrink it — so the caller genuinely does
 * not know which it is holding. Otherwise derive from the MIME type, and only
 * then fall back.
 *
 * What it must never do is echo the caller's string. `/api/verify-slip` builds
 * `pending/${id}/slip.${file.name.split(".").pop()}` with no allowlist, which
 * lets a filename steer the stored path. This is the same job done safely.
 */
export function attachmentExtension(fileName: string, mimeType: string): string {
  const raw = fileName.split(".").pop()?.toLowerCase().trim() ?? "";
  if (raw && raw !== fileName.toLowerCase().trim() && ALLOWED_EXTENSIONS.has(raw)) {
    return raw;
  }
  return EXTENSION_BY_MIME[mimeType] ?? FALLBACK_EXTENSION;
}

/**
 * `{homestayId}/{bookingId}/{attachmentId}.{ext}` — tenant first.
 *
 * Leading homestayId means the storage policy joins homestays + hosts only,
 * never reaching through bookings, and it matches the `{homestayId}/rooms/...`
 * convention homestay-photos already uses. The attachmentId is the row's own
 * UUID, so row <-> object is a string compare with no extra column.
 */
export function buildAttachmentPath(input: {
  homestayId: string;
  bookingId: string;
  attachmentId: string;
  fileName: string;
  mimeType: string;
}): string {
  const ext = attachmentExtension(input.fileName, input.mimeType);
  return `${input.homestayId}/${input.bookingId}/${input.attachmentId}.${ext}`;
}

/**
 * The single upload predicate. The uploader runs it pre-flight so a host gets a
 * message before a 4MB file crosses a rural mobile connection; the route runs
 * it again as the authority. One function, so the two can never disagree.
 */
export function validateAttachmentUpload(input: {
  size: number;
  type: string;
  existingCount: number;
}): AttachmentValidation {
  if (input.existingCount >= MAX_ATTACHMENTS_PER_BOOKING) {
    return { ok: false, reason: "LIMIT_REACHED" };
  }
  if (!input.size || input.size <= 0) {
    return { ok: false, reason: "NO_FILE" };
  }
  if (!(ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(input.type)) {
    return { ok: false, reason: "INVALID_FILE_TYPE" };
  }
  if (input.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: "FILE_TOO_LARGE" };
  }
  return { ok: true };
}

/**
 * How many more this booking can take, never negative.
 *
 * rooms/page.tsx:331 hand-rolls `15 - roomImages.length` and slices by it; a
 * negative slice count silently takes from the END of the array instead of
 * taking nothing.
 */
export function remainingAttachmentSlots(existingCount: number): number {
  return Math.max(0, MAX_ATTACHMENTS_PER_BOOKING - existingCount);
}

/**
 * Counts per booking for the card badges.
 *
 * Bookings with no attachments are absent from the map rather than present with
 * 0 — callers read it as `counts[id] ?? 0`, and materialising zeroes would mean
 * passing the full booking-id list in just to get them.
 */
export function countAttachmentsByBooking(
  rows: { booking_id: string }[] | null | undefined
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows ?? []) {
    if (!row?.booking_id) continue;
    counts[row.booking_id] = (counts[row.booking_id] ?? 0) + 1;
  }
  return counts;
}

/**
 * Zip a createSignedUrls() result positionally onto the rows it was built from.
 *
 * Takes the already-fetched result rather than a Supabase client, which keeps
 * this module import-free and makes the zip — the part that actually breaks —
 * testable.
 *
 * Tolerates three real failure modes that resolveSlipUrls (bookings/page.tsx:134)
 * drops on the floor today: a null `data` when the whole call failed, an array
 * shorter than `rows`, and a per-item null signedUrl. In every case the row
 * survives with `signed_url: null` and the caller renders a placeholder, rather
 * than the row vanishing or the indexes sliding by one.
 */
export function mapSignedUrls<T extends { storage_path: string }>(
  rows: T[],
  signed: ({ signedUrl?: string | null } | null)[] | null | undefined
): (T & { signed_url: string | null })[] {
  return rows.map((row, i) => ({
    ...row,
    signed_url: signed?.[i]?.signedUrl ?? null,
  }));
}
