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
