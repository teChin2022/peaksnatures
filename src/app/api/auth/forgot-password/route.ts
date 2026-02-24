import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email"),
  turnstileToken: z.string(),
});

// Returns: "pass" | "fail" | "skip" (skip = Cloudflare unreachable, graceful degradation)
async function verifyTurnstileToken(token: string): Promise<"pass" | "fail" | "skip"> {
  if (!token) {
    console.warn("Turnstile: No token provided — widget may have failed to load. Allowing request.");
    return "skip";
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY is not configured — skipping verification");
    return "skip";
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
        signal: AbortSignal.timeout(5000),
      }
    );

    const data = await response.json();
    return data.success === true ? "pass" : "fail";
  } catch (err) {
    console.error("Turnstile: Cloudflare verification unreachable — allowing request.", err);
    return "skip";
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Invalid input";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { email, turnstileToken } = parsed.data;

    // Verify Turnstile CAPTCHA token
    const captchaResult = await verifyTurnstileToken(turnstileToken);
    if (captchaResult === "fail") {
      return NextResponse.json(
        { error: "CAPTCHA verification failed" },
        { status: 403 }
      );
    }

    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const origin = req.headers.get("origin") || req.nextUrl.origin;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/api/auth/callback?next=/reset-password`,
    });

    if (error) {
      console.error("Supabase resetPasswordForEmail error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Forgot password route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
