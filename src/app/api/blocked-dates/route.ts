import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { homestay_id, dates, reason, room_id } = body as {
      homestay_id: string;
      dates: string[];
      reason?: string;
      room_id?: string | null;
    };

    if (!homestay_id || !dates || dates.length === 0) {
      return NextResponse.json(
        { error: "homestay_id and dates[] are required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const { data: homestayRow } = await supabase
      .from("homestays")
      .select("id, host_id")
      .eq("id", homestay_id)
      .single();
    const homestay = homestayRow as { id: string; host_id: string } | null;

    if (!homestay) {
      return NextResponse.json({ error: "Homestay not found" }, { status: 404 });
    }

    const { data: hostRow } = await supabase
      .from("hosts")
      .select("id")
      .eq("user_id", user.id)
      .eq("id", homestay.host_id)
      .single();

    if (!hostRow) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Insert blocked dates (upsert to avoid duplicates)
    const rows = dates.map((date: string) => ({
      homestay_id,
      date,
      reason: reason || null,
      room_id: room_id || null,
    }));

    // Use insert + on-conflict handling; for room-specific blocks the unique index
    // is (homestay_id, date, room_id), for homestay-wide it's (homestay_id, date) where room_id IS NULL.
    // We delete-then-insert to handle both partial-unique-index cases cleanly.
    for (const row of rows) {
      const q = supabase
        .from("blocked_dates")
        .delete()
        .eq("homestay_id", row.homestay_id)
        .eq("date", row.date);
      if (row.room_id) {
        await q.eq("room_id", row.room_id);
      } else {
        await q.is("room_id", null);
      }
    }

    const { data: inserted, error } = await supabase
      .from("blocked_dates")
      .insert(rows as never[])
      .select();

    if (error) {
      console.error("Block dates error:", error);
      return NextResponse.json(
        { error: "Failed to block dates" },
        { status: 500 }
      );
    }

    return NextResponse.json({ blocked: inserted }, { status: 201 });
  } catch (error) {
    console.error("Block dates error:", error);
    return NextResponse.json(
      { error: "Failed to block dates" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { homestay_id, dates, room_id } = body as {
      homestay_id: string;
      dates: string[];
      room_id?: string | null;
    };

    if (!homestay_id || !dates || dates.length === 0) {
      return NextResponse.json(
        { error: "homestay_id and dates[] are required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const { data: homestayRow } = await supabase
      .from("homestays")
      .select("id, host_id")
      .eq("id", homestay_id)
      .single();
    const homestay = homestayRow as { id: string; host_id: string } | null;

    if (!homestay) {
      return NextResponse.json({ error: "Homestay not found" }, { status: 404 });
    }

    const { data: hostRow } = await supabase
      .from("hosts")
      .select("id")
      .eq("user_id", user.id)
      .eq("id", homestay.host_id)
      .single();

    if (!hostRow) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let deleteQuery = supabase
      .from("blocked_dates")
      .delete()
      .eq("homestay_id", homestay_id)
      .in("date", dates);

    if (room_id) {
      deleteQuery = deleteQuery.eq("room_id", room_id);
    } else {
      deleteQuery = deleteQuery.is("room_id", null);
    }

    const { error } = await deleteQuery;

    if (error) {
      console.error("Unblock dates error:", error);
      return NextResponse.json(
        { error: "Failed to unblock dates" },
        { status: 500 }
      );
    }

    return NextResponse.json({ unblocked: dates }, { status: 200 });
  } catch (error) {
    console.error("Unblock dates error:", error);
    return NextResponse.json(
      { error: "Failed to unblock dates" },
      { status: 500 }
    );
  }
}
