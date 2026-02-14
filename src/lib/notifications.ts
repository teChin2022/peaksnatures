import type { Booking, Homestay, Host, Room } from "@/types/database";

interface BookingDetails {
  booking: Booking;
  homestay: Homestay;
  host: Host;
  room?: Room;
}

// ============================================================
// EMAIL NOTIFICATION (Resend)
// ============================================================
export async function sendBookingConfirmationEmail(details: BookingDetails) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "your_resend_api_key") {
    console.log("[Demo] Would send confirmation email to:", details.booking.guest_email);
    return { success: true, demo: true };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const { booking, homestay, room } = details;

    const { data, error } = await resend.emails.send({
      from: "PeaksNature <bookings@peaksnature.com>",
      to: booking.guest_email,
      subject: `Booking Confirmed — ${homestay.name}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: ${homestay.theme_color}; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🎉 Booking Confirmed!</h1>
          </div>
          <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
            <h2 style="margin-top: 0;">${homestay.name}</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #6b7280;">Booking ID</td><td style="padding: 8px 0; font-weight: bold;">${booking.id}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Room</td><td style="padding: 8px 0;">${room?.name || "Standard"}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Check-in</td><td style="padding: 8px 0;">${booking.check_in}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Check-out</td><td style="padding: 8px 0;">${booking.check_out}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Guests</td><td style="padding: 8px 0;">${booking.num_guests}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Total</td><td style="padding: 8px 0; font-weight: bold; color: ${homestay.theme_color};">฿${booking.total_price.toLocaleString()}</td></tr>
            </table>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            <p style="color: #6b7280; font-size: 14px;">📍 ${homestay.location}</p>
            <p style="color: #6b7280; font-size: 14px;">Your payment has been verified automatically. See you soon!</p>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">PeaksNature — Nature Homestays in Thailand</p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Email send error:", error);
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
      ...(booking.guest_province ? [`   จังหวัด: ${booking.guest_province}`] : []),
      ``,
      `📋 รายละเอียดการจอง`,
      `   🛏️ ห้อง: ${room?.name || "Standard"}`,
      `   � เช็คอิน: ${booking.check_in}`,
      `   📅 เช็คเอาท์: ${booking.check_out}`,
      `   🌙 จำนวน: ${nights} คืน`,
      `   👥 ผู้เข้าพัก: ${booking.num_guests} ท่าน`,
      ``,
      `💰 การชำระเงิน`,
      `   ยอดรวม: ฿${booking.total_price.toLocaleString()}`,
      ...(room ? [`   (฿${room.price_per_night.toLocaleString()} × ${nights} คืน)`] : []),
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
