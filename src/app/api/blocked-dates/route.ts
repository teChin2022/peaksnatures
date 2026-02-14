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
    const { homestay_id, dates, reason } = body as {
      homestay_id: string;
      dates: string[];
      reason?: string;
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
    }));

    const { data: inserted, error } = await supabase
      .from("blocked_dates")
      .upsert(rows as never[], { onConflict: "homestay_id,date" })
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
    const { homestay_id, dates } = body as {
      homestay_id: string;
      dates: string[];
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

    const { error } = await supabase
      .from("blocked_dates")
      .delete()
      .eq("homestay_id", homestay_id)
      .in("date", dates);

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
