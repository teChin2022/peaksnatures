import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";

const getCachedAvailability = (homestayId: string) =>
  unstable_cache(
    async () => {
      const supabase = createServiceRoleClient();
      const { data, error } = await supabase
        .from("bookings")
        .select("id, room_id, check_in, check_out")
        .eq("homestay_id", homestayId)
        .in("status", ["pending", "confirmed", "verified"]);
      if (error) throw error;
      return (data as { id: string; room_id: string | null; check_in: string; check_out: string }[]) || [];
    },
    ["booking-availability", homestayId],
    { revalidate: 60, tags: [`booking-availability:${homestayId}`] },
  )();

export async function GET(req: NextRequest) {
  const homestayId = req.nextUrl.searchParams.get("homestay_id");

  if (!homestayId) {
    return NextResponse.json(
      { error: "homestay_id is required" },
      { status: 400 }
    );
  }

  try {
    const bookedRanges = await getCachedAvailability(homestayId);
    return NextResponse.json(
      { bookedRanges },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("Availability fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch availability" },
      { status: 500 }
    );
  }
}
