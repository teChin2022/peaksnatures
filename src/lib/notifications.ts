import { format, parseISO } from "date-fns";
import { th as thLocale, enUS as enLocale } from "date-fns/locale";
import type { Booking, Homestay, Host, PromoCode, Room } from "@/types/database";
import { getProvinceLabel } from "@/lib/provinces";
import { localizeStrings } from "@/lib/translation/localize-strings";
import type { SupportedLocale } from "@/lib/translation/types";

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

type SelectedOptionForEmail = {
  id?: string;
  name: string;
  price: number;
  unit_price?: number;
  pricing_type?: "per_night" | "per_time";
};

function renderSelectedOptionsHtmlList(opts: SelectedOptionForEmail[], nights: number, isTh: boolean): string {
  return opts.map((o, i) => {
    let detail: string;
    if (o.pricing_type === "per_time") {
      detail = `฿${o.price.toLocaleString()} ${isTh ? "ต่อการเข้าพัก" : "per stay"}`;
    } else if (o.pricing_type === "per_night" && o.unit_price !== undefined) {
      detail = `฿${o.unit_price.toLocaleString()}${isTh ? "/คืน" : "/night"} × ${nights} = +฿${o.price.toLocaleString()}`;
    } else {
      detail = `+฿${o.price.toLocaleString()}`;
    }
    const marginTop = i === 0 ? "0" : "8px";
    return `<div style="margin-top: ${marginTop};"><div style="color: #111827; font-size: 14px;">${o.name}</div><div style="color: #6b7280; font-size: 12px; margin-top: 2px;">${detail}</div></div>`;
  }).join("");
}

function bookingNights(checkIn: string, checkOut: string): number {
  return Math.max(
    1,
    Math.round((parseISO(checkOut).getTime() - parseISO(checkIn).getTime()) / 86400000)
  );
}

interface LocalizedGuestEmailContent {
  homestayName: string;
  homestayLocation: string;
  roomName: string | null;
  selectedOptions: SelectedOptionForEmail[];
}

async function localizeGuestEmailContent(
  homestay: Homestay,
  roomName: string | null,
  selectedOptions: SelectedOptionForEmail[],
  locale: string,
): Promise<LocalizedGuestEmailContent> {
  if (locale !== "en") {
    return {
      homestayName: homestay.name,
      homestayLocation: homestay.location,
      roomName,
      selectedOptions,
    };
  }

  const strings: Record<string, string | null> = {
    homestayName: homestay.name,
    homestayLocation: homestay.location,
    roomName,
  };
  selectedOptions.forEach((o, i) => {
    strings[`option_${i}`] = o.name;
  });

  const translated = await localizeStrings(
    `email:homestay:${homestay.id}`,
    strings,
    "en" as SupportedLocale,
  );

  return {
    homestayName: translated.homestayName ?? homestay.name,
    homestayLocation: translated.homestayLocation ?? homestay.location,
    roomName: translated.roomName ?? roomName,
    selectedOptions: selectedOptions.map((o, i) => ({
      ...o,
      name: translated[`option_${i}`] ?? o.name,
    })),
  };
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
    const nights = bookingNights(booking.check_in, booking.check_out);

    const localized = await localizeGuestEmailContent(
      homestay,
      room?.name ?? null,
      Array.isArray(booking.selected_options) ? (booking.selected_options as SelectedOptionForEmail[]) : [],
      locale,
    );

    const subject = type === "confirmed"
      ? (isTh ? `การจองของคุณได้รับการยืนยันแล้ว – ${localized.homestayName}` : `Your Booking Has Been Confirmed – ${localized.homestayName}`)
      : (isTh ? `ได้รับการจองแล้ว — รอการตรวจสอบ — ${localized.homestayName}` : `Booking Received — Pending Review — ${localized.homestayName}`);

    const discountAmount = (booking as Record<string, unknown>).discount_amount as number | null | undefined;
    const discountRow = discountAmount && discountAmount > 0 ? `
                <tr><td style="padding: 10px 12px 10px 0; color: #6b7280; font-size: 13px; vertical-align: top;">${isTh ? "ยอดก่อนหักส่วนลด" : "Subtotal"}</td><td style="padding: 10px 0; color: #111827; font-size: 14px;">฿${(booking.total_price + discountAmount).toLocaleString()}</td></tr>
                <tr><td style="padding: 10px 12px 10px 0; color: #047857; font-size: 13px; vertical-align: top;">${isTh ? "ส่วนลด" : "Discount"}</td><td style="padding: 10px 0; color: #047857; font-size: 14px; font-weight: 600;">−฿${discountAmount.toLocaleString()}</td></tr>` : "";
    const discountRowSimple = discountAmount && discountAmount > 0 ? `
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "ส่วนลด" : "Discount"}</td><td style="padding: 8px 0; color: #047857; font-weight: bold;">−฿${discountAmount.toLocaleString()}</td></tr>` : "";

    let html: string;

    if (type === "confirmed") {
      const labelStyle = `padding: 10px 12px 10px 0; color: #6b7280; font-size: 13px; vertical-align: top; line-height: 1.4;`;
      const valueStyle = `padding: 10px 0; color: #111827; font-size: 14px; vertical-align: top; line-height: 1.5;`;
      const totalLabelStyle = `padding: 16px 12px 0 0; color: #6b7280; font-size: 14px; vertical-align: middle; border-top: 1px solid #e5e7eb;`;
      const totalValueStyle = `padding: 16px 0 0; color: #111827; font-size: 18px; font-weight: 700; vertical-align: middle; border-top: 1px solid #e5e7eb; text-align: right;`;
      const depositRows = (booking as Record<string, unknown>).payment_type === "deposit" ? `
                <tr><td style="${labelStyle}">${isTh ? "ยอดที่ชำระ" : "Amount Paid"}</td><td style="${valueStyle} font-weight: 600;">฿${((booking as Record<string, unknown>).amount_paid as number || 0).toLocaleString()}</td></tr>
                <tr><td style="${labelStyle}">${isTh ? "ยอดค้างชำระ" : "Balance Due"}</td><td style="${valueStyle} font-weight: 600;">฿${(booking.total_price - ((booking as Record<string, unknown>).amount_paid as number || 0)).toLocaleString()} <span style="color: #6b7280; font-size: 12px;">(${isTh ? "ชำระเมื่อเข้าพัก" : "pay on arrival"})</span></td></tr>` : "";

      html = `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <div style="background: #f9fafb; padding: 32px 24px; border-bottom: 1px solid #e5e7eb;">
            <h1 style="color: #111827; margin: 0; font-size: 22px; font-weight: 700;">${isTh ? "การจองของคุณได้รับการยืนยันแล้ว" : "Your Booking Has Been Confirmed"}</h1>
          </div>
          <div style="padding: 32px 24px;">
            <p style="font-size: 16px; color: #111827; margin: 0 0 16px;">${isTh ? `เรียน คุณ${booking.guest_name}` : `Dear ${booking.guest_name}`},</p>
            <p style="font-size: 14px; color: #374151; margin: 0 0 8px; line-height: 1.6;">${isTh ? "ขอขอบพระคุณที่เลือกจองที่พักผ่าน Peaksnature" : "Thank you for booking your stay through Peaksnature."}</p>
            <p style="font-size: 14px; color: #374151; margin: 0 0 24px; line-height: 1.6;">${isTh ? `การจองของคุณสำหรับ ${localized.homestayName} ได้รับการยืนยันเรียบร้อยแล้ว โดยมีรายละเอียดดังต่อไปนี้` : `Your booking at ${localized.homestayName} has been confirmed. Here are the details:`}</p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px 24px; margin-bottom: 24px;">
              <h2 style="color: #111827; font-size: 16px; font-weight: 700; margin: 0 0 16px;">${isTh ? "รายละเอียดการจอง" : "Booking Details"}</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <colgroup><col style="width: 38%;"><col></colgroup>
                <tr><td style="${labelStyle}">${isTh ? "รหัสการจอง" : "Booking ID"}</td><td style="${valueStyle} font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; color: #374151;">${booking.id}</td></tr>
                <tr><td style="${labelStyle}">${isTh ? "ผู้เข้าพัก" : "Guest"}</td><td style="${valueStyle}">${booking.guest_name}</td></tr>
                <tr><td style="${labelStyle}">${isTh ? "ประเภทห้องพัก" : "Room Type"}</td><td style="${valueStyle}">${localized.roomName || "Standard"}</td></tr>
                <tr><td style="${labelStyle}">${isTh ? "วันเช็กอิน" : "Check-in"}</td><td style="${valueStyle}">${checkInFmt}${homestay.check_in_time ? `<div style="color: #6b7280; font-size: 12px; margin-top: 2px;">${isTh ? "เช็กอินได้ตั้งแต่" : "from"} ${homestay.check_in_time}${isTh ? " น." : ""}</div>` : ""}</td></tr>
                <tr><td style="${labelStyle}">${isTh ? "วันเช็กเอาต์" : "Check-out"}</td><td style="${valueStyle}">${checkOutFmt}${homestay.check_out_time ? `<div style="color: #6b7280; font-size: 12px; margin-top: 2px;">${isTh ? "เช็กเอาต์ก่อน" : "before"} ${homestay.check_out_time}${isTh ? " น." : ""}</div>` : ""}</td></tr>
                <tr><td style="${labelStyle}">${isTh ? "จำนวนผู้เข้าพัก" : "Guests"}</td><td style="${valueStyle}">${booking.num_guests} ${isTh ? "ท่าน" : ""}${booking.guest_pricing_label ? ` (${booking.guest_pricing_label})` : ""}</td></tr>
                ${localized.selectedOptions.length > 0 ? `<tr><td style="${labelStyle}">${isTh ? "บริการเพิ่มเติม" : "Services"}</td><td style="${valueStyle}">${renderSelectedOptionsHtmlList(localized.selectedOptions, nights, isTh)}</td></tr>` : ""}
                ${discountRow}
                <tr><td style="${totalLabelStyle}">${isTh ? "ยอดชำระรวม" : "Total"}</td><td style="${totalValueStyle}">฿${booking.total_price.toLocaleString()}</td></tr>
                ${depositRows}
              </table>
            </div>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <h2 style="color: #111827; font-size: 16px; font-weight: 700; margin: 0 0 8px;">${isTh ? "สถานที่เข้าพัก" : "Property"}</h2>
              <p style="color: #111827; font-size: 14px; margin: 0 0 4px; font-weight: 600;">${localized.homestayName}</p>
              <p style="color: #6b7280; font-size: 14px; margin: 0;">${localized.homestayLocation}</p>
            </div>
            <div style="border-top: 1px solid #e5e7eb; padding-top: 24px;">
              <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">${isTh ? "การชำระเงินของคุณได้รับการยืนยันเรียบร้อยแล้ว" : "Your payment has been confirmed."}</p>
              <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">${isTh ? "หากท่านมีข้อสงสัยเพิ่มเติม หรือต้องการความช่วยเหลือเกี่ยวกับการเข้าพัก สามารถติดต่อเจ้าของที่พักหรือทีมงานของเราได้ทุกเมื่อ" : "If you have any questions or need assistance with your stay, feel free to contact the property host or our team at any time."}</p>
              <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">${isTh ? "ขอขอบพระคุณอีกครั้งสำหรับความไว้วางใจ" : "Thank you again for your trust."}</p>
              <p style="font-size: 14px; color: #374151; margin: 0 0 24px;">${isTh ? `${localized.homestayName} หวังเป็นอย่างยิ่งว่าจะได้เป็นส่วนหนึ่งของประสบการณ์การพักผ่อนท่ามกลางธรรมชาติของคุณ` : `${localized.homestayName} hopes to be part of your nature retreat experience.`}</p>
              <p style="font-size: 14px; color: #374151; margin: 0;">${isTh ? "ด้วยความเคารพ" : "Best regards,"}</p>
              <p style="font-size: 14px; color: #111827; font-weight: 700; margin: 4px 0 0;">${localized.homestayName}</p>
              <p style="font-size: 12px; color: #9ca3af; margin: 4px 0 0;">Nature Places in Thailand</p>
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
            <h2 style="margin-top: 0;">${localized.homestayName}</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <colgroup><col style="width: 38%;"><col></colgroup>
              <tr><td style="padding: 10px 12px 10px 0; color: #6b7280; font-size: 13px; vertical-align: top;">${isTh ? "รหัสการจอง" : "Booking ID"}</td><td style="padding: 10px 0; font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; color: #374151; vertical-align: top;">${booking.id}</td></tr>
              <tr><td style="padding: 10px 12px 10px 0; color: #6b7280; font-size: 13px; vertical-align: top;">${isTh ? "ผู้เข้าพัก" : "Guest"}</td><td style="padding: 10px 0; font-size: 14px; vertical-align: top;">${booking.guest_name}</td></tr>
              <tr><td style="padding: 10px 12px 10px 0; color: #6b7280; font-size: 13px; vertical-align: top;">${isTh ? "ห้องพัก" : "Room"}</td><td style="padding: 10px 0; font-size: 14px; vertical-align: top;">${localized.roomName || "Standard"}</td></tr>
              <tr><td style="padding: 10px 12px 10px 0; color: #6b7280; font-size: 13px; vertical-align: top;">${isTh ? "เช็คอิน" : "Check-in"}</td><td style="padding: 10px 0; font-size: 14px; vertical-align: top;">${checkInFmt}${homestay.check_in_time ? `<div style="color: #6b7280; font-size: 12px; margin-top: 2px;">${isTh ? "หลัง" : "after"} ${homestay.check_in_time} ${isTh ? "น." : ""}</div>` : ""}</td></tr>
              <tr><td style="padding: 10px 12px 10px 0; color: #6b7280; font-size: 13px; vertical-align: top;">${isTh ? "เช็คเอาท์" : "Check-out"}</td><td style="padding: 10px 0; font-size: 14px; vertical-align: top;">${checkOutFmt}${homestay.check_out_time ? `<div style="color: #6b7280; font-size: 12px; margin-top: 2px;">${isTh ? "ก่อน" : "before"} ${homestay.check_out_time} ${isTh ? "น." : ""}</div>` : ""}</td></tr>
              <tr><td style="padding: 10px 12px 10px 0; color: #6b7280; font-size: 13px; vertical-align: top;">${isTh ? "จำนวนผู้เข้าพัก" : "Guests"}</td><td style="padding: 10px 0; font-size: 14px; vertical-align: top;">${booking.num_guests}${booking.guest_pricing_label ? ` (${booking.guest_pricing_label})` : ""}</td></tr>
              ${localized.selectedOptions.length > 0 ? `<tr><td style="padding: 10px 12px 10px 0; color: #6b7280; font-size: 13px; vertical-align: top;">${isTh ? "บริการเพิ่มเติม" : "Services"}</td><td style="padding: 10px 0; font-size: 14px; vertical-align: top;">${renderSelectedOptionsHtmlList(localized.selectedOptions, nights, isTh)}</td></tr>` : ""}
              ${discountRowSimple}
              <tr><td style="padding: 16px 12px 0 0; color: #6b7280; font-size: 14px; vertical-align: middle; border-top: 1px solid #e5e7eb;">${isTh ? "ยอดรวม" : "Total"}</td><td style="padding: 16px 0 0; font-size: 18px; font-weight: 700; color: ${homestay.theme_color}; vertical-align: middle; border-top: 1px solid #e5e7eb; text-align: right;">฿${booking.total_price.toLocaleString()}</td></tr>
              ${(booking as Record<string, unknown>).payment_type === "deposit" ? `
              <tr><td style="padding: 10px 12px 10px 0; color: #6b7280; font-size: 13px; vertical-align: top;">${isTh ? "ยอดที่ชำระ" : "Amount Paid"}</td><td style="padding: 10px 0; font-weight: 600; color: ${homestay.theme_color}; font-size: 14px;">฿${((booking as Record<string, unknown>).amount_paid as number || 0).toLocaleString()}</td></tr>
              <tr><td style="padding: 10px 12px 10px 0; color: #6b7280; font-size: 13px; vertical-align: top;">${isTh ? "ยอดค้างชำระ" : "Balance Due"}</td><td style="padding: 10px 0; font-weight: 600; color: #d97706; font-size: 14px;">฿${(booking.total_price - ((booking as Record<string, unknown>).amount_paid as number || 0)).toLocaleString()} <span style="color: #6b7280; font-size: 12px; font-weight: 400;">(${isTh ? "ชำระเมื่อเข้าพัก" : "pay on arrival"})</span></td></tr>
              ` : ""}
            </table>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            <p style="color: #6b7280; font-size: 14px;">${localized.homestayLocation}</p>
            <p style="color: #6b7280; font-size: 14px;">${isTh ? "สลิปการชำระเงินไม่สามารถตรวจสอบอัตโนมัติได้ เจ้าของที่พักจะตรวจสอบและยืนยันให้ในเร็วๆ นี้" : "Your payment slip could not be auto-verified. The host will review and confirm your booking shortly."}</p>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">Peaksnature — Nature Places in Thailand</p>
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
    const nights = bookingNights(booking.check_in, booking.check_out);
    const isConfirmed = newStatus === "confirmed";

    const localized = await localizeGuestEmailContent(
      homestay,
      room?.name ?? null,
      Array.isArray(booking.selected_options) ? (booking.selected_options as SelectedOptionForEmail[]) : [],
      locale,
    );

    const subject = isConfirmed
      ? (isTh ? `การจองของคุณได้รับการยืนยันแล้ว – ${localized.homestayName}` : `Your Booking Has Been Confirmed – ${localized.homestayName}`)
      : (isTh ? `อัปเดตการจอง — ${localized.homestayName}` : `Booking Update — ${localized.homestayName}`);

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
            <p style="font-size: 14px; color: #374151; margin: 0 0 24px;">${isTh ? `การจองของคุณสำหรับ ${localized.homestayName} ได้รับการยืนยันเรียบร้อยแล้ว โดยมีรายละเอียดดังต่อไปนี้` : `Your booking at ${localized.homestayName} has been confirmed. Here are the details:`}</p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px 24px; margin-bottom: 24px;">
              <h2 style="color: #111827; font-size: 16px; font-weight: 700; margin: 0 0 16px;">${isTh ? "รายละเอียดการจอง" : "Booking Details"}</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <colgroup><col style="width: 38%;"><col></colgroup>
                <tr><td style="padding: 10px 12px 10px 0; color: #6b7280; font-size: 13px; vertical-align: top;">${isTh ? "รหัสการจอง" : "Booking ID"}</td><td style="padding: 10px 0; color: #374151; font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; vertical-align: top;">${booking.id}</td></tr>
                <tr><td style="padding: 10px 12px 10px 0; color: #6b7280; font-size: 13px; vertical-align: top;">${isTh ? "ผู้เข้าพัก" : "Guest"}</td><td style="padding: 10px 0; color: #111827; font-size: 14px; vertical-align: top;">${booking.guest_name}</td></tr>
                <tr><td style="padding: 10px 12px 10px 0; color: #6b7280; font-size: 13px; vertical-align: top;">${isTh ? "ประเภทห้องพัก" : "Room Type"}</td><td style="padding: 10px 0; color: #111827; font-size: 14px; vertical-align: top;">${localized.roomName || "Standard"}</td></tr>
                <tr><td style="padding: 10px 12px 10px 0; color: #6b7280; font-size: 13px; vertical-align: top;">${isTh ? "วันเช็กอิน" : "Check-in"}</td><td style="padding: 10px 0; color: #111827; font-size: 14px; vertical-align: top;">${checkInFmt}${homestay.check_in_time ? `<div style="color: #6b7280; font-size: 12px; margin-top: 2px;">${isTh ? "เช็กอินได้ตั้งแต่" : "from"} ${homestay.check_in_time}${isTh ? " น." : ""}</div>` : ""}</td></tr>
                <tr><td style="padding: 10px 12px 10px 0; color: #6b7280; font-size: 13px; vertical-align: top;">${isTh ? "วันเช็กเอาต์" : "Check-out"}</td><td style="padding: 10px 0; color: #111827; font-size: 14px; vertical-align: top;">${checkOutFmt}${homestay.check_out_time ? `<div style="color: #6b7280; font-size: 12px; margin-top: 2px;">${isTh ? "เช็กเอาต์ก่อน" : "before"} ${homestay.check_out_time}${isTh ? " น." : ""}</div>` : ""}</td></tr>
                <tr><td style="padding: 10px 12px 10px 0; color: #6b7280; font-size: 13px; vertical-align: top;">${isTh ? "จำนวนผู้เข้าพัก" : "Guests"}</td><td style="padding: 10px 0; color: #111827; font-size: 14px; vertical-align: top;">${booking.num_guests} ${isTh ? "ท่าน" : ""}${booking.guest_pricing_label ? ` (${booking.guest_pricing_label})` : ""}</td></tr>
                ${localized.selectedOptions.length > 0 ? `<tr><td style="padding: 10px 12px 10px 0; color: #6b7280; font-size: 13px; vertical-align: top;">${isTh ? "บริการเพิ่มเติม" : "Services"}</td><td style="padding: 10px 0; color: #111827; font-size: 14px; vertical-align: top;">${renderSelectedOptionsHtmlList(localized.selectedOptions, nights, isTh)}</td></tr>` : ""}
                <tr><td style="padding: 16px 12px 0 0; color: #6b7280; font-size: 14px; vertical-align: middle; border-top: 1px solid #e5e7eb;">${isTh ? "ยอดชำระรวม" : "Total"}</td><td style="padding: 16px 0 0; color: #111827; font-size: 18px; font-weight: 700; vertical-align: middle; border-top: 1px solid #e5e7eb; text-align: right;">฿${booking.total_price.toLocaleString()}</td></tr>
              </table>
            </div>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <h2 style="color: #111827; font-size: 16px; font-weight: 700; margin: 0 0 8px;">${isTh ? "สถานที่เข้าพัก" : "Property"}</h2>
              <p style="color: #111827; font-size: 14px; margin: 0 0 4px; font-weight: 600;">${localized.homestayName}</p>
              <p style="color: #6b7280; font-size: 14px; margin: 0;">${localized.homestayLocation}</p>
            </div>
            <div style="border-top: 1px solid #e5e7eb; padding-top: 24px;">
              <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">${isTh ? "การชำระเงินของคุณได้รับการยืนยันเรียบร้อยแล้ว" : "Your payment has been confirmed."}</p>
              <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">${isTh ? "หากท่านมีข้อสงสัยเพิ่มเติม หรือต้องการความช่วยเหลือเกี่ยวกับการเข้าพัก สามารถติดต่อเจ้าของที่พักหรือทีมงานของเราได้ทุกเมื่อ" : "If you have any questions or need assistance with your stay, feel free to contact the property host or our team at any time."}</p>
              <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">${isTh ? "ขอขอบพระคุณอีกครั้งสำหรับความไว้วางใจ" : "Thank you again for your trust."}</p>
              <p style="font-size: 14px; color: #374151; margin: 0 0 24px;">${isTh ? `${localized.homestayName} หวังเป็นอย่างยิ่งว่าจะได้เป็นส่วนหนึ่งของประสบการณ์การพักผ่อนท่ามกลางธรรมชาติของคุณ` : `${localized.homestayName} hopes to be part of your nature retreat experience.`}</p>
              <p style="font-size: 14px; color: #374151; margin: 0;">${isTh ? "ด้วยความเคารพ" : "Best regards,"}</p>
              <p style="font-size: 14px; color: #111827; font-weight: 700; margin: 4px 0 0;">${localized.homestayName}</p>
              <p style="font-size: 12px; color: #9ca3af; margin: 4px 0 0;">Nature Places in Thailand</p>
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
            <h2 style="margin-top: 16px;">${localized.homestayName}</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "รหัสการจอง" : "Booking ID"}</td><td style="padding: 8px 0; font-weight: bold;">${booking.id}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "ห้องพัก" : "Room"}</td><td style="padding: 8px 0;">${localized.roomName || "Standard"}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "เช็คอิน" : "Check-in"}</td><td style="padding: 8px 0;">${checkInFmt}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "เช็คเอาท์" : "Check-out"}</td><td style="padding: 8px 0;">${checkOutFmt}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">${isTh ? "ยอดรวม" : "Total"}</td><td style="padding: 8px 0; font-weight: bold;">฿${booking.total_price.toLocaleString()}</td></tr>
            </table>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            <p style="color: #6b7280; font-size: 14px;">${localized.homestayLocation}</p>
            <p style="color: #6b7280; font-size: 14px;">${isTh ? "หากมีข้อสงสัย กรุณาติดต่อเจ้าของที่พักโดยตรง" : "If you have any questions, please contact the host directly."}</p>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">Peaksnature — Nature Places in Thailand</p>
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
// SMS NOTIFICATION (sms-kub.com)
// ============================================================

function formatSmsDate(dateStr: string): string {
  const date = parseISO(dateStr);
  const beYear = (date.getFullYear() + 543) % 100;
  return format(date, "dMMM", { locale: thLocale }) + beYear;
}

function formatSmsDateSpaced(dateStr: string): string {
  const date = parseISO(dateStr);
  const beYear = (date.getFullYear() + 543) % 100;
  return format(date, "d MMM ", { locale: thLocale }) + beYear;
}

export function truncateForSms(message: string, maxLen: number = 70): string {
  if (message.length <= maxLen) return message;
  return message.slice(0, maxLen);
}

export async function sendSms(phone: string, message: string): Promise<{ success: boolean; error?: unknown }> {
  const apiKey = process.env.SMS_KUB_API_KEY;
  const sender = process.env.SMS_KUB_SENDER || "Peaksnature";

  if (!apiKey) {
    return { success: false, error: "SMS API key not configured" };
  }

  // sms-kub accepts "0812345678" or "66812345678", but NOT "+66812345678".
  // Strip non-digits to normalize "+66...", spaces, dashes, parens.
  const normalizedPhone = phone.replace(/\D/g, "");
  if (!normalizedPhone) {
    return { success: false, error: "Invalid phone number" };
  }

  try {
    const response = await fetch("https://console.sms-kub.com/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "key": apiKey,
      },
      body: JSON.stringify({
        to: [normalizedPhone],
        from: sender,
        message,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const bodyText = await response.text().catch(() => "");
    let body: unknown = bodyText;
    try { body = JSON.parse(bodyText); } catch { /* keep raw text */ }

    if (!response.ok) {
      console.error("[SMS] API error:", response.status, body);
      return { success: false, error: { status: response.status, body } };
    }

    return { success: true };
  } catch (error) {
    // fetch throws on network error, DNS failure, or AbortSignal timeout.
    // Return a failure result so withRetry + email fallback can run instead of propagating.
    console.error("[SMS] Request threw:", error);
    return { success: false, error };
  }
}

async function withRetry(
  fn: () => Promise<{ success: boolean; error?: unknown }>,
  retries: number = 3,
): Promise<{ success: boolean; error?: unknown }> {
  let lastResult: { success: boolean; error?: unknown } = { success: false };
  for (let i = 0; i < retries; i++) {
    lastResult = await fn();
    if (lastResult.success) return lastResult;
    if (i < retries - 1) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  return lastResult;
}

export async function sendHostSmsNotification(
  details: BookingDetails,
  type: "confirmed" | "flagged" = "confirmed"
): Promise<{ success: boolean; error?: unknown }> {
  const phone = details.host.phone;
  if (!phone) {
    return { success: false, error: "Host phone not set" };
  }

  const { booking, room } = details;
  const nights = Math.round(
    (new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / (1000 * 60 * 60 * 24)
  );
  const guest = booking.guest_name.slice(0, 15);
  const roomName = (room?.name || "Standard").slice(0, 12);
  const status = type === "confirmed" ? "ยืนยันแล้ว" : "รอตรวจสอบ";

  const isDeposit = booking.payment_type === "deposit";
  const priceLabel = isDeposit
    ? `มัดจำ ฿${(booking.amount_paid || 0).toLocaleString()}`
    : ` ฿${booking.total_price.toLocaleString()}`;

  const message = truncateForSms(
    `จองใหม่ ${guest} ${roomName} ${formatSmsDate(booking.check_in)} ${nights}คืน ${priceLabel} ${status}`
  );

  return sendSms(phone, message);
}

export async function sendHostCancellationSmsNotification(
  details: BookingDetails,
): Promise<{ success: boolean; error?: unknown }> {
  const phone = details.host.phone;
  if (!phone) {
    return { success: false, error: "Host phone not set" };
  }

  const { booking, room } = details;
  const nights = Math.round(
    (new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / (1000 * 60 * 60 * 24)
  );
  const guest = booking.guest_name.slice(0, 15);
  const roomName = (room?.name || "Standard").slice(0, 12);
  const refund = booking.amount_paid || 0;

  const message = truncateForSms(
    `ยกเลิก ${guest} ${roomName} ${formatSmsDate(booking.check_in)} ${nights}คืน คืนเงิน฿${refund.toLocaleString()}`
  );

  return sendSms(phone, message);
}

export async function sendDateChangeSmsNotification(
  details: BookingDetails,
  oldCheckIn: string,
  oldCheckOut: string,
  newCheckIn: string,
  newCheckOut: string,
  _priceDifference: number,
  newTotalPrice: number,
  newRoomName?: string,
): Promise<{ success: boolean; error?: unknown }> {
  const phone = details.host.phone;
  if (!phone) {
    return { success: false, error: "Host phone not set" };
  }

  const { booking, room } = details;
  const guest = booking.guest_name.slice(0, 30);
  const oldNights = Math.round(
    (new Date(oldCheckOut).getTime() - new Date(oldCheckIn).getTime()) / (1000 * 60 * 60 * 24)
  );
  const newNights = Math.round(
    (new Date(newCheckOut).getTime() - new Date(newCheckIn).getTime()) / (1000 * 60 * 60 * 24)
  );

  const roomPart = newRoomName
    ? ` ${(room?.name || "").slice(0, 10)}>${newRoomName.slice(0, 10)}`
    : "";

  const message = truncateForSms(
    `ขอเปลี่ยน ${guest}${roomPart} ${formatSmsDateSpaced(oldCheckIn)} ${oldNights}คืน > ${formatSmsDateSpaced(newCheckIn)} ${newNights}คืน ฿${booking.total_price.toLocaleString()} > ฿${newTotalPrice.toLocaleString()} รออนุมัติ`,
    134
  );

  return sendSms(phone, message);
}

async function sendHostNotificationEmail(
  details: BookingDetails,
  subject: string,
  bodyText: string,
): Promise<{ success: boolean; error?: unknown }> {
  const apiKey = (process.env.RESEND_API_KEY || "").replace(/["']/g, "").trim();
  if (!apiKey) {
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const hostEmail = details.host.email;
  if (!hostEmail) {
    return { success: false, error: "Host email not set" };
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
      to: [hostEmail],
      subject,
      text: bodyText,
    });

    return { success: true };
  } catch (error) {
    console.error("[Email] Fallback failed:", error);
    return { success: false, error };
  }
}

export async function dispatchHostNotification(
  details: BookingDetails,
  sendSmsFn: () => Promise<{ success: boolean; error?: unknown }>,
  sendLineFn: () => Promise<{ success: boolean; error?: unknown }>,
  emailSubject: string,
  buildEmailBody: () => string,
): Promise<void> {
  const preference = details.host.notification_preference || "sms";

  const primaryFn = preference === "line" ? sendLineFn : sendSmsFn;

  const result = await withRetry(primaryFn, 3);

  if (!result.success) {
    const emailResult = await sendHostNotificationEmail(details, emailSubject, buildEmailBody());
    if (!emailResult.success) {
      console.error("[Notification] Email fallback also failed");
    }
  }
}

/**
 * Send a one-off operational alert (plan/billing reminder) to a host over their
 * preferred channel, falling back LINE → SMS → email until one succeeds.
 *
 * The SMS body is always passed through truncateForSms so an oversized message
 * can never be silently dropped by the gateway (the cause of the fixed-rate
 * term-expiry warnings never arriving). LINE and email carry the full text
 * (`fullText`, defaulting to `smsText`) since neither has a 70-char limit.
 */
export async function notifyHostAlert(
  host: {
    phone: string | null;
    email: string | null;
    notification_preference: string | null;
    line_channel_access_token: string | null;
    line_user_id: string | null;
  },
  smsText: string,
  emailSubject: string,
  fullText?: string,
): Promise<{ success: boolean; channel: "line" | "sms" | "email" | null }> {
  const preference = host.notification_preference || "sms";
  const longText = fullText || smsText;

  // LINE first when preferred and configured.
  if (preference === "line" && host.line_channel_access_token && host.line_user_id) {
    try {
      const response = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${host.line_channel_access_token}`,
        },
        body: JSON.stringify({
          to: host.line_user_id,
          messages: [{ type: "text", text: longText }],
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) return { success: true, channel: "line" };
      console.error("[notifyHostAlert] LINE push failed, falling back to SMS");
    } catch (err) {
      console.error("[notifyHostAlert] LINE push threw, falling back to SMS:", err);
    }
  }

  // SMS — always truncated to stay within a single segment.
  if (host.phone) {
    const result = await sendSms(host.phone, truncateForSms(smsText));
    if (result.success) return { success: true, channel: "sms" };
    console.error("[notifyHostAlert] SMS failed, falling back to email");
  }

  // Email fallback via Resend.
  if (host.email) {
    const apiKey = (process.env.RESEND_API_KEY || "").replace(/["']/g, "").trim();
    if (!apiKey) {
      console.warn("[notifyHostAlert] Email fallback skipped — RESEND_API_KEY not configured");
    } else {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(apiKey);
        const cleaned = (process.env.RESEND_FROM_EMAIL || "").replace(/["'\r\n]/g, "").trim();
        const fromEmail = cleaned
          ? cleaned.replace(/<([^>]+)>/, (_, email: string) => `<${email.replace(/\s+/g, "")}>`)
          : "Peaksnature <onboarding@resend.dev>";
        await resend.emails.send({
          from: fromEmail,
          to: [host.email],
          subject: emailSubject,
          text: longText,
        });
        return { success: true, channel: "email" };
      } catch (err) {
        console.error("[notifyHostAlert] Email fallback failed:", err);
      }
    }
  }

  return { success: false, channel: null };
}

// ============================================================
// LINE MESSAGE BUILDERS (shared by LINE sending + email fallback)
// ============================================================

export function buildNewBookingMessage(
  details: BookingDetails,
  type: "confirmed" | "flagged" = "confirmed"
): string {
  const { booking, homestay, room } = details;
  const checkIn = new Date(booking.check_in);
  const checkOut = new Date(booking.check_out);
  const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

  const header = type === "confirmed"
    ? `🎉 การจองใหม่ — ยืนยันแล้ว!`
    : `⚠️ การจองใหม่ — รอตรวจสอบ`;

  const paymentStatus = type === "confirmed"
    ? `✅ ชำระเงินแล้ว (ยืนยันอัตโนมัติ)`
    : `❌ ยืนยันสลิปไม่สำเร็จ — กรุณาตรวจสอบใน Dashboard`;

  return [
    header,
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
    `   👥 ผู้เข้าพัก: ${booking.num_guests} ท่าน${booking.guest_pricing_label ? ` (${booking.guest_pricing_label})` : ""}`,
    ...(Array.isArray(booking.selected_options) && (booking.selected_options as { name: string; price: number }[]).length > 0 ? [
      `   🔧 บริการเพิ่มเติม: ${(booking.selected_options as { name: string; price: number }[]).map((o) => `${o.name} (+฿${o.price.toLocaleString()})`).join(", ")}`,
    ] : []),
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
}

export function buildCancellationMessage(
  details: BookingDetails,
  reason?: string
): string {
  const { booking, homestay, room } = details;
  const checkIn = new Date(booking.check_in);
  const checkOut = new Date(booking.check_out);
  const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

  return [
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
}

export function buildDateChangeMessage(
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
): string {
  const { booking, homestay, room } = details;

  const oldNights = Math.round((new Date(oldCheckOut).getTime() - new Date(oldCheckIn).getTime()) / (1000 * 60 * 60 * 24));
  const newNights = Math.round((new Date(newCheckOut).getTime() - new Date(newCheckIn).getTime()) / (1000 * 60 * 60 * 24));

  const roomChangeLine = newRoomName
    ? `🛏️ ห้องใหม่: ${newRoomName} (เดิม: ${room?.name || "Standard"})`
    : `🛏️ ห้อง: ${room?.name || "Standard"}`;

  const paymentLines: string[] = [];
  if (paymentInfo) {
    const { amountPaid, additionalPayment, paymentOption, depositAvailable, newDeposit: _newDeposit, fullOutstanding, paymentType } = paymentInfo;
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
    if (priceDifference > 0) {
      paymentLines.push(`💰 ส่วนต่าง: +฿${priceDifference.toLocaleString()} (ชำระแล้ว)`);
    } else if (priceDifference < 0) {
      paymentLines.push(`💰 ส่วนต่าง: -฿${Math.abs(priceDifference).toLocaleString()}`);
    } else {
      paymentLines.push(`💰 ราคาเท่าเดิม`);
    }
  }

  return [
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
    return { success: false, error: "Host LINE credentials not configured" };
  }

  try {
    const messageText = buildCancellationMessage(details, reason);

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
      signal: AbortSignal.timeout(5000),
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
    return { success: false, error: "Host LINE credentials not configured" };
  }

  try {
    const messageText = buildNewBookingMessage(details, type);

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
      signal: AbortSignal.timeout(5000),
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
      return;
    }

    const appUrl = info.appUrl || process.env.NEXT_PUBLIC_APP_URL || "";
    const reviewLink = appUrl ? `${appUrl}/admin/hosts?status=pending` : "";

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

    const resendKey = (process.env.RESEND_API_KEY || "").replace(/["']/g, "").trim();
    let resendInstance: import("resend").Resend | null = null;
    let fromEmail = "";
    if (resendKey) {
      const { Resend } = await import("resend");
      resendInstance = new Resend(resendKey);
      const DEFAULT_FROM = "Peaksnature <onboarding@resend.dev>";
      const cleaned = (process.env.RESEND_FROM_EMAIL || "").replace(/["'\r\n]/g, "").trim();
      fromEmail = cleaned
        ? cleaned.replace(/<([^>]+)>/, (_, email: string) => `<${email.replace(/\s+/g, "")}>`)
        : DEFAULT_FROM;
    }

    const emailHtml = `
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
                  <p style="font-size: 12px; color: #9ca3af; margin: 4px 0 0;">Nature Places in Thailand</p>
                </div>
              </div>
            </div>
          `;

    type Admin = { email: string; line_user_id: string | null; line_channel_access_token: string | null };

    const sendLine = async (admin: Admin) => {
      if (!admin.line_user_id || !admin.line_channel_access_token) return;
      try {
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
          signal: AbortSignal.timeout(5000),
        });
      } catch (err) {
        console.error(`[Admin Notify] LINE failed for ${admin.email}:`, err);
      }
    };

    const sendEmail = async (admin: Admin) => {
      if (!resendInstance) {
        return;
      }
      try {
        await resendInstance.emails.send({
          from: fromEmail,
          to: admin.email,
          subject: `New host registration – ${info.hostName}`,
          html: emailHtml,
        });
      } catch (err) {
        console.error(`[Admin Notify] Email failed for ${admin.email}:`, err);
      }
    };

    await Promise.allSettled(
      (admins as Admin[]).map((admin) =>
        Promise.allSettled([sendLine(admin), sendEmail(admin)]),
      ),
    );
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
              <p style="font-size: 12px; color: #9ca3af; margin: 4px 0 0;">Nature Places in Thailand</p>
            </div>
          </div>
        </div>
      `,
    });
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
    return { success: false, error: "Host LINE credentials not configured" };
  }

  try {
    const messageText = buildDateChangeMessage(
      details, oldCheckIn, oldCheckOut, newCheckIn, newCheckOut,
      priceDifference, newTotalPrice, newRoomName, paymentInfo,
    );

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
      signal: AbortSignal.timeout(5000),
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

    const localized = await localizeGuestEmailContent(homestay, roomName ?? null, [], locale);

    let oldRoomNameOut = roomChangeInfo?.oldRoomName ?? "";
    let newRoomNameOut = roomChangeInfo?.newRoomName ?? "";
    if (locale === "en" && roomChangeInfo) {
      const extra = await localizeStrings(
        `email:room-change:${homestay.id}`,
        { oldRoom: roomChangeInfo.oldRoomName, newRoom: roomChangeInfo.newRoomName },
        "en" as SupportedLocale,
      );
      oldRoomNameOut = extra.oldRoom ?? roomChangeInfo.oldRoomName;
      newRoomNameOut = extra.newRoom ?? roomChangeInfo.newRoomName;
    }

    const isApproved = status === "approved";
    const subject = isApproved
      ? (isTh ? `อนุมัติเปลี่ยนวันเข้าพักแล้ว – ${localized.homestayName}` : `Date Change Approved – ${localized.homestayName}`)
      : (isTh ? `ปฏิเสธการเปลี่ยนวันเข้าพัก – ${localized.homestayName}` : `Date Change Rejected – ${localized.homestayName}`);

    let dcHtml: string;

    if (isApproved) {
      dcHtml = `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <div style="background: #f9fafb; padding: 32px 24px; border-bottom: 1px solid #e5e7eb;">
            <h1 style="color: #111827; margin: 0; font-size: 22px; font-weight: 700;">${isTh ? "อนุมัติเปลี่ยนวันเข้าพักแล้ว" : "Date Change Approved"}</h1>
          </div>
          <div style="padding: 32px 24px;">
            <p style="font-size: 16px; color: #111827; margin: 0 0 16px;">${isTh ? `เรียน คุณ${booking.guest_name}` : `Dear ${booking.guest_name}`},</p>
            <p style="font-size: 14px; color: #374151; margin: 0 0 24px;">${isTh ? `คำขอเปลี่ยนวันเข้าพักของคุณที่ ${localized.homestayName} ได้รับการอนุมัติแล้ว` : `Your date change request at ${localized.homestayName} has been approved.`}</p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <h2 style="color: #111827; font-size: 16px; font-weight: 700; margin: 0 0 16px;">${isTh ? "รายละเอียด" : "Details"}</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "รหัสการจอง" : "Booking ID"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${booking.id}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "วันเดิม" : "Original Dates"}</td><td style="padding: 8px 0; color: #9ca3af; font-size: 14px; text-decoration: line-through;">${formatBookingDate(oldCheckIn, locale)} - ${formatBookingDate(oldCheckOut, locale)}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "วันใหม่" : "New Dates"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${formatBookingDate(newCheckIn, locale)} - ${formatBookingDate(newCheckOut, locale)}</td></tr>
                ${roomChangeInfo ? `<tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "ห้องเดิม" : "Original Room"}</td><td style="padding: 8px 0; color: #9ca3af; font-size: 14px; text-decoration: line-through;">${oldRoomNameOut}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "ห้องใหม่" : "New Room"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${newRoomNameOut}</td></tr>` : localized.roomName ? `<tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">${isTh ? "ห้องพัก" : "Room"}</td><td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${localized.roomName}</td></tr>` : ""}
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
              <p style="font-size: 14px; color: #111827; font-weight: 700; margin: 4px 0 0;">${localized.homestayName}</p>
              <p style="font-size: 12px; color: #9ca3af; margin: 4px 0 0;">Nature Places in Thailand</p>
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
            <p style="font-size: 14px; color: #374151; margin: 0 0 24px;">${isTh ? `คำขอเปลี่ยนวันเข้าพักของคุณที่ ${localized.homestayName} ไม่ได้รับการอนุมัติ` : `Your date change request at ${localized.homestayName} has been rejected.`}</p>
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
              <p style="font-size: 14px; color: #111827; font-weight: 700; margin: 4px 0 0;">${localized.homestayName}</p>
              <p style="font-size: 12px; color: #9ca3af; margin: 4px 0 0;">Nature Places in Thailand</p>
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
              <p style="font-size: 12px; color: #9ca3af; margin: 4px 0 0;">Nature Places in Thailand</p>
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

// ============================================================
// RECOMMENDER PROMO USAGE NOTIFICATION (SMS only — recommenders
// only have a phone field on the promo_codes table for v1)
// ============================================================
export async function sendRecommenderPromoUsedNotification(args: {
  promo: PromoCode;
  bookingId: string;
  guestName: string;
  discountAmount: number;
  commissionAmount: number;
}, locale: string = "th"): Promise<{ success: boolean; skipped?: boolean }> {
  const { promo, guestName, commissionAmount } = args;
  if (!promo.recommender_phone || commissionAmount <= 0) {
    return { success: true, skipped: true };
  }

  const isTh = locale !== "en";
  const guestShort = guestName.slice(0, 18);
  const message = isTh
    ? `รหัส ${promo.code} ถูกใช้โดย ${guestShort} คอมมิชชั่น ฿${commissionAmount.toLocaleString()} เจ้าของที่พักจะติดต่อโอนให้`
    : `Code ${promo.code} used by ${guestShort}. Commission ฿${commissionAmount.toLocaleString()}. Host will pay out shortly.`;

  return sendSms(promo.recommender_phone, truncateForSms(message, 140));
}
