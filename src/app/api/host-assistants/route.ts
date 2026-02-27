import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

// GET — list assistants for the authenticated host
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only owners can list assistants
    const { data: host } = await supabase
      .from("hosts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!host) {
      return NextResponse.json({ error: "Not a host owner" }, { status: 403 });
    }

    const hostRow = host as { id: string };

    const { data: assistants, error } = await supabase
      .from("host_assistants")
      .select("id, email, name, status, invited_at, accepted_at")
      .eq("host_id", hostRow.id)
      .neq("status", "revoked")
      .order("invited_at", { ascending: false });

    if (error) {
      console.error("List assistants error:", error);
      return NextResponse.json(
        { error: "Failed to fetch assistants" },
        { status: 500 }
      );
    }

    return NextResponse.json({ assistants: assistants || [] });
  } catch (error) {
    console.error("GET /api/host-assistants error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}

// POST — invite a new assistant
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: host } = await supabase
      .from("hosts")
      .select("id, name")
      .eq("user_id", user.id)
      .single();

    if (!host) {
      return NextResponse.json({ error: "Not a host owner" }, { status: 403 });
    }

    const hostRow = host as { id: string; name: string };

    const { email, name } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Cannot invite yourself
    if (trimmedEmail === user.email) {
      return NextResponse.json(
        { error: "Cannot invite yourself" },
        { status: 400 }
      );
    }

    // Check if already invited (pending or active)
    const { data: existing } = await supabase
      .from("host_assistants")
      .select("id, status")
      .eq("host_id", hostRow.id)
      .eq("email", trimmedEmail)
      .in("status", ["pending", "active"])
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "This email has already been invited" },
        { status: 409 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // Check if the assistant email is already a registered user
    const { data: existingUsers } = await serviceClient.auth.admin.listUsers();
    const assistantUser = existingUsers?.users?.find(
      (u) => u.email === trimmedEmail
    );

    // Insert the invitation
    const { error: insertError } = await serviceClient
      .from("host_assistants")
      .insert({
        host_id: hostRow.id,
        user_id: assistantUser?.id || null,
        email: trimmedEmail,
        name: (name || "").trim() || trimmedEmail.split("@")[0],
        status: assistantUser ? "active" : "pending",
        accepted_at: assistantUser ? new Date().toISOString() : null,
      } as never);

    if (insertError) {
      console.error("Insert assistant error:", insertError);
      return NextResponse.json(
        { error: "Failed to invite assistant" },
        { status: 500 }
      );
    }

    // Send invitation email via Resend (if assistant not yet registered)
    if (!assistantUser) {
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey && apiKey !== "your_resend_api_key") {
        try {
          const { Resend } = await import("resend");
          const resend = new Resend(apiKey);
          const rawFrom =
            process.env.RESEND_FROM_EMAIL ||
            "PeaksNature <onboarding@resend.dev>";
          const fromEmail = rawFrom.replace(/["'\\n\\r\n\r]+/g, "").trim();
          const origin =
            req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "";

          await resend.emails.send({
            from: fromEmail,
            to: trimmedEmail,
            subject: `You've been invited as an assistant on PeaksNature`,
            html: `
              <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                <div style="background: #16a34a; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 22px;">Assistant Invitation</h1>
                </div>
                <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
                  <p style="font-size: 16px; color: #374151; margin-top: 0;">
                    <strong>${hostRow.name}</strong> has invited you as an assistant to help manage their homestay on PeaksNature.
                  </p>
                  <p style="font-size: 14px; color: #6b7280;">
                    To accept this invitation, register an account with this email address (${trimmedEmail}) at:
                  </p>
                  <div style="text-align: center; margin: 20px 0;">
                    <a href="${origin}/register" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                      Register on PeaksNature
                    </a>
                  </div>
                  <p style="font-size: 13px; color: #9ca3af; margin-top: 24px;">
                    If you didn't expect this invitation, you can safely ignore this email.
                  </p>
                  <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                  <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">PeaksNature — Nature Homestays in Thailand</p>
                </div>
              </div>
            `,
          });
        } catch (emailError) {
          console.error("Failed to send assistant invitation email:", emailError);
          // Don't fail the invitation if email fails
        }
      }
    }

    return NextResponse.json({
      success: true,
      activated: !!assistantUser,
    });
  } catch (error) {
    console.error("POST /api/host-assistants error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}

// PATCH — revoke an assistant
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: host } = await supabase
      .from("hosts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!host) {
      return NextResponse.json({ error: "Not a host owner" }, { status: 403 });
    }

    const hostRow = host as { id: string };
    const { assistantId, action } = await req.json();

    if (!assistantId || action !== "revoke") {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();
    const { error: updateError } = await serviceClient
      .from("host_assistants")
      .update({ status: "revoked" } as never)
      .eq("id", assistantId)
      .eq("host_id", hostRow.id);

    if (updateError) {
      console.error("Revoke assistant error:", updateError);
      return NextResponse.json(
        { error: "Failed to revoke assistant" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/host-assistants error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
