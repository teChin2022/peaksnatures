import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Verify credentials using a non-cookie Supabase client (throwaway)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

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

    // Sign out the throwaway client immediately
    await supabase.auth.signOut();

    // Generate 6-digit OTP code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    // Store OTP in DB (delete old codes for this email first)
    const serviceClient = createServiceRoleClient();
    await serviceClient.from("login_otps").delete().eq("email", email);
    const { error: insertError } = await serviceClient
      .from("login_otps")
      .insert({ email, code, expires_at: expiresAt } as never);

    if (insertError) {
      console.error("[OTP] Failed to store OTP:", insertError);
      return NextResponse.json(
        { error: "Failed to generate verification code" },
        { status: 500 }
      );
    }

    // Send OTP email via Resend
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey && apiKey !== "your_resend_api_key") {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(apiKey);
        const fromEmail =
          process.env.RESEND_FROM_EMAIL ||
          "PeaksNature <bookings@peaksnature.com>";

        await resend.emails.send({
          from: fromEmail,
          to: email,
          subject: "Your PeaksNature Login Code",
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
              <div style="background: #16a34a; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 22px;">🔐 Login Verification</h1>
              </div>
              <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px; text-align: center;">
                <p style="font-size: 16px; color: #374151; margin-top: 0;">Your verification code is:</p>
                <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 20px 0;">
                  <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #111827;">${code}</span>
                </div>
                <p style="font-size: 14px; color: #6b7280;">This code expires in <strong>5 minutes</strong>.</p>
                <p style="font-size: 13px; color: #9ca3af; margin-top: 24px;">If you didn't request this code, you can safely ignore this email.</p>
                <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">PeaksNature — Nature Homestays in Thailand</p>
              </div>
            </div>
          `,
        });
        console.log(`[OTP] Code sent to ${email}`);
      } catch (emailError) {
        console.error("[OTP] Email send error:", emailError);
        // Don't fail the request — OTP is stored, host may retry
      }
    } else {
      console.log(`[OTP] Resend not configured. Code for ${email}: ${code}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OTP] send-otp error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
