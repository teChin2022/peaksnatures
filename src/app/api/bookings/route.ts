import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";

const bookingSchema = z.object({
  homestay_id: z.string().uuid(),
  room_id: z.string().uuid().optional(),
  guest_name: z.string().min(1, "Name is required"),
  guest_email: z.string().email("Valid email required"),
  guest_phone: z.string().min(1, "Phone is required"),
  guest_province: z.string().optional(),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  num_guests: z.number().int().min(1),
  total_price: z.number().int().min(0),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = bookingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid booking data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const supabase = createServiceRoleClient();

    // Server-side overlap validation
    if (data.room_id) {
      // Fetch room quantity
      const { data: roomRow } = await supabase
        .from("rooms")
        .select("quantity")
        .eq("id", data.room_id)
        .single();
      const roomQuantity = (roomRow as { quantity: number } | null)?.quantity || 1;

      // Check overlapping active bookings for this room
      // Overlap: new_check_in < existing_check_out AND new_check_out > existing_check_in
      const { data: overlapping } = await supabase
        .from("bookings")
        .select("id, check_in, check_out")
        .eq("room_id", data.room_id)
        .in("status", ["pending", "confirmed", "verified"])
        .lt("check_in", data.check_out)
        .gt("check_out", data.check_in);

      const overlapCount = (overlapping as unknown[] | null)?.length || 0;
      if (overlapCount >= roomQuantity) {
        return NextResponse.json(
          { error: "Selected dates are no longer available for this room" },
          { status: 409 }
        );
      }
    }

    // Also check blocked dates
    const { data: blockedRows } = await supabase
      .from("blocked_dates")
      .select("date")
      .eq("homestay_id", data.homestay_id)
      .gte("date", data.check_in)
      .lt("date", data.check_out);

    if ((blockedRows as unknown[] | null)?.length) {
      return NextResponse.json(
        { error: "Some selected dates are blocked by the host" },
        { status: 409 }
      );
    }

    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        homestay_id: data.homestay_id,
        room_id: data.room_id || null,
        guest_name: data.guest_name,
        guest_email: data.guest_email,
        guest_phone: data.guest_phone,
        guest_province: data.guest_province || null,
        check_in: data.check_in,
        check_out: data.check_out,
        num_guests: data.num_guests,
        total_price: data.total_price,
        status: "pending",
      } as never)
      .select()
      .single();

    if (error) {
      console.error("Supabase booking insert error:", error);
      return NextResponse.json(
        { error: "Failed to create booking" },
        { status: 500 }
      );
    }

    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    console.error("Booking creation error:", error);
    return NextResponse.json(
      { error: "Failed to create booking" },
      { status: 500 }
    );
  }
}
