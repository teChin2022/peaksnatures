import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";

const schema = z.object({
  homestay_id: z.string().uuid(),
  guest_email: z.string().email().transform((v) => v.trim().toLowerCase()),
  guest_phone: z.string().min(1).transform((v) => v.trim()),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { homestay_id, guest_email, guest_phone } = parsed.data;
    const supabase = await createServiceRoleClient();

    // 1) Get host_id
    // We cast .from(...) to 'any' to stop the "never" error chain immediately
    const { data: homestay, error: homestayError } = await (supabase
      .from("homestays") as any)
      .select("host_id")
      .eq("id", homestay_id)
      .single();

    if (homestayError || !homestay) {
      return NextResponse.json({ error: "Homestay not found" }, { status: 404 });
    }

    // 2) Get all homestay IDs for this host
    const { data: hostHomestays, error: hostHomestaysError } = await (supabase
      .from("homestays") as any)
      .select("id")
      .eq("host_id", homestay.host_id);

    if (hostHomestaysError) {
      return NextResponse.json({ error: "Failed to fetch siblings" }, { status: 500 });
    }

    // Explicitly define the IDs as strings
    const homestayIds: string[] = (hostHomestays || []).map((h: any) => h.id);

    if (homestayIds.length === 0) {
      return NextResponse.json({ isDuplicate: false, matchType: null });
    }

    // 3) Check bookings 
    // By casting the .from() call to any, Promise.all handles the execution naturally
    const [emailResult, phoneResult] = await Promise.all([
      (supabase.from("bookings") as any)
        .select("id")
        .in("homestay_id", homestayIds)
        .in("status", ["pending", "confirmed", "partial"])
        .eq("guest_email", guest_email)
        .limit(1),

      (supabase.from("bookings") as any)
        .select("id")
        .in("homestay_id", homestayIds)
        .in("status", ["pending", "confirmed", "partial"])
        .eq("guest_phone", guest_phone)
        .limit(1),
    ]);

    if (emailResult.error || phoneResult.error) {
      console.error("Duplicate check error:", emailResult.error || phoneResult.error);
      return NextResponse.json({ error: "Duplicate check failed" }, { status: 500 });
    }

    // Use a simple length check on the untyped data
    const emailMatch = (emailResult.data?.length ?? 0) > 0;
    const phoneMatch = (phoneResult.data?.length ?? 0) > 0;

    if (!emailMatch && !phoneMatch) {
      return NextResponse.json({ isDuplicate: false, matchType: null });
    }

    const matchType = emailMatch && phoneMatch ? "both" : emailMatch ? "email" : "phone";

    return NextResponse.json({ isDuplicate: true, matchType });

  } catch (error) {
    console.error("POST Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}