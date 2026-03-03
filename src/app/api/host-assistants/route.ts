import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

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

    const { email, name, expiryDays } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Validate expiryDays (1, 7, or 30; default 1)
    const ALLOWED_EXPIRY = [1, 7, 30];
    const expiry = ALLOWED_EXPIRY.includes(expiryDays) ? expiryDays : 1;

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

    // Enforce assistant limit (max 10 active/pending per host)
    const { count: assistantCount } = await supabase
      .from("host_assistants")
      .select("id", { count: "exact", head: true })
      .eq("host_id", hostRow.id)
      .in("status", ["pending", "active"]);

    if ((assistantCount ?? 0) >= 10) {
      return NextResponse.json(
        { error: "Maximum 10 assistants allowed" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();
    const origin =
      req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "";

    // Step 1: Ensure assistant has a Supabase account
    const assistantName = (name || "").trim() || trimmedEmail.split("@")[0];
    const { error: createUserError } =
      await serviceClient.auth.admin.createUser({
        email: trimmedEmail,
        email_confirm: true,
        user_metadata: { name: assistantName },
      });

    // Ignore "already registered" errors — that's fine
    if (
      createUserError &&
      !createUserError.message?.toLowerCase().includes("already")
    ) {
      console.error("[Assistant Invite] Create user error:", createUserError);
      return NextResponse.json(
        { error: "Failed to create assistant account" },
        { status: 500 }
      );
    }

    // Step 2: Look up the assistant's user ID via generateLink
    const { data: linkData, error: linkError } =
      await serviceClient.auth.admin.generateLink({
        type: "magiclink",
        email: trimmedEmail,
      });

    if (linkError || !linkData?.user) {
      console.error("[Assistant Invite] User lookup error:", linkError);
      return NextResponse.json(
        { error: "Failed to find assistant account" },
        { status: 500 }
      );
    }

    const assistantUserId = linkData.user.id;

    // Step 3: Generate custom invite token with configurable expiry
    const rawToken = randomUUID();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiry);

    const inviteLink = `${origin}/api/host-assistants/accept-invite?token=${rawToken}`;
    console.log(
      `[Assistant Invite] email=${trimmedEmail}, userId=${assistantUserId}, expiry=${expiry}d`
    );

    // Step 4: Insert the invitation
    const { error: insertError } = await serviceClient
      .from("host_assistants")
      .insert({
        host_id: hostRow.id,
        user_id: assistantUserId,
        email: trimmedEmail,
        name: assistantName,
        status: "pending",
        invite_token_hash: tokenHash,
        invite_expires_at: expiresAt.toISOString(),
      } as never);

    if (insertError) {
      console.error("[Assistant Invite] Insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to invite assistant" },
        { status: 500 }
      );
    }

    console.log(`[Assistant Invite] Inserted OK. Sending invite email...`);

    // Step 5: Send invitation email (locale-aware, dynamic expiry text)
    const locale = req.cookies.get("locale")?.value === "en" ? "en" : "th";
    const expiryTextMap = {
      en: { 1: "1 day", 7: "7 days", 30: "30 days" } as Record<number, string>,
      th: { 1: "1 วัน", 7: "7 วัน", 30: "30 วัน" } as Record<number, string>,
    };
    const expiryLabel = expiryTextMap[locale][expiry];

    const emailT = {
      en: {
        subject: "You've been invited as an assistant on PeaksNature",
        heading: "Assistant Invitation",
        body: (h: string) =>
          `<strong>${h}</strong> has invited you as an assistant to help manage their homestay on PeaksNature.`,
        cta: "Click the button below to accept the invitation and access the dashboard:",
        button: "Accept Invitation",
        expiry: `This link expires in ${expiryLabel}. If you didn't expect this invitation, you can safely ignore this email.`,
        footer: "PeaksNature — Nature Homestays in Thailand",
      },
      th: {
        subject: "คุณได้รับเชิญเป็นผู้ช่วยบน PeaksNature",
        heading: "คำเชิญผู้ช่วย",
        body: (h: string) =>
          `<strong>${h}</strong> ได้เชิญคุณเป็นผู้ช่วยในการจัดการโฮมสเตย์บน PeaksNature`,
        cta: "กดปุ่มด้านล่างเพื่อยอมรับคำเชิญและเข้าถึงแดชบอร์ด:",
        button: "ยอมรับคำเชิญ",
        expiry: `ลิงก์นี้จะหมดอายุใน ${expiryLabel} หากคุณไม่ได้คาดหวังคำเชิญนี้ สามารถเพิกเฉยอีเมลนี้ได้`,
        footer: "PeaksNature — โฮมสเตย์ธรรมชาติในประเทศไทย",
      },
    }[locale];

    const apiKey = (process.env.RESEND_API_KEY || "").replace(/["']/g, "").trim();

    if (apiKey && apiKey !== "your_resend_api_key") {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(apiKey);
        const DEFAULT_FROM = "PeaksNature <onboarding@resend.dev>";
        const cleaned = (process.env.RESEND_FROM_EMAIL || "")
          .replace(/["'\r\n]/g, "")
          .trim();
        const fromEmail = cleaned
          ? cleaned.replace(
              /<([^>]+)>/,
              (_, em: string) => `<${em.replace(/\s+/g, "")}>`
            )
          : DEFAULT_FROM;

        const escapedName = hostRow.name
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

        const { data: emailResult, error: emailError } =
          await resend.emails.send({
            from: fromEmail,
            to: trimmedEmail,
            subject: emailT.subject,
            html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
              <div style="background: #16a34a; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 22px;">${emailT.heading}</h1>
              </div>
              <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
                <p style="font-size: 16px; color: #374151; margin-top: 0;">
                  ${emailT.body(escapedName)}
                </p>
                <p style="font-size: 14px; color: #6b7280;">
                  ${emailT.cta}
                </p>
                <div style="text-align: center; margin: 24px 0;">
                  <a href="${inviteLink}" style="display: inline-block; background: #16a34a; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                    ${emailT.button}
                  </a>
                </div>
                <p style="font-size: 13px; color: #9ca3af; margin-top: 24px;">
                  ${emailT.expiry}
                </p>
                <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">${emailT.footer}</p>
              </div>
            </div>
          `,
          });

        if (emailError) {
          console.error(
            "[Assistant Invite] Resend API error:",
            JSON.stringify(emailError)
          );
        } else {
          console.log(
            `[Assistant Invite] Email sent OK, id=${emailResult?.id}`
          );
        }
      } catch (emailErr) {
        console.error("[Assistant Invite] Email send exception:", emailErr);
      }
    } else {
      console.log(
        "[Assistant Invite] Skipped email — RESEND_API_KEY not configured"
      );
    }

    return NextResponse.json({ success: true, activated: false });
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
