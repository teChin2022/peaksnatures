import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import bcrypt from "bcryptjs";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return local.charAt(0) + "***@" + domain;
}

function maskPhone(phone: string): string {
  if (phone.length < 4) return "***";
  return phone.slice(0, 2) + "x-xxx-x" + phone.slice(-3);
}

function maskPromptpay(id: string): string {
  if (id.length < 4) return "***";
  return "x-xxxx-xx" + id.slice(-3);
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { pin, email, phone, promptpay_id } = await req.json();

    if (!pin || typeof pin !== "string") {
      return NextResponse.json({ error: "PIN is required" }, { status: 400 });
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
      return NextResponse.json({ error: "No PIN set" }, { status: 400 });
    }

    const isValid = await bcrypt.compare(pin, host.security_pin_hash);
    if (!isValid) {
      return NextResponse.json({ error: "Incorrect PIN" }, { status: 403 });
    }

    // Build update object with only the fields that were provided
    const updateData: Record<string, string | null> = {};
    if (email !== undefined) updateData.email = email.trim();
    if (phone !== undefined) updateData.phone = phone.trim() || null;
    if (promptpay_id !== undefined) updateData.promptpay_id = promptpay_id.trim();

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { error } = await serviceClient
      .from("hosts")
      .update(updateData as never)
      .eq("id", host.id);

    if (error) {
      console.error("Update sensitive error:", error);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    // Return masked values
    const result: Record<string, string> = {};
    if (updateData.email) result.email = maskEmail(updateData.email);
    if (updateData.phone) result.phone = maskPhone(updateData.phone);
    else if (phone !== undefined) result.phone = "";
    if (updateData.promptpay_id) result.promptpay_id = maskPromptpay(updateData.promptpay_id);

    return NextResponse.json({ success: true, masked: result });
  } catch (err) {
    console.error("Update sensitive error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
