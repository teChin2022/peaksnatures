import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { pin } = await req.json();

    if (!pin || typeof pin !== "string") {
      return NextResponse.json({ error: "PIN is required" }, { status: 400 });
    }

    const serviceClient = createServiceRoleClient();

    const { data: hostRow } = await serviceClient
      .from("hosts")
      .select("id, security_pin_hash, email, phone, promptpay_id")
      .eq("user_id", user.id)
      .single();

    const host = hostRow as {
      id: string;
      security_pin_hash: string | null;
      email: string;
      phone: string | null;
      promptpay_id: string;
    } | null;

    if (!host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    if (!host.security_pin_hash) {
      return NextResponse.json({ error: "No PIN set" }, { status: 400 });
    }

    const isValid = await bcrypt.compare(pin, host.security_pin_hash);
    if (!isValid) {
      return NextResponse.json({ error: "Incorrect PIN" }, { status: 403 });
    }

    return NextResponse.json({
      email: host.email,
      phone: host.phone,
      promptpay_id: host.promptpay_id,
    });
  } catch (err) {
    console.error("Reveal sensitive error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
