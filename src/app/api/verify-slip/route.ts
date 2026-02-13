import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendBookingConfirmationEmail, sendHostLineNotification } from "@/lib/notifications";
import type { Booking, Homestay, Host, Room } from "@/types/database";

interface EasySlipResponse {
  status: number;
  data?: {
    payload: string;
    transRef: string;
    date: string;
    countryCode: string;
    amount: {
      amount: number;
      local?: { amount: number; currency: string };
    };
    fee: number;
    ref1: string;
    ref2: string;
    ref3: string;
    sender: {
      bank: { id: string; name: string; short: string };
      account: { name: { th: string; en: string }; bank?: { type: string; account: string } };
    };
    receiver: {
      bank: { id: string; name: string; short: string };
      account: { name: { th: string; en: string }; bank?: { type: string; account: string } };
      proxy?: { type: string; account: string };
    };
  };
  error?: string;
}

async function sendNotifications(bookingId: string, verified: boolean) {
  try {
    const supabase = createServiceRoleClient();

    // Fetch full booking with homestay, host, and room
    const { data: booking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (!booking) return;

    const { data: homestay } = await supabase
      .from("homestays")
      .select("*")
      .eq("id", (booking as unknown as Booking).homestay_id)
      .single();

    if (!homestay) return;

    const { data: host } = await supabase
      .from("hosts")
      .select("*")
      .eq("id", (homestay as unknown as Homestay).host_id)
      .single();

    if (!host) return;

    let room = null;
    if ((booking as unknown as Booking).room_id) {
      const { data: roomData } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", (booking as unknown as Booking).room_id!)
        .single();
      room = roomData;
    }

    const details = {
      booking: booking as unknown as Booking,
      homestay: homestay as unknown as Homestay,
      host: host as unknown as Host,
      room: (room as unknown as Room) || undefined,
    };

    // Send email to guest
    await sendBookingConfirmationEmail(details);

    // Send LINE message to host
    await sendHostLineNotification(details, verified ? "confirmed" : "flagged");
  } catch (error) {
    console.error("Notification error (non-blocking):", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const bookingId = formData.get("booking_id") as string | null;
    const expectedAmount = Number(formData.get("expected_amount") || "0");
    const expectedReceiver = formData.get("expected_receiver") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    if (!bookingId) {
      return NextResponse.json(
        { error: "Booking ID is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.EASYSLIP_API_KEY;

    const supabase = createServiceRoleClient();

    if (!apiKey || apiKey === "your_easyslip_api_key") {
      // Demo mode: simulate successful verification, update booking
      console.log("[Demo] Simulating EasySlip verification...");
      const demoResponse = {
        status: 200,
        data: {
          amount: { amount: expectedAmount },
          receiver: {
            proxy: { type: "MOBILE", account: expectedReceiver },
          },
        },
      };

      await supabase
        .from("bookings")
        .update({
          status: "verified",
          easyslip_verified: true,
          easyslip_response: demoResponse,
        } as never)
        .eq("id", bookingId);

      // Send notifications (non-blocking)
      sendNotifications(bookingId, true);

      return NextResponse.json({
        verified: true,
        booking_id: bookingId,
        message: "Payment slip verified successfully (demo mode)",
        easyslip_response: demoResponse,
      });
    }

    // Production: Call EasySlip API with file upload
    const easySlipForm = new FormData();
    easySlipForm.append("file", file);

    const easySlipRes = await fetch(
      "https://developer.easyslip.com/api/v1/verify",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: easySlipForm,
      }
    );

    const easySlipData: EasySlipResponse = await easySlipRes.json();

    if (easySlipData.status !== 200 || !easySlipData.data) {
      // Verification failed — mark as pending for manual review
      await supabase
        .from("bookings")
        .update({
          easyslip_verified: false,
          easyslip_response: easySlipData,
        } as never)
        .eq("id", bookingId);

      // Send notifications — host gets flagged alert
      sendNotifications(bookingId, false);

      return NextResponse.json({
        verified: false,
        booking_id: bookingId,
        message: "Slip verification failed. This booking will be reviewed manually.",
        easyslip_response: easySlipData,
      });
    }

    // Validate amount and receiver
    const slipAmount = easySlipData.data.amount.amount;
    const receiverAccount = easySlipData.data.receiver?.proxy?.account;

    const amountMatch = slipAmount === expectedAmount;
    const receiverMatch =
      !expectedReceiver ||
      receiverAccount?.replace(/-/g, "") === expectedReceiver?.replace(/-/g, "");

    if (!amountMatch || !receiverMatch) {
      await supabase
        .from("bookings")
        .update({
          easyslip_verified: false,
          easyslip_response: easySlipData,
        } as never)
        .eq("id", bookingId);

      // Send notifications — host gets flagged alert
      sendNotifications(bookingId, false);

      return NextResponse.json({
        verified: false,
        booking_id: bookingId,
        message: `Verification mismatch. ${!amountMatch ? `Amount: expected ฿${expectedAmount}, got ฿${slipAmount}.` : ""} ${!receiverMatch ? "Receiver account does not match." : ""}`.trim(),
        easyslip_response: easySlipData,
      });
    }

    // All checks passed — auto-verify the booking
    await supabase
      .from("bookings")
      .update({
        status: "verified",
        easyslip_verified: true,
        easyslip_response: easySlipData,
      } as never)
      .eq("id", bookingId);

    // Send notifications
    sendNotifications(bookingId, true);

    return NextResponse.json({
      verified: true,
      booking_id: bookingId,
      message: "Payment verified! Booking confirmed automatically.",
      easyslip_response: easySlipData,
    });
  } catch (error) {
    console.error("Verify slip error:", error);
    return NextResponse.json(
      { error: "Failed to verify slip" },
      { status: 500 }
    );
  }
}
