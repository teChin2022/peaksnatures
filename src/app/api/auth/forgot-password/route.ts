import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { verifyTurnstileToken } from "@/lib/turnstile";

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email"),
  turnstileToken: z.string(),
});

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

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/api/auth/callback?next=/reset-password`,
    });

    if (error) {
      console.error("Supabase resetPasswordForEmail error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return response;
  } catch (error) {
    console.error("Forgot password route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
