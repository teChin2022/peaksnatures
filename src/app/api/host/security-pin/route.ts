import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import bcrypt from "bcryptjs";

// POST — Set PIN for the first time (during setup)
export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { pin } = await req.json();

    if (!pin || typeof pin !== "string" || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be 4–6 digits" }, { status: 400 });
    }

    const serviceClient = createServiceRoleClient();

    // Check that the host exists and doesn't already have a PIN
    const { data: hostRow } = await serviceClient
      .from("hosts")
      .select("id, security_pin_hash")
      .eq("user_id", user.id)
      .single();

    const host = hostRow as { id: string; security_pin_hash: string | null } | null;

    if (!host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    if (host.security_pin_hash) {
      return NextResponse.json({ error: "PIN already set. Use PUT to change it." }, { status: 409 });
    }

    const hash = await bcrypt.hash(pin, 10);

    const { error } = await serviceClient
      .from("hosts")
      .update({ security_pin_hash: hash, updated_by: user.id } as never)
      .eq("id", host.id);

    if (error) {
      console.error("Set PIN error:", error);
      return NextResponse.json({ error: "Failed to set PIN" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Security PIN POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT — Change existing PIN (requires current PIN)
export async function PUT(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { currentPin, newPin } = await req.json();

    if (!currentPin || typeof currentPin !== "string") {
      return NextResponse.json({ error: "Current PIN is required" }, { status: 400 });
    }

    if (!newPin || typeof newPin !== "string" || newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
      return NextResponse.json({ error: "New PIN must be 4–6 digits" }, { status: 400 });
    }

    const serviceClient = createServiceRoleClient();

    const { data: hostRow } = await serviceClient
      .from("hosts")
      .select("id, security_pin_hash")
      .eq("user_id", user.id)
      .single();

    const host = hostRow as { id: string; security_pin_hash: string | null } | null;

    if (!host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    if (!host.security_pin_hash) {
      return NextResponse.json({ error: "No PIN set. Use POST to set one." }, { status: 400 });
    }

    const isValid = await bcrypt.compare(currentPin, host.security_pin_hash);
    if (!isValid) {
      return NextResponse.json({ error: "Current PIN is incorrect" }, { status: 403 });
    }

    const hash = await bcrypt.hash(newPin, 10);

    const { error } = await serviceClient
      .from("hosts")
      .update({ security_pin_hash: hash, updated_by: user.id } as never)
      .eq("id", host.id);

    if (error) {
      console.error("Change PIN error:", error);
      return NextResponse.json({ error: "Failed to change PIN" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Security PIN PUT error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
