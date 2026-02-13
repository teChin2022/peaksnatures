import { NextRequest, NextResponse } from "next/server";

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

    if (!apiKey || apiKey === "your_easyslip_api_key") {
      // Demo mode: simulate successful verification
      console.log("[Demo] Simulating EasySlip verification...");
      return NextResponse.json({
        verified: true,
        booking_id: bookingId,
        message: "Payment slip verified successfully (demo mode)",
        easyslip_response: {
          status: 200,
          data: {
            amount: { amount: expectedAmount },
            receiver: {
              proxy: { type: "MOBILE", account: expectedReceiver },
            },
          },
        },
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
      // Verification failed
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
      return NextResponse.json({
        verified: false,
        booking_id: bookingId,
        message: `Verification mismatch. ${!amountMatch ? `Amount: expected ฿${expectedAmount}, got ฿${slipAmount}.` : ""} ${!receiverMatch ? "Receiver account does not match." : ""}`.trim(),
        easyslip_response: easySlipData,
      });
    }

    // All checks passed — auto-confirm
    // In production: update booking status in Supabase
    // const supabase = createServiceRoleClient();
    // await supabase.from("bookings").update({
    //   status: "confirmed",
    //   easyslip_verified: true,
    //   easyslip_response: easySlipData,
    // }).eq("id", bookingId);

    // Trigger notifications (email + LINE) — see /lib/notifications.ts
    // await sendBookingConfirmationEmail(bookingId);
    // await sendHostLineNotification(bookingId);

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
