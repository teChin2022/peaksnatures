import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { email, password, otp } = await req.json();

    if (!email || !password || !otp) {
      return NextResponse.json(
        { error: "Email, password, and verification code are required" },
        { status: 400 }
      );
    }

    // Look up OTP in DB via service role
    const serviceClient = createServiceRoleClient();
    const { data: otpRecord, error: otpError } = await serviceClient
      .from("login_otps")
      .select("*")
      .eq("email", email)
      .eq("code", otp)
      .single() as { data: { id: string; expires_at: string } | null; error: unknown };

    if (otpError || !otpRecord) {
      return NextResponse.json(
        { error: "invalid_code" },
        { status: 401 }
      );
    }

    // Check expiry
    const record = otpRecord as { id: string; expires_at: string };
    if (new Date(record.expires_at) < new Date()) {
      // Clean up expired code
      await serviceClient.from("login_otps").delete().eq("id", record.id);
      return NextResponse.json(
        { error: "code_expired" },
        { status: 401 }
      );
    }

    // OTP is valid — complete the actual login with cookie-persisted client
    const supabase = await createServerSupabaseClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      return NextResponse.json(
        { error: signInError.message },
        { status: 401 }
      );
    }

    // Delete used OTP and any other codes for this email
    await serviceClient.from("login_otps").delete().eq("email", email);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OTP] verify-otp error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
