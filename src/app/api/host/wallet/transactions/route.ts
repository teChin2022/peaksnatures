import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sc = createServiceRoleClient();

    const { data: host } = await sc
      .from("hosts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    const { count: total } = await sc
      .from("wallet_transactions")
      .select("id", { count: "exact", head: true })
      .eq("host_id", (host as { id: string }).id);

    const { data: transactions, error } = await sc
      .from("wallet_transactions")
      .select("*")
      .eq("host_id", (host as { id: string }).id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
    }

    // Commission and refund rows reference a booking; attach who stayed where so
    // the host isn't left matching a booking-id prefix. reference_id is written
    // only by the wallet RPCs, so these are this host's own bookings.
    const rows = (transactions || []) as { type: string; reference_id: string | null }[];
    const bookingRef = (t: (typeof rows)[number]) =>
      t.type === "commission" || t.type === "refund" ? t.reference_id : null;
    const bookingIds = [...new Set(rows.map(bookingRef).filter((id): id is string => !!id))];
    const bookingsById = new Map<string, unknown>();
    if (bookingIds.length > 0) {
      const { data: bookings, error: bookingsError } = await sc
        .from("bookings")
        .select("id, guest_name, check_in, check_out, booking_source, room:rooms(name)")
        .in("id", bookingIds);
      // Not fatal: the ledger itself is still right, rows just fall back to the id.
      if (bookingsError) console.error("[Wallet Transactions] booking lookup failed:", bookingsError);
      for (const b of (bookings as { id: string }[] | null) ?? []) bookingsById.set(b.id, b);
    }

    return NextResponse.json({
      transactions: rows.map((t) => {
        const ref = bookingRef(t);
        return { ...t, booking: (ref && bookingsById.get(ref)) ?? null };
      }),
      total: total || 0,
      page,
      limit,
    });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
