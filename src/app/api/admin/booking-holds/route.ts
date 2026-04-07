import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !(await isAdmin(user.id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sc = createServiceRoleClient();

    const { data: holds, error } = await sc
      .from("booking_holds")
      .select("id, room_id, check_in, check_out, session_id, expires_at, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Admin BookingHolds] query error:", error);
      return NextResponse.json({ error: "Failed to fetch holds" }, { status: 500 });
    }

    const typedHolds = (holds || []) as {
      id: string; room_id: string; check_in: string; check_out: string;
      session_id: string; expires_at: string; created_at: string;
    }[];

    // Fetch room + homestay info
    const roomIds = [...new Set(typedHolds.map((h) => h.room_id))];
    const { data: rooms } = roomIds.length
      ? await sc.from("rooms").select("id, name, homestay_id").in("id", roomIds)
      : { data: [] };

    const typedRooms = (rooms || []) as { id: string; name: string; homestay_id: string }[];
    const homestayIds = [...new Set(typedRooms.map((r) => r.homestay_id))];
    const { data: homestays } = homestayIds.length
      ? await sc.from("homestays").select("id, name").in("id", homestayIds)
      : { data: [] };

    const homestayMap = new Map((homestays as { id: string; name: string }[] || []).map((h) => [h.id, h.name]));
    const roomMap = new Map(typedRooms.map((r) => [r.id, { name: r.name, homestay_name: homestayMap.get(r.homestay_id) || null }]));

    const data = typedHolds.map((h) => ({
      ...h,
      room_name: roomMap.get(h.room_id)?.name || null,
      homestay_name: roomMap.get(h.room_id)?.homestay_name || null,
    }));

    return NextResponse.json({ data }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[Admin BookingHolds] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !(await isAdmin(user.id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing hold id" }, { status: 400 });
    }

    const sc = createServiceRoleClient();
    const { error } = await sc.from("booking_holds").delete().eq("id", id);

    if (error) {
      console.error("[Admin BookingHolds] delete error:", error);
      return NextResponse.json({ error: "Failed to delete hold" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Admin BookingHolds] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
