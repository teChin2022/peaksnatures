import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logEvent, EventType } from "@/lib/history-log";

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

    // Verify ownership (single joined query)
    const { data: homestayRow } = await supabase
      .from("homestays")
      .select("id, hosts!inner(id, name)")
      .eq("id", homestay_id)
      .single();

    if (!homestayRow) {
      return NextResponse.json({ error: "Homestay not found" }, { status: 404 });
    }

    const hsJoined = homestayRow as unknown as { id: string; hosts: { id: string; name: string } };
    // Verify the requesting user owns this host
    const { data: hostCheck } = await supabase
      .from("hosts")
      .select("id")
      .eq("id", hsJoined.hosts.id)
      .eq("user_id", user.id)
      .single();

    if (!hostCheck) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const hostName = hsJoined.hosts.name;

    // Check for active booking holds overlapping the requested dates
    const { data: activeHolds } = await supabase
      .from("booking_holds" as never)
      .select("room_id, check_in, check_out")
      .gt("expires_at", new Date().toISOString());

    const holds = activeHolds as unknown as { room_id: string; check_in: string; check_out: string }[] | null;

    if (holds && holds.length > 0) {
      const heldDates = new Set<string>();
      for (const hold of holds) {
        // If blocking a specific room, only check holds for that room
        if (room_id && hold.room_id !== room_id) continue;
        // Collect held dates that overlap with requested block dates
        const holdStart = new Date(hold.check_in);
        const holdEnd = new Date(hold.check_out);
        for (const d of dates) {
          const date = new Date(d);
          if (date >= holdStart && date < holdEnd) {
            heldDates.add(d);
          }
        }
      }
      if (heldDates.size > 0) {
        return NextResponse.json(
          { error: "DATES_HELD", dates: Array.from(heldDates) },
          { status: 409 }
        );
      }
    }

    // Check for active bookings overlapping the requested dates
    const { data: bookingRows } = await supabase
      .from("bookings")
      .select("room_id, check_in, check_out")
      .eq("homestay_id", homestay_id)
      .in("status", ["pending", "confirmed", "verified"] as never[]);

    const activeBookings = bookingRows as unknown as { room_id: string | null; check_in: string; check_out: string }[] | null;

    if (activeBookings && activeBookings.length > 0) {
      const bookedDates = new Set<string>();
      for (const booking of activeBookings) {
        if (room_id && booking.room_id !== room_id) continue;
        const bookStart = new Date(booking.check_in);
        const bookEnd = new Date(booking.check_out);
        for (const d of dates) {
          const date = new Date(d);
          if (date >= bookStart && date < bookEnd) {
            bookedDates.add(d);
          }
        }
      }
      if (bookedDates.size > 0) {
        return NextResponse.json(
          { error: "DATES_BOOKED", dates: Array.from(bookedDates) },
          { status: 409 }
        );
      }
    }

    // Insert blocked dates (upsert to avoid duplicates)
    const rows = dates.map((date: string) => ({
      homestay_id,
      date,
      reason: reason || null,
      room_id: room_id || null,
      created_by: hostName,
    }));

    // Bulk delete existing entries to handle partial-unique-index cases cleanly,
    // then bulk insert. Single query instead of N sequential deletes.
    let bulkDeleteQuery = supabase
      .from("blocked_dates")
      .delete()
      .eq("homestay_id", homestay_id)
      .in("date", dates);
    if (room_id) {
      bulkDeleteQuery = bulkDeleteQuery.eq("room_id", room_id);
    } else {
      bulkDeleteQuery = bulkDeleteQuery.is("room_id", null);
    }
    await bulkDeleteQuery;

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

    // Log in background
    after(async () => {
      await logEvent({
        homestayId: homestay_id,
        entityType: "blocked_date",
        entityId: homestay_id,
        eventType: EventType.BLOCKED_DATE_ADDED,
        actorType: "host",
        actorId: user.id,
        data: { dates, reason: reason || null, room_id: room_id || null },
        req,
      });
    });

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

    // Verify ownership (single joined query)
    const { data: homestayRow } = await supabase
      .from("homestays")
      .select("id, hosts!inner(id, name)")
      .eq("id", homestay_id)
      .single();

    if (!homestayRow) {
      return NextResponse.json({ error: "Homestay not found" }, { status: 404 });
    }

    const hsJoined = homestayRow as unknown as { id: string; hosts: { id: string; name: string } };
    const { data: hostCheck } = await supabase
      .from("hosts")
      .select("id")
      .eq("id", hsJoined.hosts.id)
      .eq("user_id", user.id)
      .single();

    if (!hostCheck) {
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

    // Log in background
    after(async () => {
      await logEvent({
        homestayId: homestay_id,
        entityType: "blocked_date",
        entityId: homestay_id,
        eventType: EventType.BLOCKED_DATE_REMOVED,
        actorType: "host",
        actorId: user.id,
        data: { dates, room_id: room_id || null },
        req,
      });
    });

    return NextResponse.json({ unblocked: dates }, { status: 200 });
  } catch (error) {
    console.error("Unblock dates error:", error);
    return NextResponse.json(
      { error: "Failed to unblock dates" },
      { status: 500 }
    );
  }
}
