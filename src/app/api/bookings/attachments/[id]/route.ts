import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { createRateLimiter } from "@/lib/rate-limit";
import { EventType, logEvent } from "@/lib/history-log";
import { ATTACHMENTS_BUCKET } from "@/lib/booking-attachments";

const deleteRateLimit = createRateLimiter({
  limit: 30,
  windowMs: 60_000,
  name: "booking-attachment-delete",
});

type AttachmentWithOwner = {
  id: string;
  booking_id: string;
  homestay_id: string;
  storage_path: string;
  booking: {
    homestay: { host: { id: string; name: string; user_id: string } | null } | null;
  } | null;
};

/**
 * DELETE /api/bookings/attachments/[id] — remove a host-private attachment.
 *
 * Delete here means gone. These are screenshots of a private conversation, so
 * dropping the row and leaving the object — which is what every other image
 * "delete" in this codebase does (homestay/page.tsx:395, rooms/page.tsx:387) —
 * would be a promise the product does not keep. This is the first
 * storage.remove() in the repo.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const rateLimited = await deleteRateLimit.check(req);
  if (rateLimited) return rateLimited;

  try {
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: "Missing attachment id" }, { status: 400 });
    }

    const auth = await createServerSupabaseClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sc = createServiceRoleClient();

    const { data: attachmentRow } = await sc
      .from("booking_attachments")
      .select(
        "id, booking_id, homestay_id, storage_path, booking:bookings(homestay:homestays(host:hosts(id, name, user_id)))",
      )
      .eq("id", id)
      .maybeSingle();

    const attachment = attachmentRow as unknown as AttachmentWithOwner | null;
    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    const owner = attachment.booking?.homestay?.host;
    if (!owner || owner.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ORDER IS LOAD-BEARING: object first, row second.
    //
    // Remove succeeds and the row delete fails -> a row pointing at nothing. The
    // host sees a broken tile, taps delete again, and the retry works: the real
    // client resolves `{ data: [], error: null }` for a key that is already
    // gone, so the second remove is a harmless no-op. Recoverable.
    //
    // Row first and the remove fails -> an object nothing references, in a
    // private bucket, with no sweep in this codebase to find it. Unrecoverable.
    const { error: removeError } = await sc.storage
      .from(ATTACHMENTS_BUCKET)
      .remove([attachment.storage_path]);

    if (removeError) {
      // Keep the row. A host retrying is the recovery path; deleting the row
      // here would throw away the only pointer to the object.
      console.error("[BookingAttachments] Storage remove failed:", removeError);
      return NextResponse.json({ error: "Failed to remove image" }, { status: 500 });
    }

    const { error: deleteError } = await sc.from("booking_attachments").delete().eq("id", id);
    if (deleteError) {
      console.error("[BookingAttachments] Row delete failed:", deleteError);
      return NextResponse.json({ error: "Failed to remove image" }, { status: 500 });
    }

    after(async () => {
      await logEvent({
        homestayId: attachment.homestay_id,
        entityType: "booking",
        entityId: attachment.booking_id,
        eventType: EventType.BOOKING_ATTACHMENT_REMOVED,
        actorType: "host",
        actorId: owner.id,
        data: { attachment_id: id },
        req,
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[BookingAttachments] DELETE failed:", error);
    return NextResponse.json({ error: "Failed to remove image" }, { status: 500 });
  }
}
