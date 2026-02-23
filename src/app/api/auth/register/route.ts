import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .regex(
      /^(?=.*[A-Z])(?=.*[0-9])(?=.*[_#@]).{6,}$/,
      "Password must include uppercase, number, and special character (_, #, @)"
    ),
  turnstileToken: z.string(),
});

// Returns: "pass" | "fail" | "skip" (skip = Cloudflare unreachable, graceful degradation)
async function verifyTurnstileToken(token: string): Promise<"pass" | "fail" | "skip"> {
  // If no token provided (widget failed to load), skip gracefully
  if (!token) {
    console.warn("Turnstile: No token provided — widget may have failed to load. Allowing registration.");
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
    // Cloudflare is unreachable — allow registration through
    console.error("Turnstile: Cloudflare verification unreachable — allowing registration.", err);
    return "skip";
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Invalid input";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { name, email, password, turnstileToken } = parsed.data;

    // Verify Turnstile CAPTCHA token
    const captchaResult = await verifyTurnstileToken(turnstileToken);
    if (captchaResult === "fail") {
      return NextResponse.json(
        { error: "CAPTCHA verification failed" },
        { status: 403 }
      );
    }

    // Create a lightweight Supabase client with the anon key for signUp
    // (no cookies needed — signUp just creates the user and sends verification email)
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const origin = req.headers.get("origin") || req.nextUrl.origin;

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${origin}/api/auth/callback?next=/dashboard`,
      },
    });

    if (signUpError) {
      // Handle duplicate email
      if (signUpError.message === "Invalid login credentials") {
        return NextResponse.json(
          { error: "EMAIL_EXISTS" },
          { status: 409 }
        );
      }
      console.error("Supabase signUp error:", signUpError.message);
      return NextResponse.json(
        { error: signUpError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Register route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
