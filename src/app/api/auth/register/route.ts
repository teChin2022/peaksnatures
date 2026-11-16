import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { isValidPhone } from "@/lib/utils";
import { SITE_URL } from "@/lib/seo";

const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  phone: z.string().refine(isValidPhone, "Phone number must be 10 digits"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[A-Z])(?=.*[0-9])(?=.*[_#@]).{8,}$/,
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

    const { name, email, phone, password, turnstileToken } = parsed.data;

    // Verify Turnstile CAPTCHA token
    const captchaResult = await verifyTurnstileToken(turnstileToken);
    if (captchaResult === "fail") {
      return NextResponse.json(
        { error: "CAPTCHA verification failed" },
        { status: 403 }
      );
    }

    // The app's own URL, never the request's Origin (see send-magic-link).
    const origin = SITE_URL;

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

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, phone },
        emailRedirectTo: `${origin}/api/auth/callback?next=/dashboard`,
      },
    });

    if (signUpError) {
      // An existing account answers like a new one (F-19): the page says
      // "if this email is new, check your inbox", which holds for both.
      if (signUpError.message === "User already registered") {
        return response;
      }
      console.error("Supabase signUp error:", signUpError.message);
      return NextResponse.json(
        { error: "REGISTRATION_FAILED" },
        { status: 400 }
      );
    }

    // With email confirmation on, Supabase answers an existing email with an
    // empty identities list and no error; it gets the same response too (F-19).
    return response;
  } catch (error) {
    console.error("Register route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
