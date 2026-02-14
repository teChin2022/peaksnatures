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

    if (!booking) {
      console.error("[Notification] Booking not found:", bookingId);
      return;
    }

    const { data: homestay } = await supabase
      .from("homestays")
      .select("*")
      .eq("id", (booking as unknown as Booking).homestay_id)
      .single();

    if (!homestay) {
      console.error("[Notification] Homestay not found for booking:", bookingId);
      return;
    }

    const { data: host } = await supabase
      .from("hosts")
      .select("*")
      .eq("id", (homestay as unknown as Homestay).host_id)
      .single();

    if (!host) {
      console.error("[Notification] Host not found for homestay:", (homestay as unknown as Homestay).id);
      return;
    }

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
    const emailResult = await sendBookingConfirmationEmail(details);
    console.log("[Notification] Email result:", emailResult);

    // Send LINE message to host
    const lineResult = await sendHostLineNotification(details, verified ? "confirmed" : "flagged");
    console.log("[Notification] LINE result:", lineResult);
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

    // Upload slip to permanent storage path keyed by booking ID
    const ext = file.name.split(".").pop() || "jpg";
    const slipPath = `bookings/${bookingId}/slip.${ext}`;
    await supabase.storage
      .from("payment-slips")
      .upload(slipPath, file, { upsert: true, contentType: file.type });

    const { data: signedUrlData } = await supabase.storage
      .from("payment-slips")
      .createSignedUrl(slipPath, 60 * 60 * 24 * 365); // 1 year
    const paymentSlipUrl = signedUrlData?.signedUrl || null;

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

      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          status: "confirmed",
          easyslip_verified: true,
          easyslip_response: demoResponse,
          payment_slip_url: paymentSlipUrl,
        } as never)
        .eq("id", bookingId);

      if (updateError) {
        console.error("[Demo] Booking update error:", updateError);
      }

      // Send notifications
      await sendNotifications(bookingId, true);

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
      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          easyslip_verified: false,
          easyslip_response: easySlipData,
          payment_slip_url: paymentSlipUrl,
        } as never)
        .eq("id", bookingId);

      if (updateError) {
        console.error("Booking update error (verification failed):", updateError);
      }

      // Send notifications — host gets flagged alert
      await sendNotifications(bookingId, false);

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
      const { error: mismatchUpdateError } = await supabase
        .from("bookings")
        .update({
          easyslip_verified: false,
          easyslip_response: easySlipData,
          payment_slip_url: paymentSlipUrl,
        } as never)
        .eq("id", bookingId);

      if (mismatchUpdateError) {
        console.error("Booking update error (mismatch):", mismatchUpdateError);
      }

      // Send notifications — host gets flagged alert
      await sendNotifications(bookingId, false);

      return NextResponse.json({
        verified: false,
        booking_id: bookingId,
        message: `Verification mismatch. ${!amountMatch ? `Amount: expected ฿${expectedAmount}, got ฿${slipAmount}.` : ""} ${!receiverMatch ? "Receiver account does not match." : ""}`.trim(),
        easyslip_response: easySlipData,
      });
    }

    // All checks passed — auto-confirm the booking
    const { error: confirmError } = await supabase
      .from("bookings")
      .update({
        status: "confirmed",
        easyslip_verified: true,
        easyslip_response: easySlipData,
        payment_slip_url: paymentSlipUrl,
      } as never)
      .eq("id", bookingId);

    if (confirmError) {
      console.error("Booking update error (confirm):", confirmError);
    }

    // Send notifications
    await sendNotifications(bookingId, true);

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
