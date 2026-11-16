import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { pinAttemptKey, pinAttemptLimit } from "@/lib/security-pin";
import bcrypt from "bcryptjs";
import { logEvent, EventType } from "@/lib/history-log";

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

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Per-host PIN tries (src/lib/security-pin.ts, audit F-13).
    const pinLimited = await pinAttemptLimit.checkKey(pinAttemptKey(user.id));
    if (pinLimited) return pinLimited;

    const { pin, email, phone, promptpay_id, payment_display, bank_name, bank_account_number, bank_account_name, require_otp } = await req.json();

    if (!pin || typeof pin !== "string") {
      return NextResponse.json({ error: "PIN is required" }, { status: 400 });
    }

    const serviceClient = createServiceRoleClient();

    const { data: hostRow } = await serviceClient
      .from("hosts")
      .select("id, name, security_pin_hash")
      .eq("user_id", user.id)
      .single();

    const host = hostRow as { id: string; name: string; security_pin_hash: string | null } | null;

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
    if (payment_display !== undefined) updateData.payment_display = payment_display;
    if (bank_name !== undefined) updateData.bank_name = bank_name || null;
    if (bank_account_number !== undefined) updateData.bank_account_number = bank_account_number || null;
    if (bank_account_name !== undefined) updateData.bank_account_name = bank_account_name || null;
    // Behind the PIN: turning login OTP off is a downgrade (audit F-11/F-13).
    const otpUpdate = typeof require_otp === "boolean" ? { require_otp } : {};

    if (Object.keys(updateData).length === 0 && !("require_otp" in otpUpdate)) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    updateData.updated_by = host.name;

    const { error } = await serviceClient
      .from("hosts")
      .update({ ...updateData, ...otpUpdate } as never)
      .eq("id", host.id);

    if (error) {
      console.error("Update sensitive error:", error);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    // Log sensitive profile update in background
    after(async () => {
      await logEvent({
        entityType: "host",
        entityId: host.id,
        eventType: EventType.PROFILE_UPDATED,
        actorType: "host",
        actorId: user.id,
        data: { fields_updated: Object.keys({ ...updateData, ...otpUpdate }).filter(k => k !== "updated_by"), sensitive: true },
        req,
      });
    });

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
