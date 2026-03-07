import { NextResponse } from "next/server";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200),
  subject: z.string().min(1).max(300),
  message: z.string().min(1).max(5000),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = contactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid form data" },
        { status: 400 }
      );
    }

    const { name, email, subject, message } = parsed.data;

    const apiKey = (process.env.RESEND_API_KEY || "").replace(/["']/g, "").trim();
    if (!apiKey || apiKey === "your_resend_api_key") {
      console.log("[Contact] Skipped — RESEND_API_KEY not configured. Would send:", { name, email, subject });
      return NextResponse.json({ success: true, demo: true });
    }

    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const DEFAULT_FROM = "PeaksNature <onboarding@resend.dev>";
    const cleaned = (process.env.RESEND_FROM_EMAIL || "").replace(/["'\r\n]/g, "").trim();
    const fromEmail = cleaned
      ? cleaned.replace(/<([^>]+)>/, (_, e: string) => `<${e.replace(/\s+/g, "")}>`)
      : DEFAULT_FROM;

    const { error } = await resend.emails.send({
      from: fromEmail,
      to: "peaksnature@gmail.com",
      replyTo: email,
      subject: `[Contact] ${subject}`,
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
            <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">Sent from PeaksNature contact form</p>
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
