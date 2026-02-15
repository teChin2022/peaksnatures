import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";

const holdSchema = z.object({
  room_id: z.string().uuid(),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  session_id: z.string().min(1, "Session ID is required"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = holdSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid hold data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { room_id, check_in, check_out, session_id } = parsed.data;
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase.rpc(
      "acquire_booking_hold" as never,
      {
        p_room_id: room_id,
        p_check_in: check_in,
        p_check_out: check_out,
        p_session_id: session_id,
        p_hold_minutes: 5,
      } as never
    );

    if (error) {
      console.error("Hold acquisition error:", error);

      if (error.message?.includes("DATES_HELD")) {
        return NextResponse.json(
          { error: "DATES_HELD", message: "These dates are currently being booked by another guest." },
          { status: 409 }
        );
      }

      if (error.message?.includes("ROOM_NOT_FOUND")) {
        return NextResponse.json(
          { error: "ROOM_NOT_FOUND", message: "Room not found." },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: "Failed to acquire hold" },
        { status: 500 }
      );
    }

    // Calculate expires_at for the client countdown
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    return NextResponse.json(
      { hold_id: data, expires_at: expiresAt },
      { status: 200 }
    );
  } catch (error) {
    console.error("Hold API error:", error);
    return NextResponse.json(
      { error: "Failed to acquire hold" },
      { status: 500 }
    );
  }
}

const deleteSchema = z.object({
  hold_id: z.string().uuid(),
  session_id: z.string().min(1),
});

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = deleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 }
      );
    }

    const { hold_id, session_id } = parsed.data;
    const supabase = createServiceRoleClient();

    await supabase
      .from("booking_holds")
      .delete()
      .eq("id", hold_id)
      .eq("session_id", session_id);

    return NextResponse.json({ released: true });
  } catch (error) {
    console.error("Hold release error:", error);
    return NextResponse.json(
      { error: "Failed to release hold" },
      { status: 500 }
    );
  }
}
