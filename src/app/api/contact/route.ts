import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRateLimiter } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200),
  subject: z.string().min(1).max(300),
  message: z.string().min(1).max(5000),
  // Cloudflare Turnstile token. Optional — backend fails open on empty/skip.
  turnstileToken: z.string().optional(),
});

const contactRateLimit = createRateLimiter({
  limit: 3,
  windowMs: 60_000,
  name: "contact",
});

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await contactRateLimit.check(request);
    if (rateLimited) return rateLimited;

    const body = await request.json();

    // Turnstile verification — fail-open on "skip" (see src/lib/turnstile.ts).
    const captchaResult = await verifyTurnstileToken(
      typeof body?.turnstileToken === "string" ? body.turnstileToken : ""
    );
    if (captchaResult === "fail") {
      return NextResponse.json(
        { error: "CAPTCHA verification failed" },
        { status: 403 }
      );
    }

    const parsed = contactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid form data" },
        { status: 400 }
      );
    }

    const { name: rawName, email: rawEmail, subject: rawSubject, message: rawMessage } = parsed.data;
    const name = escapeHtml(rawName);
    const email = escapeHtml(rawEmail);
    const subject = escapeHtml(rawSubject);
    const message = escapeHtml(rawMessage);

    const apiKey = (process.env.RESEND_API_KEY || "").replace(/["']/g, "").trim();
    if (!apiKey || apiKey === "your_resend_api_key") {
      console.log("[Contact] Skipped — RESEND_API_KEY not configured. Would send:", { name, email, subject });
      return NextResponse.json({ success: true, demo: true });
    }

    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const DEFAULT_FROM = "Peaksnature <onboarding@resend.dev>";
    const cleaned = (process.env.RESEND_FROM_EMAIL || "").replace(/["'\r\n]/g, "").trim();
    const fromEmail = cleaned
      ? cleaned.replace(/<([^>]+)>/, (_, e: string) => `<${e.replace(/\s+/g, "")}>`)
      : DEFAULT_FROM;

    const { error } = await resend.emails.send({
      from: fromEmail,
      to: "peaksnature@gmail.com",
      replyTo: rawEmail,
      subject: `[Contact] ${rawSubject}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #166534; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">New Contact Message</h1>
          </div>
          <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #6b7280; width: 100px;">Name</td><td style="padding: 8px 0; font-weight: bold;">${name}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Email</td><td style="padding: 8px 0;">${email}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Subject</td><td style="padding: 8px 0;">${subject}</td></tr>
            </table>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            <p style="color: #374151; white-space: pre-wrap;">${message}</p>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">Sent from Peaksnature contact form</p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("[Contact] Resend error:", JSON.stringify(error));
      return NextResponse.json({ error: "Failed to send" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Contact] Exception:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
