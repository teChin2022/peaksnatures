import { NextRequest, NextResponse, after } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { logEvent, EventType } from "@/lib/history-log";
import { createRateLimiter } from "@/lib/rate-limit";

// Audit F-11: the 6-digit code had no limit on guesses. A code lives 5
// minutes, so 5 tries per email per 5 minutes is 5 guesses per code at most;
// the per-address limit stops one client walking many emails.
const verifyOtpRateLimit = createRateLimiter({ limit: 20, windowMs: 60_000, name: "verify-otp" });
const otpEmailLimit = createRateLimiter({ limit: 5, windowMs: 5 * 60_000, name: "verify-otp-email" });

export async function POST(req: NextRequest) {
  const rateLimited = await verifyOtpRateLimit.check(req);
  if (rateLimited) return rateLimited;

  try {
    const { email, password, otp } = await req.json();

    if (!email || !password || !otp || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email, password, and verification code are required" },
        { status: 400 }
      );
    }

    const emailLimited = await otpEmailLimit.checkKey(`otp:${email.trim().toLowerCase()}`);
    if (emailLimited) return emailLimited;

    // Look up OTP in DB via service role
    const serviceClient = createServiceRoleClient();
    const { data: otpRecord, error: otpError } = await serviceClient
      .from("login_otps")
      .select("*")
      .eq("email", email)
      .eq("code", otp)
      .single() as { data: { id: string; expires_at: string } | null; error: unknown };

    if (otpError || !otpRecord) {
      after(async () => {
        await logEvent({
          entityType: "host",
          entityId: email,
          eventType: EventType.FAILED_LOGIN,
          actorType: "host",
          actorId: null,
          data: { email, reason: "invalid_code" },
          req,
        });
      });

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

      after(async () => {
        await logEvent({
          entityType: "host",
          entityId: email,
          eventType: EventType.FAILED_LOGIN,
          actorType: "host",
          actorId: null,
          data: { email, reason: "code_expired" },
          req,
        });
      });

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
      // One code, not Supabase's own message (F-19).
      return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    // Delete used OTP and any other codes for this email
    await serviceClient.from("login_otps").delete().eq("email", email);

    // Log host login in background
    after(async () => {
      await logEvent({
        entityType: "host",
        entityId: email,
        eventType: EventType.HOST_LOGIN,
        actorType: "host",
        actorId: null,
        data: { email },
        req,
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OTP] verify-otp error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
