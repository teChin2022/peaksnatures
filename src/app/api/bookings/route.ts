import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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

    // In production: insert into Supabase
    // const supabase = createServiceRoleClient();
    // const { data: booking, error } = await supabase
    //   .from("bookings")
    //   .insert({
    //     ...data,
    //     status: "pending",
    //   })
    //   .select()
    //   .single();

    // Simulate booking creation
    const bookingId = `${crypto.randomUUID()}`;
    const booking = {
      id: bookingId,
      ...data,
      status: "pending" as const,
      payment_slip_url: null,
      easyslip_verified: false,
      easyslip_response: null,
      notes: null,
      created_at: new Date().toISOString(),
    };

    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    console.error("Booking creation error:", error);
    return NextResponse.json(
      { error: "Failed to create booking" },
      { status: 500 }
    );
  }
}
