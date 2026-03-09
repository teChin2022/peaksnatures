import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { notifyAdminsNewHostRegistration } from "@/lib/notifications";
import type { Database } from "@/types/database";
import type { EmailOtpType } from "@supabase/supabase-js";
import { logEvent, EventType } from "@/lib/history-log";

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

      // Skip host creation for platform admins
      const { data: adminRecord } = await serviceClient
        .from("platform_admins")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!adminRecord) {
        // Create host record if it doesn't exist yet (first-time email verification)
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
              status: "pending",
              created_by: user.id,
            } as never);

          if (hostError) {
            console.error("Host record creation error:", hostError);
          } else {
            // Log host registration (fire-and-forget)
            logEvent({
              entityType: "host",
              entityId: user.id,
              eventType: EventType.HOST_REGISTERED,
              actorType: "host",
              actorId: user.id,
              data: { name, email: user.email },
              req,
            }).catch(() => {});

            // Fire-and-forget: notify platform admins about new registration
            notifyAdminsNewHostRegistration({
              hostName: name,
              hostEmail: user.email!,
              appUrl: origin,
            }).catch((err) => console.error("[Admin Notify] Failed:", err));
          }
        }
      }
    }

    return response;
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
