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
export async function sendBookingConfirmationEmail(details: BookingDetails, locale: string = "th") {
  const apiKey = (process.env.RESEND_API_KEY || "").replace(/["']/g, "").trim();
  if (!apiKey || apiKey === "your_resend_api_key") {
    console.log("[Email] Skipped — RESEND_API_KEY not configured. Would send to:", details.booking.guest_email);
    return { success: true, demo: true };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const { booking, homestay, room } = details;

    const DEFAULT_FROM = "PeaksNature <onboarding@resend.dev>";
    const rawFrom = (process.env.RESEND_FROM_EMAIL || "").replace(/["'\r\n]/g, "").trim();
    const fromEmail = rawFrom && /@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}>?$/.test(rawFrom) ? rawFrom : DEFAULT_FROM;
    console.log(`[Email] Sending to: ${booking.guest_email}, from: ${fromEmail}, locale: ${locale}`);
    const checkInFmt = formatBookingDate(booking.check_in, locale);
    const checkOutFmt = formatBookingDate(booking.check_out, locale);
    const isTh = locale === "th";

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: booking.guest_email,
      subject: isTh
        ? `ยืนยันการจอง — ${homestay.name}`
        : `Booking Confirmed — ${homestay.name}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: ${homestay.theme_color}; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🎉 ${isTh ? "ยืนยันการจองเรียบร้อย!" : "Booking Confirmed!"}</h1>
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
            <p style="color: #6b7280; font-size: 14px;">📍 ${homestay.location}</p>
            <p style="color: #6b7280; font-size: 14px;">${isTh ? "การชำระเงินได้รับการยืนยันเรียบร้อยแล้ว แล้วพบกันนะคะ!" : "Your payment has been verified automatically. See you soon!"}</p>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">PeaksNature — Nature Homestays in Thailand</p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("[Email] Resend API error:", JSON.stringify(error));
      return { success: false, error };
    }

    console.log("[Email] Sent successfully, id:", data?.id);
    return { success: true, data };
  } catch (error) {
    console.error("[Email] Exception:", error);
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
      "mailto:notification@peaksnature.com",
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
        console.log("[Push] Sent to:", sub.endpoint.slice(0, 60));
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
      console.log(`[Push] Cleaned ${expired.length} expired subscriptions`);
    }

    console.log(`[Push] Result: sent=${sent}, total=${subs.length}, expired=${expired.length}`);
    return { success: true, data: { sent, total: subs.length, expired: expired.length } };
  } catch (error) {
    console.error("[Push] Exception:", error);
    return { success: false, error };
  }
}

// ============================================================
// LINE NOTIFICATION (LINE Messaging API)
// ============================================================
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
