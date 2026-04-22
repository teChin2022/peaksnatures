import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

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

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = createServiceRoleClient();
    const { data: hostRow } = await serviceClient
      .from("hosts")
      .select("id, name, email, phone, line_user_id, line_channel_access_token, promptpay_id, notification_preference, security_pin_hash, avatar_url, bank_name, bank_account_number, bank_account_name, payment_display, require_otp")
      .eq("user_id", user.id)
      .single();

    if (!hostRow) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    const h = hostRow as {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      line_user_id: string | null;
      line_channel_access_token: string | null;
      promptpay_id: string | null;
      notification_preference: string | null;
      security_pin_hash: string | null;
      avatar_url: string | null;
      bank_name: string | null;
      bank_account_number: string | null;
      bank_account_name: string | null;
      payment_display: string | null;
      require_otp: boolean | null;
    };

    return NextResponse.json({
      id: h.id,
      name: h.name,
      line_user_id: h.line_user_id,
      line_token_tail: h.line_channel_access_token ? h.line_channel_access_token.slice(-4) : null,
      notification_preference: h.notification_preference || "sms",
      avatar_url: h.avatar_url,
      payment_display: (h.payment_display as "qr" | "bank") || "qr",
      require_otp: h.require_otp !== false,
      bank_name: h.bank_name,
      bank_account_number: h.bank_account_number,
      bank_account_name: h.bank_account_name,
      masked: {
        email: maskEmail(h.email),
        phone: h.phone ? maskPhone(h.phone) : "",
        promptpay_id: h.promptpay_id ? maskPromptpay(h.promptpay_id) : "",
      },
      hasPhone: !!h.phone,
      hasPromptpay: !!h.promptpay_id,
      hasPinSet: !!h.security_pin_hash,
      hasLineToken: !!h.line_channel_access_token,
    });
  } catch (err) {
    console.error("Get host profile error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
