import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { verifyTurnstileToken } from "@/lib/turnstile";

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

    const origin = req.headers.get("origin") || req.nextUrl.origin;

    // Use SSR client so the PKCE code_verifier is persisted in response cookies
    const response = NextResponse.json({ success: true });

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${origin}/api/auth/callback?next=/dashboard`,
      },
    });

    if (signUpError) {
      // Handle duplicate email (confirmations disabled path)
      if (signUpError.message === "User already registered") {
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

    // Detect duplicate email when email confirmation is enabled:
    // Supabase returns no error but an empty identities array for existing emails.
    if (signUpData?.user && signUpData.user.identities?.length === 0) {
      return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 409 });
    }

    return response;
  } catch (error) {
    console.error("Register route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
