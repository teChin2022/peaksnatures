import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next") ?? "/dashboard";
  // Prevent open redirect — only allow relative paths, block protocol-relative URLs
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  if (code || (token_hash && type)) {
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

    let authError: Error | null = null;

    if (code) {
      // PKCE flow — works when user clicks the link in the same browser
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      authError = error;
    }

    if ((!code || authError) && token_hash && type) {
      // Token hash fallback — works even when opened in a different browser
      const { error } = await supabase.auth.verifyOtp({ token_hash, type });
      authError = error;
    }

    if (authError) {
      console.error("Auth callback error:", authError.message);
      return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }

    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const serviceClient = createServiceRoleClient();

      // Always activate any pending assistant invitations for this user
      const { data: pendingInvites } = await serviceClient
        .from("host_assistants")
        .select("id")
        .eq("email", user.email!)
        .eq("status", "pending");

      if (pendingInvites && pendingInvites.length > 0) {
        const ids = (pendingInvites as { id: string }[]).map((i) => i.id);
        await serviceClient
          .from("host_assistants")
          .update({
            user_id: user.id,
            status: "active",
            accepted_at: new Date().toISOString(),
          } as never)
          .in("id", ids);
        console.log(`[Auth Callback] Activated ${ids.length} assistant invitation(s) for ${user.email}`);
      }

      // Create host record if it doesn't exist yet (first-time registration)
      const { data: existingHost } = await serviceClient
        .from("hosts")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!existingHost && !(pendingInvites && pendingInvites.length > 0)) {
        // Normal host registration — create host record (skip if user is an invited assistant)
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
