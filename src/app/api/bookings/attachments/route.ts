import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { createRateLimiter } from "@/lib/rate-limit";
import { EventType, logEvent } from "@/lib/history-log";
import {
  ATTACHMENTS_BUCKET,
  ATTACHMENT_SIGNED_URL_TTL_SECONDS,
  buildAttachmentPath,
  validateAttachmentUpload,
} from "@/lib/booking-attachments";

/**
 * A 4MB screenshot arriving over rural Thai mobile data is the slow leg here,
 * not anything this handler computes. The platform default has killed a slip
 * upload mid-flight before (see verify-slip); 30s leaves room without matching
 * that route's 60s, since nothing here waits on a third party.
 */
export const maxDuration = 30;

const uploadRateLimit = createRateLimiter({
  limit: 20,
  windowMs: 60_000,
  name: "booking-attachment-upload",
});

/** The ownership chain, resolved in one query: booking -> homestay -> host. */
type BookingWithOwner = {
  id: string;
  homestay_id: string;
  status: string;
  homestay: { host: { id: string; name: string; user_id: string } | null } | null;
};

/**
 * POST /api/bookings/attachments — attach a host-private image to a booking.
 *
 * multipart/form-data: `booking_id`, `file`.
 *
 * WHY A ROUTE AND NOT A DIRECT BROWSER UPLOAD
 * The rest of the dashboard uploads images straight to storage
 * (homestay/page.tsx:285). That is a two-phase write — upload, then insert —
 * with nothing to undo the upload when the insert fails. In a PRIVATE bucket
 * the resulting orphan is invisible and billable forever, and nothing in this
 * repo has ever called storage.remove(), so there is no sweep that would find
 * it. Here the insert failure path removes the object it just wrote.
 *
 * Every failure carries a stable `reason` code alongside the English message,
 * the convention verify-slip established: the client maps `reason` to localised
 * copy, and "upload failed" for a 5MB file, a GIF and a full booking alike is
 * indistinguishable from the feature being broken.
 */
export async function POST(req: NextRequest) {
  const rateLimited = await uploadRateLimit.check(req);
  if (rateLimited) return rateLimited;

  try {
    const auth = await createServerSupabaseClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const bookingId = formData.get("booking_id");
    const file = formData.get("file") as File | null;

    if (typeof bookingId !== "string" || !bookingId) {
      return NextResponse.json(
        { error: "Missing booking id", reason: "MISSING_BOOKING_ID" },
        { status: 400 },
      );
    }
    if (!file || typeof file === "string") {
      return NextResponse.json(
        { error: "No file uploaded", reason: "NO_FILE" },
        { status: 400 },
      );
    }

    const sc = createServiceRoleClient();

    const { data: bookingRow } = await sc
      .from("bookings")
      .select("id, homestay_id, status, homestay:homestays(host:hosts(id, name, user_id))")
      .eq("id", bookingId)
      .maybeSingle();

    const booking = bookingRow as unknown as BookingWithOwner | null;
    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found", reason: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const owner = booking.homestay?.host;
    if (!owner || owner.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden", reason: "FORBIDDEN" }, { status: 403 });
    }

    // Deliberately permissive about status. The request was "after the booking
    // is confirmed", but a host confirming a pending booking often has the chat
    // open at that exact moment. Only the two dead states are refused: attaching
    // evidence to a booking that will never happen is never the intent.
    if (booking.status === "cancelled" || booking.status === "rejected") {
      return NextResponse.json(
        { error: "Booking is not active", reason: "BOOKING_INACTIVE" },
        { status: 409 },
      );
    }

    const { count: existingCount, error: countError } = await sc
      .from("booking_attachments")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", bookingId);

    if (countError) {
      console.error("[BookingAttachments] Count failed:", countError);
      return NextResponse.json(
        { error: "Failed to attach image", reason: "SERVER_ERROR" },
        { status: 500 },
      );
    }

    const validation = validateAttachmentUpload({
      size: file.size,
      type: file.type,
      existingCount: existingCount ?? 0,
    });
    if (!validation.ok) {
      // A full booking is a state conflict, not a bad request — same 409 the
      // duplicate-slip path in verify-slip returns.
      const status = validation.reason === "LIMIT_REACHED" ? 409 : 400;
      return NextResponse.json(
        { error: "Attachment rejected", reason: validation.reason },
        { status },
      );
    }

    const attachmentId = crypto.randomUUID();
    const storagePath = buildAttachmentPath({
      homestayId: booking.homestay_id,
      bookingId,
      attachmentId,
      fileName: file.name,
      mimeType: file.type,
    });

    // upsert:false, unlike the wallet/invoice slip paths which retry into a
    // stable path. This path carries a freshly minted UUID, so a collision means
    // something is badly wrong and must fail loudly rather than overwrite.
    const { error: uploadError } = await sc.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error("[BookingAttachments] Upload failed:", uploadError);
      return NextResponse.json(
        { error: "Failed to store image", reason: "UPLOAD_FAILED" },
        { status: 500 },
      );
    }

    const { data: inserted, error: insertError } = await sc
      .from("booking_attachments")
      .insert({
        id: attachmentId,
        booking_id: bookingId,
        homestay_id: booking.homestay_id,
        storage_path: storagePath,
        mime_type: file.type,
        byte_size: file.size,
        created_by: owner.name || "host",
      } as never)
      .select("id, booking_id, storage_path, mime_type, byte_size, created_at")
      .single();

    const row = inserted as unknown as {
      id: string;
      booking_id: string;
      storage_path: string;
      mime_type: string;
      byte_size: number;
      created_at: string;
    } | null;

    if (insertError || !row) {
      // The compensating delete. Without it the object survives with nothing
      // referencing it, in a private bucket no one can list from the dashboard.
      await sc.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]);
      console.error("[BookingAttachments] Insert failed, object removed:", insertError);
      return NextResponse.json(
        { error: "Failed to attach image", reason: "SERVER_ERROR" },
        { status: 500 },
      );
    }

    // Returned so the uploader can render the new tile immediately, without a
    // refetch and without a blob: URL whose shape differs from fetched rows.
    const { data: signed } = await sc.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrl(storagePath, ATTACHMENT_SIGNED_URL_TTL_SECONDS);

    after(async () => {
      await logEvent({
        homestayId: booking.homestay_id,
        entityType: "booking",
        entityId: bookingId,
        eventType: EventType.BOOKING_ATTACHMENT_ADDED,
        actorType: "host",
        actorId: owner.id,
        data: { attachment_id: attachmentId, byte_size: file.size, mime_type: file.type },
        req,
      });
    });

    return NextResponse.json({
      success: true,
      attachment: { ...row, signed_url: signed?.signedUrl ?? null },
    });
  } catch (error) {
    console.error("[BookingAttachments] POST failed:", error);
    return NextResponse.json(
      { error: "Failed to attach image", reason: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
