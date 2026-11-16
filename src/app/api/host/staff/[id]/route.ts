import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { checkOwnerPassword, getStaffOwner, type StaffOwner } from "@/lib/host-staff";
import { logEvent, EventType } from "@/lib/history-log";
import { sendStaffAccountEmail } from "@/lib/notifications";
import { PASSWORD_RE } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

const idSchema = z.string().uuid();
const resetSchema = z.object({
  password: z.string().max(72).regex(PASSWORD_RE),
  ownerPassword: z.string().min(1).max(200),
});
const removeSchema = z.object({ ownerPassword: z.string().min(1).max(200) });

interface StaffRow {
  id: string;
  user_id: string;
  name: string;
  email: string;
}

/**
 * The staff row, only if it belongs to this owner's host. The auth user acted
 * on is always this row's user_id, never one from the request.
 */
async function ownStaffRow(owner: StaffOwner, id: string): Promise<StaffRow | null> {
  const { data } = await owner.sc
    .from("host_staff")
    .select("id, user_id, name, email")
    .eq("id", id)
    .eq("host_id", owner.host.id)
    .maybeSingle();
  const row = data as StaffRow | null;
  // Defence in depth: never let this route touch the owner's own login.
  return row && row.user_id !== owner.userId ? row : null;
}

function notify(req: NextRequest, owner: StaffOwner, row: StaffRow, action: "password_reset" | "removed") {
  after(async () => {
    await logEvent({
      entityType: "host",
      entityId: owner.host.id,
      eventType: action === "removed" ? EventType.STAFF_REMOVED : EventType.STAFF_PASSWORD_RESET,
      actorType: "host",
      actorId: owner.userId,
      data: { staff_user_id: row.user_id, staff_email: row.email },
      req,
    });
    await sendStaffAccountEmail(owner.email, {
      ownerName: owner.host.name,
      staffName: row.name,
      staffEmail: row.email,
      action,
    });
  });
}

/** PATCH /api/host/staff/[id] — the owner sets a new password for a staff login. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const owner = await getStaffOwner();
    if (owner instanceof NextResponse) return owner;

    const { id } = await ctx.params;
    const parsed = resetSchema.safeParse(await req.json().catch(() => null));
    if (!idSchema.safeParse(id).success || !parsed.success) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const refused = await checkOwnerPassword(owner, parsed.data.ownerPassword);
    if (refused) return refused;

    const row = await ownStaffRow(owner, id);
    if (!row) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    const { error } = await owner.sc.auth.admin.updateUserById(row.user_id, { password: parsed.data.password });
    if (error) {
      if (error.code === "weak_password") {
        return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
      }
      console.error("[HostStaff] Password reset failed:", error.code, error.message);
      return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
    }

    notify(req, owner, row, "password_reset");
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[HostStaff] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/host/staff/[id] — removes the staff login. Deleting the auth user
 * cascades the row, and RLS shuts the login out at once even while an access
 * token it already holds is still valid.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const owner = await getStaffOwner();
    if (owner instanceof NextResponse) return owner;

    const { id } = await ctx.params;
    const parsed = removeSchema.safeParse(await req.json().catch(() => null));
    if (!idSchema.safeParse(id).success || !parsed.success) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const refused = await checkOwnerPassword(owner, parsed.data.ownerPassword);
    if (refused) return refused;

    const row = await ownStaffRow(owner, id);
    if (!row) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    const { error } = await owner.sc.auth.admin.deleteUser(row.user_id);
    if (error) {
      console.error("[HostStaff] Remove failed:", error.code, error.message);
      return NextResponse.json({ error: "Failed to remove staff" }, { status: 500 });
    }

    notify(req, owner, row, "removed");
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[HostStaff] DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
