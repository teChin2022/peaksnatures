import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const homestayId = req.nextUrl.searchParams.get("homestay_id");

  if (!homestayId) {
    return NextResponse.json(
      { error: "homestay_id is required" },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleClient();

  const { data: bookingRows, error } = await supabase
    .from("bookings")
    .select("room_id, check_in, check_out")
    .eq("homestay_id", homestayId)
    .in("status", ["pending", "confirmed", "verified"]);

  if (error) {
    console.error("Availability fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch availability" },
      { status: 500 }
    );
  }

  const bookedRanges = (bookingRows as { room_id: string | null; check_in: string; check_out: string }[]) || [];

  return NextResponse.json({ bookedRanges });
}
