import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    const serviceClient = createServiceRoleClient();

    // Generate magic link (only works if user exists in Supabase)
    const origin =
      req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "";

    const { data: linkData, error: linkError } =
      await serviceClient.auth.admin.generateLink({
        type: "magiclink",
        email: trimmedEmail,
        options: {
          redirectTo: `${origin}/api/auth/callback?next=/dashboard`,
        },
      });

    if (linkError || !linkData) {
      console.error("[Magic Link] Generate error:", linkError);
      return NextResponse.json(
        { error: "no_account" },
        { status: 404 }
      );
    }

    const hashedToken = linkData.properties.hashed_token;
    const magicLink = `${origin}/api/auth/callback?token_hash=${hashedToken}&type=magiclink&next=/dashboard`;

    // Send email via Resend
    const apiKey = (process.env.RESEND_API_KEY || "")
      .replace(/["']/g, "")
      .trim();

    if (!apiKey || apiKey === "your_resend_api_key") {
      console.log(`[Magic Link] Resend not configured. Link: ${magicLink}`);
      return NextResponse.json({ success: true });
    }

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

    const locale = req.cookies.get("locale")?.value === "en" ? "en" : "th";
    const emailT = {
      en: {
        subject: "Your PeaksNature Login Link",
        heading: "🔐 Login Link",
        body: "Click the button below to sign in to your PeaksNature account:",
        button: "Sign In to PeaksNature",
        expiry:
          "This link expires in 24 hours. If you didn't request this, you can safely ignore this email.",
        footer: "PeaksNature — Nature Homestays in Thailand",
      },
      th: {
        subject: "ลิงก์เข้าสู่ระบบ PeaksNature",
        heading: "🔐 ลิงก์เข้าสู่ระบบ",
        body: "กดปุ่มด้านล่างเพื่อเข้าสู่ระบบบัญชี PeaksNature ของคุณ:",
        button: "เข้าสู่ระบบ PeaksNature",
        expiry:
          "ลิงก์นี้จะหมดอายุใน 24 ชั่วโมง หากคุณไม่ได้ขอลิงก์นี้ สามารถเพิกเฉยอีเมลนี้ได้",
        footer: "PeaksNature — โฮมสเตย์ธรรมชาติในประเทศไทย",
      },
    }[locale];

    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: trimmedEmail,
      subject: emailT.subject,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <div style="background: #16a34a; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">${emailT.heading}</h1>
          </div>
          <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px; text-align: center;">
            <p style="font-size: 16px; color: #374151; margin-top: 0;">${emailT.body}</p>
            <div style="margin: 24px 0;">
              <a href="${magicLink}" style="display: inline-block; background: #16a34a; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                ${emailT.button}
              </a>
            </div>
            <p style="font-size: 13px; color: #9ca3af; margin-top: 24px;">${emailT.expiry}</p>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
            <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">${emailT.footer}</p>
          </div>
        </div>
      `,
    });

    if (emailError) {
      console.error("[Magic Link] Resend error:", JSON.stringify(emailError));
      return NextResponse.json(
        { error: "Failed to send login link" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Magic Link] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
