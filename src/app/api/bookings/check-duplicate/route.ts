import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Homestay } from "@/types/database";

const schema = z.object({
  homestay_id: z.string().uuid(),
  guest_email: z.string().email(),
  guest_phone: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { homestay_id, guest_email, guest_phone } = parsed.data;
    const supabase = createServiceRoleClient();

    // Get the host_id for this homestay
    const { data: homestayRow } = await supabase
      .from("homestays")
      .select("host_id")
      .eq("id", homestay_id)
      .single();

    const homestay = homestayRow as Pick<Homestay, "host_id"> | null;

    if (!homestay?.host_id) {
      return NextResponse.json({ error: "Homestay not found" }, { status: 404 });
    }

    // Get all homestay IDs belonging to this host
    const { data: hostHomestays } = await supabase
      .from("homestays")
      .select("id")
      .eq("host_id", homestay.host_id);

    const homestayIds = (hostHomestays ?? []).map((h) => h.id);

    const { data: rows } = await supabase
      .from("bookings")
      .select("guest_email, guest_phone")
      .in("homestay_id", homestayIds)
      .in("status", ["pending", "confirmed", "partial"])
      .or(`guest_email.eq.${guest_email},guest_phone.eq.${guest_phone}`);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ isDuplicate: false, matchType: null });
    }

    const emailMatch = rows.some((r) => r.guest_email === guest_email);
    const phoneMatch = rows.some((r) => r.guest_phone === guest_phone);

    const matchType =
      emailMatch && phoneMatch ? "both" : emailMatch ? "email" : "phone";

    return NextResponse.json({ isDuplicate: true, matchType });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
