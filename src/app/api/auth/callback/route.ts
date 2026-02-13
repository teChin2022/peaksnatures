import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createServerSupabaseClient();
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

    return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
