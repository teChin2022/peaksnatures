import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { checkOwnerPassword, getStaffOwner, MAX_STAFF_PER_HOST } from "@/lib/host-staff";
import { logEvent, EventType } from "@/lib/history-log";
import { sendStaffAccountEmail } from "@/lib/notifications";
import { PASSWORD_RE } from "@/lib/utils";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  // 72: bcrypt, and Supabase Auth, ignore anything longer.
  password: z.string().max(72).regex(PASSWORD_RE),
  ownerPassword: z.string().min(1).max(200),
});

/** GET /api/host/staff — the owner's staff logins. */
export async function GET() {
  try {
    const owner = await getStaffOwner();
    if (owner instanceof NextResponse) return owner;

    const { data, error } = await owner.sc
      .from("host_staff")
      .select("id, name, email, created_at")
      .eq("host_id", owner.host.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[HostStaff] List failed:", error);
      return NextResponse.json({ error: "Failed to load staff" }, { status: 500 });
    }

    return NextResponse.json({ staff: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[HostStaff] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/host/staff — the owner adds a staff login with a real email and a
 * password they choose. Behind the owner's current password.
 */
export async function POST(req: NextRequest) {
  try {
    const owner = await getStaffOwner();
    if (owner instanceof NextResponse) return owner;

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }
    const { name, email, password, ownerPassword } = parsed.data;

    const refused = await checkOwnerPassword(owner, ownerPassword);
    if (refused) return refused;

    const { count } = await owner.sc
      .from("host_staff")
      .select("id", { count: "exact", head: true })
      .eq("host_id", owner.host.id);
    if ((count ?? 0) >= MAX_STAFF_PER_HOST) {
      return NextResponse.json({ error: "STAFF_LIMIT" }, { status: 409 });
    }

    // Confirmed at once: the owner vouches for the address, and the login code
    // goes there, so a mistyped one shows up at the first sign-in.
    const { data: created, error: createError } = await owner.sc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      if (createError?.code === "email_exists" || createError?.code === "user_already_exists") {
        return NextResponse.json({ error: "EMAIL_IN_USE" }, { status: 409 });
      }
      if (createError?.code === "weak_password") {
        return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
      }
      console.error("[HostStaff] createUser failed:", createError?.code, createError?.message);
      return NextResponse.json({ error: "Failed to add staff" }, { status: 500 });
    }

    const { data: row, error: insertError } = await owner.sc
      .from("host_staff")
      .insert({ host_id: owner.host.id, user_id: created.user.id, name, email } as never)
      .select("id, name, email, created_at")
      .single();

    if (insertError || !row) {
      // No row means no access, but do not leave a login behind that nobody can see.
      console.error("[HostStaff] Insert failed:", insertError);
      await owner.sc.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: "Failed to add staff" }, { status: 500 });
    }

    after(async () => {
      await logEvent({
        entityType: "host",
        entityId: owner.host.id,
        eventType: EventType.STAFF_ADDED,
        actorType: "host",
        actorId: owner.userId,
        data: { staff_user_id: created.user.id, staff_email: email },
        req,
      });
      await sendStaffAccountEmail(owner.email, {
        ownerName: owner.host.name,
        staffName: name,
        staffEmail: email,
        action: "added",
      });
    });

    return NextResponse.json({ staff: row }, { status: 201 });
  } catch (err) {
    console.error("[HostStaff] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
