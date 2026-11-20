import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import bcrypt from "bcryptjs";
import { deleteStaffLogins } from "@/lib/host-access";
import { billingTodayStr } from "@/lib/billing-dates";

export async function DELETE(req: Request) {
  try {
    // Parse optional PIN from request body
    let pin: string | undefined;
    try {
      const body = await req.json();
      pin = body?.pin;
    } catch {
      // No body or invalid JSON — that's fine
    }

    // Get authenticated user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // Block platform admin self-deletion — admins must be removed via script/DB
    const { data: adminRecord } = await serviceClient
      .from("platform_admins")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (adminRecord) {
      return NextResponse.json(
        { error: "Admin accounts cannot be deleted through the dashboard" },
        { status: 403 }
      );
    }

    // Look up host record
    const { data: host } = await serviceClient
      .from("hosts")
      .select("id, security_pin_hash")
      .eq("user_id", user.id)
      .single();

    if (host) {
      const hostRow = host as { id: string; security_pin_hash: string | null };

      // If host has a PIN set, verify it before proceeding
      if (hostRow.security_pin_hash) {
        if (!pin) {
          return NextResponse.json(
            { error: "PIN is required to delete your account" },
            { status: 403 }
          );
        }
        const isValid = await bcrypt.compare(pin, hostRow.security_pin_hash);
        if (!isValid) {
          return NextResponse.json(
            { error: "Incorrect PIN" },
            { status: 403 }
          );
        }
      }

      // Look up homestay
      const { data: homestay } = await serviceClient
        .from("homestays")
        .select("id")
        .eq("host_id", hostRow.id)
        .single();

      if (homestay) {
        const homestayRow = homestay as { id: string };

        // Owner's rule (2026-11-20): never delete a booking a guest still holds;
        // deleting told no one. The host cancels them first (each guest is emailed).
        const { count: upcoming, error: upcomingError } = await serviceClient
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("homestay_id", homestayRow.id)
          .in("status", ["pending", "verified", "confirmed"])
          .gte("check_out", billingTodayStr());
        if (upcomingError) {
          console.error("Delete account: counting upcoming bookings failed:", upcomingError);
          return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
        }
        if ((upcoming ?? 0) > 0) {
          return NextResponse.json({ error: "UPCOMING_BOOKINGS", count: upcoming }, { status: 409 });
        }

        // Delete rooms and their pricing rules
        const { data: rooms } = await serviceClient
          .from("rooms")
          .select("id")
          .eq("homestay_id", homestayRow.id);

        if (rooms && rooms.length > 0) {
          const roomIds = (rooms as { id: string }[]).map((r) => r.id);
          await serviceClient
            .from("room_seasonal_prices")
            .delete()
            .in("room_id", roomIds);
          await serviceClient
            .from("room_special_prices")
            .delete()
            .in("room_id", roomIds);
          await serviceClient
            .from("rooms")
            .delete()
            .eq("homestay_id", homestayRow.id);
        }

        // Delete bookings for this homestay
        await serviceClient
          .from("bookings")
          .delete()
          .eq("homestay_id", homestayRow.id);

        // Delete blocked dates
        await serviceClient
          .from("blocked_dates")
          .delete()
          .eq("homestay_id", homestayRow.id);

        // Delete homestay
        await serviceClient
          .from("homestays")
          .delete()
          .eq("id", homestayRow.id);
      }

      // Staff logins first: the host delete cascades their rows, not their logins.
      await deleteStaffLogins(serviceClient, hostRow.id);

      // Delete host record
      await serviceClient
        .from("hosts")
        .delete()
        .eq("id", hostRow.id);
    }

    // Delete login OTPs
    await serviceClient
      .from("login_otps")
      .delete()
      .eq("email", user.email!);

    // Delete the auth user via admin API
    const { error: deleteError } =
      await serviceClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error("Failed to delete auth user:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete account" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete account error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
