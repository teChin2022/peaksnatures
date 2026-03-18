import { format, parseISO } from "date-fns";
import { th as thLocale, enUS as enLocale } from "date-fns/locale";
import type { Booking, Homestay, Host, Room } from "@/types/database";
import { getProvinceLabel } from "@/lib/provinces";

interface BookingDetails {
  booking: Booking;
  homestay: Homestay;
  host: Host;
  room?: Room;
}

function formatBookingDate(dateStr: string, locale: string): string {
  const date = parseISO(dateStr);
  if (locale === "th") {
    const formatted = format(date, "d MMM yyyy", { locale: thLocale });
    const ceYear = date.getFullYear();
    const beYear = ceYear + 543;
    return formatted.replace(String(ceYear), String(beYear));
  }
  return format(date, "MMM d, yyyy", { locale: enLocale });
}

// ============================================================
// EMAIL NOTIFICATION (Resend)
// ============================================================
export async function sendBookingConfirmationEmail(details: BookingDetails, locale: string = "th", type: "confirmed" | "pending" = "confirmed") {
  const apiKey = (process.env.RESEND_API_KEY || "").replace(/["']/g, "").trim();
  if (!apiKey) {
    return { success: true, demo: true };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const { booking, homestay, room } = details;

    const DEFAULT_FROM = "Peaksnature <onboarding@resend.dev>";
    const cleaned = (process.env.RESEND_FROM_EMAIL || "").replace(/["'\r\n]/g, "").trim();
    const fromEmail = cleaned
      ? cleaned.replace(/<([^>]+)>/, (_, email: string) => `<${email.replace(/\s+/g, "")}>`)
      : DEFAULT_FROM;
    const checkInFmt = formatBookingDate(booking.check_in, locale);
    const checkOutFmt = formatBookingDate(booking.check_out, locale);
    const isTh = locale === "th";

    const subject = type === "confirmed"
      ? (isTh ? `การจองของคุณได้รับการยืนยันแล้ว – ${homestay.name}` : `Your Booking Has Been Confirmed – ${homestay.name}`)
      : (isTh ? `ได้รับการจองแล้ว — รอการตรวจสอบ — ${homestay.name}` : `Booking Received — Pending Review — ${homestay.name}`);

    let html: string;

    if (type === "confirmed") {
      const depositRows = (booking as Record<string, unknown>).payment_type === "deposit" ? `
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "ยอดที่ชำระ" : "Amount Paid"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">฿${((booking as Record<string, unknown>).amount_paid as number || 0).toLocaleString()}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "ยอดค้างชำระ" : "Balance Due"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">฿${(booking.total_price - ((booking as Record<string, unknown>).amount_paid as number || 0)).toLocaleString()} (${isTh ? "ชำระเมื่อเข้าพัก" : "pay on arrival"})</td></tr>` : "";

      html = `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <div style="background: #f9fafb; padding: 32px 24px; border-bottom: 1px solid #e5e7eb;">
            <h1 style="color: #111827; margin: 0; font-size: 22px; font-weight: 700;">${isTh ? "การจองของคุณได้รับการยืนยันแล้ว" : "Your Booking Has Been Confirmed"}</h1>
          </div>
          <div style="padding: 32px 24px;">
            <p style="font-size: 16px; color: #111827; margin: 0 0 16px;">${isTh ? `เรียน คุณ${booking.guest_name}` : `Dear ${booking.guest_name}`},</p>
            <p style="font-size: 14px; color: #374151; margin: 0 0 8px;">${isTh ? "ขอขอบพระคุณที่เลือกจองที่พักผ่าน Peaksnature" : "Thank you for booking your stay through Peaksnature."}</p>
            <p style="font-size: 14px; color: #374151; margin: 0 0 24px;">${isTh ? `การจองของคุณสำหรับ ${homestay.name} ได้รับการยืนยันเรียบร้อยแล้ว โดยมีรายละเอียดดังต่อไปนี้` : `Your booking at ${homestay.name} has been confirmed. Here are the details:`}</p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <h2 style="color: #111827; font-size: 16px; font-weight: 700; margin: 0 0 16px;">${isTh ? "รายละเอียดการจอง" : "Booking Details"}</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "รหัสการจอง" : "Booking ID"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${booking.id}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "ผู้เข้าพัก" : "Guest"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px;">${booking.guest_name}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "ประเภทห้องพัก" : "Room Type"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px;">${room?.name || "Standard"}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "วันเช็กอิน" : "Check-in"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px;">${checkInFmt}${homestay.check_in_time ? ` (${isTh ? "เช็กอินได้ตั้งแต่" : "from"} ${homestay.check_in_time}${isTh ? " น." : ""})` : ""}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "วันเช็กเอาต์" : "Check-out"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px;">${checkOutFmt}${homestay.check_out_time ? ` (${isTh ? "เช็กเอาต์ก่อน" : "before"} ${homestay.check_out_time}${isTh ? " น." : ""})` : ""}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "จำนวนผู้เข้าพัก" : "Guests"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px;">${booking.num_guests} ${isTh ? "ท่าน" : ""}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "ยอดชำระรวม" : "Total"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 700;">฿${booking.total_price.toLocaleString()}</td></tr>
                ${depositRows}
              </table>
            </div>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <h2 style="color: #111827; font-size: 16px; font-weight: 700; margin: 0 0 8px;">${isTh ? "สถานที่เข้าพัก" : "Property"}</h2>
              <p style="color: #111827; font-size: 14px; margin: 0 0 4px; font-weight: 600;">${homestay.name}</p>
              <p style="color: #6b7280; font-size: 14px; margin: 0;">${homestay.location}</p>
            </div>
            <div style="border-top: 1px solid #e5e7eb; padding-top: 24px;">
              <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">${isTh ? "การชำระเงินของคุณได้รับการยืนยันเรียบร้อยแล้ว" : "Your payment has been confirmed."}</p>
              <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">${isTh ? "หากท่านมีข้อสงสัยเพิ่มเติม หรือต้องการความช่วยเหลือเกี่ยวกับการเข้าพัก สามารถติดต่อเจ้าของที่พักหรือทีมงานของเราได้ทุกเมื่อ" : "If you have any questions or need assistance with your stay, feel free to contact the property host or our team at any time."}</p>
              <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">${isTh ? "ขอขอบพระคุณอีกครั้งสำหรับความไว้วางใจ" : "Thank you again for your trust."}</p>
              <p style="font-size: 14px; color: #374151; margin: 0 0 24px;">${isTh ? `${homestay.name} หวังเป็นอย่างยิ่งว่าจะได้เป็นส่วนหนึ่งของประสบการณ์การพักผ่อนท่ามกลางธรรมชาติของคุณ` : `${homestay.name} hopes to be part of your nature retreat experience.`}</p>
              <p style="font-size: 14px; color: #374151; margin: 0;">${isTh ? "ด้วยความเคารพ" : "Best regards,"}</p>
              <p style="font-size: 14px; color: #111827; font-weight: 700; margin: 4px 0 0;">${homestay.name}</p>
              <p style="font-size: 12px; color: #9ca3af; margin: 4px 0 0;">Nature Homestays in Thailand</p>
            </div>
          </div>
        </div>`;
    } else {
      html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f59e0b; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">${isTh ? "ได้รับการจองแล้ว — รอการตรวจสอบ" : "Booking Received — Pending Review"}</h1>
          </div>
          <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; margin-top: 0;">${isTh ? `สวัสดีคุณ ${booking.guest_name}` : `Hi ${booking.guest_name}`},</p>
            <h2 style="margin-top: 0;">${homestay.name}</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "รหัสการจอง" : "Booking ID"}</td><td style="padding: 8px 0; font-weight: bold;">${booking.id}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "ผู้เข้าพัก" : "Guest"}</td><td style="padding: 8px 0;">${booking.guest_name}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "ห้องพัก" : "Room"}</td><td style="padding: 8px 0;">${room?.name || "Standard"}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "เช็คอิน" : "Check-in"}</td><td style="padding: 8px 0;">${checkInFmt}${homestay.check_in_time ? ` (${isTh ? "หลัง" : "after"} ${homestay.check_in_time} ${isTh ? "น." : ""})` : ""}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "เช็คเอาท์" : "Check-out"}</td><td style="padding: 8px 0;">${checkOutFmt}${homestay.check_out_time ? ` (${isTh ? "ก่อน" : "before"} ${homestay.check_out_time} ${isTh ? "น." : ""})` : ""}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "จำนวนผู้เข้าพัก" : "Guests"}</td><td style="padding: 8px 0;">${booking.num_guests}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "ยอดรวม" : "Total"}</td><td style="padding: 8px 0; font-weight: bold; color: ${homestay.theme_color};">฿${booking.total_price.toLocaleString()}</td></tr>
              ${(booking as Record<string, unknown>).payment_type === "deposit" ? `
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "ยอดที่ชำระ" : "Amount Paid"}</td><td style="padding: 8px 0; font-weight: bold; color: ${homestay.theme_color};">฿${((booking as Record<string, unknown>).amount_paid as number || 0).toLocaleString()}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "ยอดค้างชำระ" : "Balance Due"}</td><td style="padding: 8px 0; font-weight: bold; color: #d97706;">฿${(booking.total_price - ((booking as Record<string, unknown>).amount_paid as number || 0)).toLocaleString()} (${isTh ? "ชำระเมื่อเข้าพัก" : "pay on arrival"})</td></tr>
              ` : ""}
            </table>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            <p style="color: #6b7280; font-size: 14px;">${homestay.location}</p>
            <p style="color: #6b7280; font-size: 14px;">${isTh ? "สลิปการชำระเงินไม่สามารถตรวจสอบอัตโนมัติได้ เจ้าของที่พักจะตรวจสอบและยืนยันให้ในเร็วๆ นี้" : "Your payment slip could not be auto-verified. The host will review and confirm your booking shortly."}</p>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">Peaksnature — Nature Homestays in Thailand</p>
          </div>
        </div>`;
    }

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: booking.guest_email,
      subject,
      html,
    });

    if (error) {
      console.error("[Email] Resend API error:", JSON.stringify(error));
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error("[Email] Exception:", error);
    return { success: false, error };
  }
}

// ============================================================
// BOOKING STATUS UPDATE EMAIL (sent to guest after host review)
// ============================================================
export async function sendBookingStatusUpdateEmail(
  details: BookingDetails,
  newStatus: "confirmed" | "cancelled",
  locale: string = "th",
  reason?: string
) {
  const apiKey = (process.env.RESEND_API_KEY || "").replace(/["']/g, "").trim();
  if (!apiKey) {
    console.log("[Email] Skipped — RESEND_API_KEY not configured. Would send status update to:", details.booking.guest_email);
    return { success: true, demo: true };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const { booking, homestay, room } = details;

    const DEFAULT_FROM = "Peaksnature <onboarding@resend.dev>";
    const cleaned = (process.env.RESEND_FROM_EMAIL || "").replace(/["'\r\n]/g, "").trim();
    const fromEmail = cleaned
      ? cleaned.replace(/<([^>]+)>/, (_, email: string) => `<${email.replace(/\s+/g, "")}>`)
      : DEFAULT_FROM;
    const checkInFmt = formatBookingDate(booking.check_in, locale);
    const checkOutFmt = formatBookingDate(booking.check_out, locale);
    const isTh = locale === "th";
    const isConfirmed = newStatus === "confirmed";

    const subject = isConfirmed
      ? (isTh ? `การจองของคุณได้รับการยืนยันแล้ว – ${homestay.name}` : `Your Booking Has Been Confirmed – ${homestay.name}`)
      : (isTh ? `อัปเดตการจอง — ${homestay.name}` : `Booking Update — ${homestay.name}`);

    const reasonHtml = !isConfirmed && reason
      ? `<div style="margin: 16px 0; padding: 12px 16px; background: #fef2f2; border-left: 4px solid #ef4444; border-radius: 4px;">
           <p style="margin: 0; font-size: 14px; color: #991b1b; font-weight: 600;">${isTh ? "เหตุผล" : "Reason"}:</p>
           <p style="margin: 4px 0 0; font-size: 14px; color: #7f1d1d;">${reason}</p>
         </div>`
      : "";

    let statusHtml: string;

    if (isConfirmed) {
      statusHtml = `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <div style="background: #f9fafb; padding: 32px 24px; border-bottom: 1px solid #e5e7eb;">
            <h1 style="color: #111827; margin: 0; font-size: 22px; font-weight: 700;">${isTh ? "การจองของคุณได้รับการยืนยันแล้ว" : "Your Booking Has Been Confirmed"}</h1>
          </div>
          <div style="padding: 32px 24px;">
            <p style="font-size: 16px; color: #111827; margin: 0 0 16px;">${isTh ? `เรียน คุณ${booking.guest_name}` : `Dear ${booking.guest_name}`},</p>
            <p style="font-size: 14px; color: #374151; margin: 0 0 8px;">${isTh ? "ขอขอบพระคุณที่เลือกจองที่พักผ่าน Peaksnature" : "Thank you for booking your stay through Peaksnature."}</p>
            <p style="font-size: 14px; color: #374151; margin: 0 0 24px;">${isTh ? `การจองของคุณสำหรับ ${homestay.name} ได้รับการยืนยันเรียบร้อยแล้ว โดยมีรายละเอียดดังต่อไปนี้` : `Your booking at ${homestay.name} has been confirmed. Here are the details:`}</p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <h2 style="color: #111827; font-size: 16px; font-weight: 700; margin: 0 0 16px;">${isTh ? "รายละเอียดการจอง" : "Booking Details"}</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "รหัสการจอง" : "Booking ID"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${booking.id}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "ผู้เข้าพัก" : "Guest"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px;">${booking.guest_name}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "ประเภทห้องพัก" : "Room Type"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px;">${room?.name || "Standard"}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "วันเช็กอิน" : "Check-in"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px;">${checkInFmt}${homestay.check_in_time ? ` (${isTh ? "เช็กอินได้ตั้งแต่" : "from"} ${homestay.check_in_time}${isTh ? " น." : ""})` : ""}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "วันเช็กเอาต์" : "Check-out"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px;">${checkOutFmt}${homestay.check_out_time ? ` (${isTh ? "เช็กเอาต์ก่อน" : "before"} ${homestay.check_out_time}${isTh ? " น." : ""})` : ""}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "จำนวนผู้เข้าพัก" : "Guests"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px;">${booking.num_guests} ${isTh ? "ท่าน" : ""}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "ยอดชำระรวม" : "Total"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 700;">฿${booking.total_price.toLocaleString()}</td></tr>
              </table>
            </div>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <h2 style="color: #111827; font-size: 16px; font-weight: 700; margin: 0 0 8px;">${isTh ? "สถานที่เข้าพัก" : "Property"}</h2>
              <p style="color: #111827; font-size: 14px; margin: 0 0 4px; font-weight: 600;">${homestay.name}</p>
              <p style="color: #6b7280; font-size: 14px; margin: 0;">${homestay.location}</p>
            </div>
            <div style="border-top: 1px solid #e5e7eb; padding-top: 24px;">
              <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">${isTh ? "การชำระเงินของคุณได้รับการยืนยันเรียบร้อยแล้ว" : "Your payment has been confirmed."}</p>
              <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">${isTh ? "หากท่านมีข้อสงสัยเพิ่มเติม หรือต้องการความช่วยเหลือเกี่ยวกับการเข้าพัก สามารถติดต่อเจ้าของที่พักหรือทีมงานของเราได้ทุกเมื่อ" : "If you have any questions or need assistance with your stay, feel free to contact the property host or our team at any time."}</p>
              <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">${isTh ? "ขอขอบพระคุณอีกครั้งสำหรับความไว้วางใจ" : "Thank you again for your trust."}</p>
              <p style="font-size: 14px; color: #374151; margin: 0 0 24px;">${isTh ? `${homestay.name} หวังเป็นอย่างยิ่งว่าจะได้เป็นส่วนหนึ่งของประสบการณ์การพักผ่อนท่ามกลางธรรมชาติของคุณ` : `${homestay.name} hopes to be part of your nature retreat experience.`}</p>
              <p style="font-size: 14px; color: #374151; margin: 0;">${isTh ? "ด้วยความเคารพ" : "Best regards,"}</p>
              <p style="font-size: 14px; color: #111827; font-weight: 700; margin: 4px 0 0;">${homestay.name}</p>
              <p style="font-size: 12px; color: #9ca3af; margin: 4px 0 0;">Nature Homestays in Thailand</p>
            </div>
          </div>
        </div>`;
    } else {
      statusHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #ef4444; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">${isTh ? "การจองถูกยกเลิก" : "Booking Cancelled"}</h1>
          </div>
          <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; margin-top: 0;">${isTh ? `สวัสดีคุณ ${booking.guest_name}` : `Hi ${booking.guest_name}`},</p>
            <p style="color: #374151; font-size: 14px;">${isTh ? "ขออภัย การจองของคุณไม่สามารถยืนยันได้" : "Unfortunately, your booking could not be confirmed."}</p>
            ${reasonHtml}
            <h2 style="margin-top: 16px;">${homestay.name}</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "รหัสการจอง" : "Booking ID"}</td><td style="padding: 8px 0; font-weight: bold;">${booking.id}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "ห้องพัก" : "Room"}</td><td style="padding: 8px 0;">${room?.name || "Standard"}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "เช็คอิน" : "Check-in"}</td><td style="padding: 8px 0;">${checkInFmt}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "เช็คเอาท์" : "Check-out"}</td><td style="padding: 8px 0;">${checkOutFmt}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "ยอดรวม" : "Total"}</td><td style="padding: 8px 0; font-weight: bold;">฿${booking.total_price.toLocaleString()}</td></tr>
            </table>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            <p style="color: #6b7280; font-size: 14px;">${homestay.location}</p>
            <p style="color: #6b7280; font-size: 14px;">${isTh ? "หากมีข้อสงสัย กรุณาติดต่อเจ้าของที่พักโดยตรง" : "If you have any questions, please contact the host directly."}</p>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">Peaksnature — Nature Homestays in Thailand</p>
          </div>
        </div>`;
    }

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: booking.guest_email,
      subject,
      html: statusHtml,
    });

    if (error) {
      console.error("[Email] Status update send error:", JSON.stringify(error));
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error("[Email] Status update exception:", error);
    return { success: false, error };
  }
}

// ============================================================
// WEB PUSH NOTIFICATION (via web-push library, sent from Next.js server)
// ============================================================
export async function sendHostPushNotification(
  details: BookingDetails,
  type: "confirmed" | "flagged" = "confirmed"
) {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.log("[Push] Skipped — VAPID keys not configured");
    return { success: false, error: "VAPID keys not configured" };
  }

  try {
    const webpush = await import("web-push");
    webpush.setVapidDetails(
      "mailto:team@peaksnature.com",
      vapidPublicKey,
      vapidPrivateKey
    );

    const { createServiceRoleClient } = await import("@/lib/supabase/server");
    const supabase = createServiceRoleClient();

    // Fetch all push subscriptions for this host
    const { data: subscriptions, error: dbError } = await supabase
      .from("push_subscriptions" as never)
      .select("id, endpoint, p256dh, auth")
      .eq("host_id", details.host.id);

    if (dbError) {
      console.error("[Push] DB error:", dbError);
      return { success: false, error: "Database error" };
    }

    const subs = subscriptions as unknown as { id: string; endpoint: string; p256dh: string; auth: string }[];

    if (!subs || subs.length === 0) {
      console.log("[Push] No subscriptions for host:", details.host.id);
      return { success: false, error: "No subscriptions" };
    }

    const { booking, homestay, room } = details;
    const checkIn = new Date(booking.check_in);
    const checkOut = new Date(booking.check_out);
    const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    const title = type === "confirmed"
      ? `🎉 การจองใหม่ — ยืนยันแล้ว!`
      : `⚠️ การจองใหม่ — รอตรวจสอบ`;

    const paymentStatus = type === "confirmed"
      ? `✅ ชำระเงินแล้ว (ยืนยันผ่าน EasySlip)`
      : `❌ ยืนยันสลิปไม่สำเร็จ — กรุณาตรวจสอบใน Dashboard`;

    const body = [
      `━━━━━━━━━━━━━━━━`,
      ``,
      `🏠 โฮมสเตย์: ${homestay.name}`,
      `🔖 Booking ID: ${booking.id.slice(0, 8)}...`,
      ``,
      `👤 ข้อมูลผู้จอง`,
      `   ชื่อ: ${booking.guest_name}`,
      `   อีเมล: ${booking.guest_email}`,
      `   โทร: ${booking.guest_phone}`,
      ...(booking.guest_province ? [`   จังหวัด: ${getProvinceLabel(booking.guest_province, "th")}`] : []),
      ``,
      `📋 รายละเอียดการจอง`,
      `   🛏️ ห้อง: ${room?.name || "Standard"}`,
      `   📅 เช็คอิน: ${formatBookingDate(booking.check_in, "th")}`,
      `   📅 เช็คเอาท์: ${formatBookingDate(booking.check_out, "th")}`,
      `   🌙 จำนวน: ${nights} คืน`,
      `   👥 ผู้เข้าพัก: ${booking.num_guests} ท่าน`,
      ``,
      `💰 การชำระเงิน`,
      `   ยอดรวม: ฿${booking.total_price.toLocaleString()}`,
      ...(room ? [`   (฿${room.price_per_night.toLocaleString()} × ${nights} คืน)`] : []),
      ...((booking as Record<string, unknown>).payment_type === "deposit" ? [
        `   💳 ยอดที่ชำระ: ฿${((booking as Record<string, unknown>).amount_paid as number || 0).toLocaleString()} (มัดจำ)`,
        `   ⏳ ยอดค้าง: ฿${(booking.total_price - ((booking as Record<string, unknown>).amount_paid as number || 0)).toLocaleString()} (ชำระเมื่อเข้าพัก)`,
      ] : []),
      `   ${paymentStatus}`,
      ``,
      `━━━━━━━━━━━━━━━━`,
      `📍 ${homestay.location}`,
    ].join("\n");

    const payload = JSON.stringify({ title, body, url: "/dashboard", tag: `booking-${Date.now()}` });

    let sent = 0;
    const expired: string[] = [];

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err: unknown) {
        const pushErr = err as { statusCode?: number };
        if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
          expired.push(sub.id);
        } else {
          console.error("[Push] Send failed:", pushErr);
        }
      }
    }

    // Clean up expired subscriptions
    if (expired.length > 0) {
      await supabase.from("push_subscriptions" as never).delete().in("id", expired);
    }

    return { success: true, data: { sent, total: subs.length, expired: expired.length } };
  } catch (error) {
    console.error("[Push] Exception:", error);
    return { success: false, error };
  }
}

// ============================================================
// LINE NOTIFICATION (LINE Messaging API)
// ============================================================
export async function sendHostCancellationLineNotification(
  details: BookingDetails,
  reason?: string
) {
  const channelToken = details.host.line_channel_access_token;
  const lineUserId = details.host.line_user_id;

  if (!channelToken || !lineUserId) {
    console.log("[Skip] Host LINE not configured for cancellation:", details.host.name);
    return { success: false, error: "Host LINE credentials not configured" };
  }

  try {
    const { booking, homestay, room } = details;

    const checkIn = new Date(booking.check_in);
    const checkOut = new Date(booking.check_out);
    const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    const messageText = [
      `❌ แขกยกเลิกการจอง`,
      `━━━━━━━━━━━━━━━━`,
      ``,
      `🏠 โฮมสเตย์: ${homestay.name}`,
      `🔑 Booking ID: ${booking.id.slice(0, 8)}...`,
      ``,
      `👤 ข้อมูลผู้จอง`,
      `   ชื่อ: ${booking.guest_name}`,
      `   อีเมล: ${booking.guest_email}`,
      `   โทร: ${booking.guest_phone}`,
      ``,
      `📋 รายละเอียดการจอง`,
      `   🛏️ ห้อง: ${room?.name || "Standard"}`,
      `   📅 เช็คอิน: ${formatBookingDate(booking.check_in, "th")}`,
      `   📅 เช็คเอาท์: ${formatBookingDate(booking.check_out, "th")}`,
      `   🌙 จำนวน: ${nights} คืน`,
      `   💰 ยอดรวม: ฿${booking.total_price.toLocaleString()}`,
      ``,
      `💸 ข้อมูลการคืนเงิน`,
      `   ชำระแบบ: ${booking.payment_type === "deposit" ? "มัดจำ" : "เต็มจำนวน"}`,
      `   ยอดที่ชำระแล้ว: ฿${(booking.amount_paid || 0).toLocaleString()}`,
      `   💰 ยอดคืน: ฿${(booking.amount_paid || 0).toLocaleString()}`,
      ...(reason ? [``, `📝 เหตุผล: ${reason}`] : []),
      ``,
      `━━━━━━━━━━━━━━━━`,
      `วันที่ดังกล่าวเปิดให้จองอีกครั้งแล้ว`,
    ].join("\n");

    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelToken}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: "text", text: messageText }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("LINE cancellation notification error:", errorData);
      return { success: false, error: errorData };
    }

    return { success: true };
  } catch (error) {
    console.error("LINE cancellation notification error:", error);
    return { success: false, error };
  }
}

export async function sendHostLineNotification(
  details: BookingDetails,
  type: "confirmed" | "flagged" = "confirmed"
) {
  const channelToken = details.host.line_channel_access_token;
  const lineUserId = details.host.line_user_id;

  if (!channelToken || !lineUserId) {
    console.log("[Skip] Host LINE not configured:", details.host.name, {
      hasToken: !!channelToken,
      hasUserId: !!lineUserId,
    });
    return { success: false, error: "Host LINE credentials not configured" };
  }

  try {
    const { booking, homestay, room } = details;

    // Calculate nights
    const checkIn = new Date(booking.check_in);
    const checkOut = new Date(booking.check_out);
    const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    const header = type === "confirmed"
      ? `🎉 การจองใหม่ — ยืนยันแล้ว!`
      : `⚠️ การจองใหม่ — รอตรวจสอบ`;

    const paymentStatus = type === "confirmed"
      ? `✅ ชำระเงินแล้ว (ยืนยันผ่าน EasySlip)`
      : `❌ ยืนยันสลิปไม่สำเร็จ — กรุณาตรวจสอบใน Dashboard`;

    const messageText = [
      header,
      `━━━━━━━━━━━━━━━━`,
      ``,
      `🏠 โฮมสเตย์: ${homestay.name}`,
      `� Booking ID: ${booking.id.slice(0, 8)}...`,
      ``,
      `� ข้อมูลผู้จอง`,
      `   ชื่อ: ${booking.guest_name}`,
      `   อีเมล: ${booking.guest_email}`,
      `   โทร: ${booking.guest_phone}`,
      ...(booking.guest_province ? [`   จังหวัด: ${getProvinceLabel(booking.guest_province, "th")}`] : []),
      ``,
      `📋 รายละเอียดการจอง`,
      `   🛏️ ห้อง: ${room?.name || "Standard"}`,
      `   📅 เช็คอิน: ${formatBookingDate(booking.check_in, "th")}`,
      `   📅 เช็คเอาท์: ${formatBookingDate(booking.check_out, "th")}`,
      `   🌙 จำนวน: ${nights} คืน`,
      `   👥 ผู้เข้าพัก: ${booking.num_guests} ท่าน`,
      ``,
      `💰 การชำระเงิน`,
      `   ยอดรวม: ฿${booking.total_price.toLocaleString()}`,
      ...(room ? [`   (฿${room.price_per_night.toLocaleString()} × ${nights} คืน)`] : []),
      ...((booking as Record<string, unknown>).payment_type === "deposit" ? [
        `   💳 ยอดที่ชำระ: ฿${((booking as Record<string, unknown>).amount_paid as number || 0).toLocaleString()} (มัดจำ)`,
        `   ⏳ ยอดค้าง: ฿${(booking.total_price - ((booking as Record<string, unknown>).amount_paid as number || 0)).toLocaleString()} (ชำระเมื่อเข้าพัก)`,
      ] : []),
      `   ${paymentStatus}`,
      ``,
      `━━━━━━━━━━━━━━━━`,
      `📍 ${homestay.location}`,
    ].join("\n");

    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelToken}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [
          {
            type: "text",
            text: messageText,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("LINE API error:", errorData);
      return { success: false, error: errorData };
    }

    return { success: true };
  } catch (error) {
    console.error("LINE notification error:", error);
    return { success: false, error };
  }
}

// ============================================================
// ADMIN NOTIFICATIONS — Host Registration
// ============================================================

interface NewHostInfo {
  hostName: string;
  hostEmail: string;
  appUrl?: string;
}

export async function notifyAdminsNewHostRegistration(info: NewHostInfo) {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: admins } = await supabase
      .from("platform_admins")
      .select("email, line_user_id, line_channel_access_token");

    if (!admins || admins.length === 0) {
      console.log("[Admin Notify] No platform admins found — skipping notification");
      return;
    }

    const appUrl = info.appUrl || process.env.NEXT_PUBLIC_APP_URL || "";
    const reviewLink = appUrl ? `${appUrl}/admin/hosts?status=pending` : "";

    for (const admin of admins as { email: string; line_user_id: string | null; line_channel_access_token: string | null }[]) {
      // Send LINE if configured
      if (admin.line_user_id && admin.line_channel_access_token) {
        try {
          const lineMsg = [
            `🆕 โฮสต์ใหม่สมัครเข้ามา`,
            `━━━━━━━━━━━━━━━━`,
            ``,
            `👤 ชื่อ: ${info.hostName}`,
            `📧 อีเมล: ${info.hostEmail}`,
            ``,
            `กรุณาตรวจสอบและอนุมัติที่ Admin Panel`,
            ...(reviewLink ? [`🔗 ${reviewLink}`] : []),
          ].join("\n");

          await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${admin.line_channel_access_token}`,
            },
            body: JSON.stringify({
              to: admin.line_user_id,
              messages: [{ type: "text", text: lineMsg }],
            }),
          });
          console.log(`[Admin Notify] LINE sent to admin: ${admin.email}`);
        } catch (err) {
          console.error(`[Admin Notify] LINE failed for ${admin.email}:`, err);
        }
      }

      // Always send email
      try {
        const apiKey = (process.env.RESEND_API_KEY || "").replace(/["']/g, "").trim();
        if (!apiKey) {
          console.log(`[Admin Notify] Email skipped — RESEND_API_KEY not configured. Would send to: ${admin.email}`);
          continue;
        }
        const { Resend } = await import("resend");
        const resend = new Resend(apiKey);

        const DEFAULT_FROM = "Peaksnature <onboarding@resend.dev>";
        const cleaned = (process.env.RESEND_FROM_EMAIL || "").replace(/["'\r\n]/g, "").trim();
        const fromEmail = cleaned
          ? cleaned.replace(/<([^>]+)>/, (_, email: string) => `<${email.replace(/\s+/g, "")}>`)
          : DEFAULT_FROM;

        await resend.emails.send({
          from: fromEmail,
          to: admin.email,
          subject: `New host registration – ${info.hostName}`,
          html: `
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
              <div style="background: #f9fafb; padding: 32px 24px; border-bottom: 1px solid #e5e7eb;">
                <h1 style="color: #111827; margin: 0; font-size: 22px; font-weight: 700;">New Host Registration</h1>
              </div>
              <div style="padding: 32px 24px;">
                <p style="font-size: 14px; color: #374151; margin: 0 0 24px;">A new host has registered and is waiting for your approval.</p>
                <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Name</td><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${info.hostName}</td></tr>
                    <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Email</td><td style="padding: 8px 0; color: #111827; font-size: 14px;">${info.hostEmail}</td></tr>
                  </table>
                </div>
                ${reviewLink ? `<a href="${reviewLink}" style="display: inline-block; background: #111827; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Review in Admin Panel</a>` : ""}
                <div style="border-top: 1px solid #e5e7eb; padding-top: 24px; margin-top: 24px;">
                  <p style="font-size: 14px; color: #111827; font-weight: 700; margin: 0;">Peaksnature</p>
                  <p style="font-size: 12px; color: #9ca3af; margin: 4px 0 0;">Nature Homestays in Thailand</p>
                </div>
              </div>
            </div>
          `,
        });
        console.log(`[Admin Notify] Email sent to admin: ${admin.email}`);
      } catch (err) {
        console.error(`[Admin Notify] Email failed for ${admin.email}:`, err);
      }
    }
  } catch (error) {
    console.error("[Admin Notify] Error:", error);
  }
}

// ============================================================
// HOST APPROVAL / REJECTION EMAILS
// ============================================================

export async function sendHostApprovalEmail(hostEmail: string, hostName: string) {
  const apiKey = (process.env.RESEND_API_KEY || "").replace(/["']/g, "").trim();
  if (!apiKey) {
    console.log("[Email] Skipped — RESEND_API_KEY not configured. Would send approval to:", hostEmail);
    return { success: true, demo: true };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const DEFAULT_FROM = "Peaksnature <onboarding@resend.dev>";
    const cleaned = (process.env.RESEND_FROM_EMAIL || "").replace(/["'\r\n]/g, "").trim();
    const fromEmail = cleaned
      ? cleaned.replace(/<([^>]+)>/, (_, email: string) => `<${email.replace(/\s+/g, "")}>`)
      : DEFAULT_FROM;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    await resend.emails.send({
      from: fromEmail,
      to: hostEmail,
      subject: "บัญชีโฮสต์ของคุณได้รับการอนุมัติแล้ว – Peaksnature",
      html: `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <div style="background: #f9fafb; padding: 32px 24px; border-bottom: 1px solid #e5e7eb;">
            <h1 style="color: #111827; margin: 0; font-size: 22px; font-weight: 700;">บัญชีได้รับการอนุมัติแล้ว</h1>
          </div>
          <div style="padding: 32px 24px;">
            <p style="font-size: 16px; color: #111827; margin: 0 0 16px;">เรียน คุณ${hostName},</p>
            <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">บัญชีโฮสต์ของคุณบน Peaksnature ได้รับการอนุมัติเรียบร้อยแล้ว คุณสามารถเข้าสู่ระบบและเริ่มจัดการโฮมสเตย์ของคุณได้ทันที</p>
            <p style="font-size: 14px; color: #6b7280; margin: 0 0 24px;">Your host account on Peaksnature has been approved! You can now log in and start managing your homestay.</p>
            ${appUrl ? `<a href="${appUrl}/login" style="display: inline-block; background: #111827; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">เข้าสู่ระบบ / Log In</a>` : ""}
            <div style="border-top: 1px solid #e5e7eb; padding-top: 24px; margin-top: 24px;">
              <p style="font-size: 14px; color: #374151; margin: 0;">ด้วยความเคารพ</p>
              <p style="font-size: 14px; color: #111827; font-weight: 700; margin: 4px 0 0;">Peaksnature</p>
              <p style="font-size: 12px; color: #9ca3af; margin: 4px 0 0;">Nature Homestays in Thailand</p>
            </div>
          </div>
        </div>
      `,
    });
    console.log(`[Email] Approval sent to: ${hostEmail}`);
    return { success: true };
  } catch (error) {
    console.error("[Email] Approval email error:", error);
    return { success: false, error };
  }
}

// ============================================================
// DATE CHANGE — LINE Notification to Host
// ============================================================
export async function sendDateChangeLineNotification(
  details: BookingDetails,
  oldCheckIn: string,
  oldCheckOut: string,
  newCheckIn: string,
  newCheckOut: string,
  priceDifference: number,
  newTotalPrice: number,
  newRoomName?: string,
  paymentInfo?: {
    amountPaid: number;
    additionalPayment: number;
    paymentOption: "full" | "deposit";
    depositAvailable: boolean;
    newDeposit: number;
    fullOutstanding: number;
    paymentType: string;
  },
) {
  const channelToken = details.host.line_channel_access_token;
  const lineUserId = details.host.line_user_id;

  if (!channelToken || !lineUserId) {
    console.log("[Skip] Host LINE not configured for date change:", details.host.name);
    return { success: false, error: "Host LINE credentials not configured" };
  }

  try {
    const { booking, homestay, room } = details;

    const oldNights = Math.round((new Date(oldCheckOut).getTime() - new Date(oldCheckIn).getTime()) / (1000 * 60 * 60 * 24));
    const newNights = Math.round((new Date(newCheckOut).getTime() - new Date(newCheckIn).getTime()) / (1000 * 60 * 60 * 24));

    const roomChangeLine = newRoomName
      ? `🛏️ ห้องใหม่: ${newRoomName} (เดิม: ${room?.name || "Standard"})`
      : `🛏️ ห้อง: ${room?.name || "Standard"}`;

    // Build payment summary lines
    const paymentLines: string[] = [];
    if (paymentInfo) {
      const { amountPaid, additionalPayment, paymentOption, depositAvailable, newDeposit, fullOutstanding, paymentType } = paymentInfo;
      paymentLines.push(`💳 ประเภทการชำระ: ${paymentType === "deposit" ? "มัดจำ" : "เต็มจำนวน"}`);
      paymentLines.push(`💰 ยอดที่ชำระแล้ว: ฿${amountPaid.toLocaleString()}`);
      if (priceDifference > 0) {
        paymentLines.push(`💰 ส่วนต่างราคา: +฿${priceDifference.toLocaleString()}`);
      } else if (priceDifference < 0) {
        paymentLines.push(`💰 ส่วนต่างราคา: -฿${Math.abs(priceDifference).toLocaleString()}`);
      } else {
        paymentLines.push(`💰 ส่วนต่างราคา: ฿0 (เท่าเดิม)`);
      }
      if (additionalPayment > 0) {
        if (depositAvailable && paymentOption === "deposit") {
          paymentLines.push(`✅ ชำระเพิ่ม (มัดจำ): ฿${additionalPayment.toLocaleString()}`);
          const remaining = Math.max(0, newTotalPrice - amountPaid - additionalPayment);
          if (remaining > 0) {
            paymentLines.push(`⏳ ยอดคงเหลือ (ชำระวันเข้าพัก): ฿${remaining.toLocaleString()}`);
          }
        } else {
          paymentLines.push(`✅ ชำระเพิ่ม (เต็มจำนวน): ฿${additionalPayment.toLocaleString()}`);
        }
        paymentLines.push(`🧾 สลิปยืนยันแล้ว`);
      } else if (fullOutstanding === 0 && priceDifference <= 0) {
        paymentLines.push(`✅ ไม่ต้องชำระเพิ่ม`);
      }
    } else {
      // Fallback for no payment info
      if (priceDifference > 0) {
        paymentLines.push(`� ส่วนต่าง: +฿${priceDifference.toLocaleString()} (ชำระแล้ว)`);
      } else if (priceDifference < 0) {
        paymentLines.push(`💰 ส่วนต่าง: -฿${Math.abs(priceDifference).toLocaleString()}`);
      } else {
        paymentLines.push(`💰 ราคาเท่าเดิม`);
      }
    }

    const messageText = [
      `📅 แขกขอเปลี่ยน${newRoomName ? "ห้อง/วันเข้าพัก" : "วันเข้าพัก"}`,
      `━━━━━━━━━━━━━━━━`,
      ``,
      `🏠 โฮมสเตย์: ${homestay.name}`,
      `🔑 Booking ID: ${booking.id.slice(0, 8)}...`,
      ``,
      `👤 ผู้จอง: ${booking.guest_name}`,
      roomChangeLine,
      ``,
      `📋 วันเดิม`,
      `   📅 ${formatBookingDate(oldCheckIn, "th")} → ${formatBookingDate(oldCheckOut, "th")} (${oldNights} คืน)`,
      `   💰 ราคาเดิม: ฿${booking.total_price.toLocaleString()}`,
      ``,
      `📋 วันใหม่ที่ขอ`,
      `   📅 ${formatBookingDate(newCheckIn, "th")} → ${formatBookingDate(newCheckOut, "th")} (${newNights} คืน)`,
      `   💰 ราคาใหม่: ฿${newTotalPrice.toLocaleString()}`,
      ``,
      `━━━━━━━━━━━━━━━━`,
      `📊 สรุปการชำระเงิน`,
      ...paymentLines,
      ``,
      `━━━━━━━━━━━━━━━━`,
      `กรุณาอนุมัติหรือปฏิเสธใน Dashboard`,
    ].join("\n");

    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelToken}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: "text", text: messageText }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("LINE date change notification error:", errorData);
      return { success: false, error: errorData };
    }

    return { success: true };
  } catch (error) {
    console.error("LINE date change notification error:", error);
    return { success: false, error };
  }
}

// ============================================================
// DATE CHANGE — Email to Guest (approved/rejected)
// ============================================================
export async function sendDateChangeEmailToGuest(
  details: BookingDetails,
  status: "approved" | "rejected",
  oldCheckIn: string,
  oldCheckOut: string,
  newCheckIn: string,
  newCheckOut: string,
  newTotalPrice: number,
  locale: string = "th",
  rejectReason?: string,
  roomChangeInfo?: { oldRoomName: string; newRoomName: string },
  roomName?: string,
  paymentInfo?: {
    oldTotalPrice: number;
    priceDifference: number;
    amountPaid: number;
    additionalPayment: number;
    newAmountPaid: number;
    remainingBalance: number;
  },
) {
  const apiKey = (process.env.RESEND_API_KEY || "").replace(/["']/g, "").trim();
  if (!apiKey) {
    return { success: true, demo: true };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const { booking, homestay } = details;
    const isTh = locale === "th";

    const DEFAULT_FROM = "Peaksnature <onboarding@resend.dev>";
    const cleaned = (process.env.RESEND_FROM_EMAIL || "").replace(/["'\r\n]/g, "").trim();
    const fromEmail = cleaned
      ? cleaned.replace(/<([^>]+)>/, (_, email: string) => `<${email.replace(/\s+/g, "")}>`)
      : DEFAULT_FROM;

    const isApproved = status === "approved";
    const subject = isApproved
      ? (isTh ? `อนุมัติเปลี่ยนวันเข้าพักแล้ว – ${homestay.name}` : `Date Change Approved – ${homestay.name}`)
      : (isTh ? `ปฏิเสธการเปลี่ยนวันเข้าพัก – ${homestay.name}` : `Date Change Rejected – ${homestay.name}`);

    let dcHtml: string;

    if (isApproved) {
      dcHtml = `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <div style="background: #f9fafb; padding: 32px 24px; border-bottom: 1px solid #e5e7eb;">
            <h1 style="color: #111827; margin: 0; font-size: 22px; font-weight: 700;">${isTh ? "อนุมัติเปลี่ยนวันเข้าพักแล้ว" : "Date Change Approved"}</h1>
          </div>
          <div style="padding: 32px 24px;">
            <p style="font-size: 16px; color: #111827; margin: 0 0 16px;">${isTh ? `เรียน คุณ${booking.guest_name}` : `Dear ${booking.guest_name}`},</p>
            <p style="font-size: 14px; color: #374151; margin: 0 0 24px;">${isTh ? `คำขอเปลี่ยนวันเข้าพักของคุณที่ ${homestay.name} ได้รับการอนุมัติแล้ว` : `Your date change request at ${homestay.name} has been approved.`}</p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <h2 style="color: #111827; font-size: 16px; font-weight: 700; margin: 0 0 16px;">${isTh ? "รายละเอียด" : "Details"}</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "รหัสการจอง" : "Booking ID"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${booking.id}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "วันเดิม" : "Original Dates"}</td><td style="padding: 8px 0; color: #9ca3af; font-size: 14px; text-decoration: line-through;">${formatBookingDate(oldCheckIn, locale)} - ${formatBookingDate(oldCheckOut, locale)}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "วันใหม่" : "New Dates"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${formatBookingDate(newCheckIn, locale)} - ${formatBookingDate(newCheckOut, locale)}</td></tr>
                ${roomChangeInfo ? `<tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "ห้องเดิม" : "Original Room"}</td><td style="padding: 8px 0; color: #9ca3af; font-size: 14px; text-decoration: line-through;">${roomChangeInfo.oldRoomName}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "ห้องใหม่" : "New Room"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${roomChangeInfo.newRoomName}</td></tr>` : roomName ? `<tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "ห้องพัก" : "Room"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${roomName}</td></tr>` : ""}
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "ยอดรวมใหม่" : "New Total"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 700;">฿${newTotalPrice.toLocaleString()}</td></tr>
              </table>
            </div>
            ${paymentInfo ? `
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <h2 style="color: #111827; font-size: 16px; font-weight: 700; margin: 0 0 16px;">${isTh ? "สรุปการชำระเงิน" : "Payment Summary"}</h2>
              <table style="width: 100%; border-collapse: collapse;">
                ${paymentInfo.priceDifference !== 0 ? `<tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">${isTh ? "ราคาเดิม" : "Original Price"}</td><td style="padding: 6px 0; color: #9ca3af; font-size: 14px; text-decoration: line-through;">฿${paymentInfo.oldTotalPrice.toLocaleString()}</td></tr>
                <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">${isTh ? "ราคาใหม่" : "New Price"}</td><td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">฿${newTotalPrice.toLocaleString()}</td></tr>
                <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">${isTh ? "ส่วนต่าง" : "Difference"}</td><td style="padding: 6px 0; color: ${paymentInfo.priceDifference > 0 ? "#dc2626" : "#16a34a"}; font-size: 14px; font-weight: 600;">${paymentInfo.priceDifference > 0 ? "+" : ""}฿${paymentInfo.priceDifference.toLocaleString()}</td></tr>` : ""}
                <tr style="border-top: 1px solid #d1fae5;"><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">${isTh ? "ยอดที่ชำระแล้วก่อนหน้า" : "Previously Paid"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px;">฿${paymentInfo.amountPaid.toLocaleString()}</td></tr>
                ${paymentInfo.additionalPayment > 0 ? `<tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">${isTh ? "ชำระเพิ่มครั้งนี้" : "Additional Payment"}</td><td style="padding: 6px 0; color: #16a34a; font-size: 14px; font-weight: 600;">฿${paymentInfo.additionalPayment.toLocaleString()} ✓</td></tr>` : ""}
                <tr style="border-top: 1px solid #d1fae5;"><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 700;">${isTh ? "ยอดชำระแล้วทั้งหมด" : "Total Paid"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 700;">฿${paymentInfo.newAmountPaid.toLocaleString()}</td></tr>
                ${paymentInfo.remainingBalance > 0 ? `<tr><td style="padding: 6px 0; color: #b45309; font-size: 14px; font-weight: 600;">${isTh ? "ยอดคงเหลือ (ชำระวันเข้าพัก)" : "Remaining Balance (pay at check-in)"}</td><td style="padding: 6px 0; color: #b45309; font-size: 14px; font-weight: 600;">฿${paymentInfo.remainingBalance.toLocaleString()}</td></tr>` : ""}
              </table>
            </div>` : ""}
            <div style="border-top: 1px solid #e5e7eb; padding-top: 24px;">
              <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">${isTh ? "วันเข้าพักของคุณได้รับการอัปเดตเรียบร้อยแล้ว" : "Your booking dates have been updated successfully."}</p>
              <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">${isTh ? "หากท่านมีข้อสงสัยเพิ่มเติม สามารถติดต่อเจ้าของที่พักหรือทีมงานของเราได้ทุกเมื่อ" : "If you have any questions, feel free to contact the property host or our team at any time."}</p>
              <p style="font-size: 14px; color: #374151; margin: 0;">${isTh ? "ด้วยความเคารพ" : "Best regards,"}</p>
              <p style="font-size: 14px; color: #111827; font-weight: 700; margin: 4px 0 0;">${homestay.name}</p>
              <p style="font-size: 12px; color: #9ca3af; margin: 4px 0 0;">Nature Homestays in Thailand</p>
            </div>
          </div>
        </div>`;
    } else {
      dcHtml = `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <div style="background: #f9fafb; padding: 32px 24px; border-bottom: 1px solid #e5e7eb;">
            <h1 style="color: #111827; margin: 0; font-size: 22px; font-weight: 700;">${isTh ? "ปฏิเสธการเปลี่ยนวันเข้าพัก" : "Date Change Rejected"}</h1>
          </div>
          <div style="padding: 32px 24px;">
            <p style="font-size: 16px; color: #111827; margin: 0 0 16px;">${isTh ? `เรียน คุณ${booking.guest_name}` : `Dear ${booking.guest_name}`},</p>
            <p style="font-size: 14px; color: #374151; margin: 0 0 24px;">${isTh ? `คำขอเปลี่ยนวันเข้าพักของคุณที่ ${homestay.name} ไม่ได้รับการอนุมัติ` : `Your date change request at ${homestay.name} has been rejected.`}</p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <h2 style="color: #111827; font-size: 16px; font-weight: 700; margin: 0 0 16px;">${isTh ? "รายละเอียด" : "Details"}</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "รหัสการจอง" : "Booking ID"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${booking.id}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "วันที่ขอเปลี่ยน" : "Requested Dates"}</td><td style="padding: 8px 0; color: #9ca3af; font-size: 14px;">${formatBookingDate(newCheckIn, locale)} - ${formatBookingDate(newCheckOut, locale)}</td></tr>
              </table>
            </div>
            ${rejectReason ? `
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <p style="margin: 0 0 4px; font-weight: 600; color: #111827; font-size: 14px;">${isTh ? "เหตุผล" : "Reason"}:</p>
              <p style="margin: 0; color: #374151; font-size: 14px;">${rejectReason}</p>
            </div>` : ""}
            <div style="border-top: 1px solid #e5e7eb; padding-top: 24px;">
              <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">${isTh ? "วันเข้าพักเดิมของคุณยังคงเดิม" : "Your original dates remain unchanged."}</p>
              <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">${isTh ? "หากท่านมีข้อสงสัยเพิ่มเติม สามารถติดต่อเจ้าของที่พักหรือทีมงานของเราได้ทุกเมื่อ" : "If you have any questions, feel free to contact the property host or our team at any time."}</p>
              <p style="font-size: 14px; color: #374151; margin: 0;">${isTh ? "ด้วยความเคารพ" : "Best regards,"}</p>
              <p style="font-size: 14px; color: #111827; font-weight: 700; margin: 4px 0 0;">${homestay.name}</p>
              <p style="font-size: 12px; color: #9ca3af; margin: 4px 0 0;">Nature Homestays in Thailand</p>
            </div>
          </div>
        </div>`;
    }

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: booking.guest_email,
      subject,
      html: dcHtml,
    });

    if (error) {
      console.error("[Email] Date change email error:", JSON.stringify(error));
      return { success: false, error };
    }
    return { success: true, data };
  } catch (error) {
    console.error("[Email] Date change email exception:", error);
    return { success: false, error };
  }
}

export async function sendHostRejectionEmail(hostEmail: string, hostName: string) {
  const apiKey = (process.env.RESEND_API_KEY || "").replace(/["']/g, "").trim();
  if (!apiKey) {
    console.log("[Email] Skipped — RESEND_API_KEY not configured. Would send rejection to:", hostEmail);
    return { success: true, demo: true };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const DEFAULT_FROM = "Peaksnature <onboarding@resend.dev>";
    const cleaned = (process.env.RESEND_FROM_EMAIL || "").replace(/["'\r\n]/g, "").trim();
    const fromEmail = cleaned
      ? cleaned.replace(/<([^>]+)>/, (_, email: string) => `<${email.replace(/\s+/g, "")}>`)
      : DEFAULT_FROM;

    await resend.emails.send({
      from: fromEmail,
      to: hostEmail,
      subject: "แจ้งผลการสมัครบัญชีโฮสต์ – Peaksnature",
      html: `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <div style="background: #f9fafb; padding: 32px 24px; border-bottom: 1px solid #e5e7eb;">
            <h1 style="color: #111827; margin: 0; font-size: 22px; font-weight: 700;">แจ้งผลการสมัคร</h1>
          </div>
          <div style="padding: 32px 24px;">
            <p style="font-size: 16px; color: #111827; margin: 0 0 16px;">เรียน คุณ${hostName},</p>
            <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">ขออภัย บัญชีโฮสต์ของคุณไม่ผ่านการอนุมัติในครั้งนี้ หากมีข้อสงสัย กรุณาติดต่อทีมงาน</p>
            <p style="font-size: 14px; color: #6b7280; margin: 0 0 24px;">Unfortunately, your host application was not approved at this time. If you have questions, please contact our team.</p>
            <div style="border-top: 1px solid #e5e7eb; padding-top: 24px;">
              <p style="font-size: 14px; color: #374151; margin: 0;">ด้วยความเคารพ</p>
              <p style="font-size: 14px; color: #111827; font-weight: 700; margin: 4px 0 0;">Peaksnature</p>
              <p style="font-size: 12px; color: #9ca3af; margin: 4px 0 0;">Nature Homestays in Thailand</p>
            </div>
          </div>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error("[Email] Rejection email error:", error);
    return { success: false, error };
  }
}
