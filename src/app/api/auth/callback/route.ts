import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/dashboard";
  // Prevent open redirect — only allow relative paths, block protocol-relative URLs
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  if (code) {
    // Build a Supabase client that writes cookies directly onto the response
    const response = NextResponse.redirect(`${origin}${next}`);

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

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }

    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // Create host record if it doesn't exist yet (first-time email verification)
      const serviceClient = createServiceRoleClient();
      const { data: existingHost } = await serviceClient
        .from("hosts")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!existingHost) {
        const name =
          user.user_metadata?.name || user.email?.split("@")[0] || "Host";
        const { error: hostError } = await serviceClient
          .from("hosts")
          .insert({
            user_id: user.id,
            name,
            email: user.email!,
            phone: null,
            promptpay_id: "",
          } as never);

        if (hostError) {
          console.error("Host record creation error:", hostError);
        }
      }
    }

    return response;
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
