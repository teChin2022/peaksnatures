import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendBookingConfirmationEmail, sendHostLineNotification, sendHostSmsNotification, dispatchHostNotification, buildNewBookingMessage, sendRecommenderPromoUsedNotification } from "@/lib/notifications";
import type { Booking, Homestay, Host, PromoCode, Room, RoomSeasonalPrice } from "@/types/database";
import { calculateTotalPrice } from "@/lib/calculate-price";
import { getDepositForMonth } from "@/lib/get-deposit";
import { logEvent, EventType } from "@/lib/history-log";
import { deductCommission } from "@/lib/billing";
import { computeCommissionAmount, computePromoDiscount, evaluatePromoCode } from "@/lib/promo-codes";

const bookingSchema = z.object({
  homestay_id: z.string().uuid(),
  room_id: z.string().uuid().optional(),
  guest_name: z.string().min(1, "Name is required"),
  guest_email: z.string().email("Valid email required"),
  guest_phone: z.string().min(1, "Phone is required"),
  guest_province: z.string().optional(),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  num_guests: z.number().int().min(1),
  total_price: z.number().int().min(0),
  // Slip verification data (required — slip must be verified before booking)
  slip_hash: z.string().min(1, "Slip hash is required"),
  slip_trans_ref: z.string().nullable().optional(),
  payment_slip_url: z.string().nullable().optional(),
  easyslip_response: z.unknown().optional(),
  easyslip_verified: z.boolean().optional().default(true),
  // Session ID for hold cleanup
  session_id: z.string().optional(),
  notes: z.string().optional(),
  locale: z.string().optional(),
  payment_type: z.enum(["full", "deposit"]).optional().default("full"),
  amount_paid: z.number().int().min(0).optional(),
  selected_options: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    price: z.number().int().min(0),
  })).optional().default([]),
  promo_code_id: z.string().uuid().optional(),
});

async function sendNotifications(bookingId: string, supabase: ReturnType<typeof createServiceRoleClient>, locale: string = "th", isVerified: boolean = true) {
  console.log(`[Notification] Starting for booking ${bookingId}, locale=${locale}, verified=${isVerified}`);
  try {
    const { data: row, error: rowErr } = await supabase
      .from("bookings")
      .select("*, homestay:homestays(*, host:hosts(*)), room:rooms(*)")
      .eq("id", bookingId)
      .single();

    if (!row) { console.error("[Notification] Booking not found:", bookingId, rowErr); return; }

    const joined = row as unknown as Booking & {
      homestay: (Homestay & { host: Host | null }) | null;
      room: Room | null;
    };
    const homestay = joined.homestay;
    if (!homestay) { console.error("[Notification] Homestay not found for booking:", bookingId); return; }
    const host = homestay.host;
    if (!host) { console.error("[Notification] Host not found for homestay:", homestay.id); return; }

    const { homestay: _h, room: roomFromJoin, ...bookingFields } = joined;
    void _h;
    const booking = bookingFields as Booking;
    const room = roomFromJoin;

    const details = {
      booking,
      homestay: homestay as Homestay,
      host: host as Host,
      room: (room as Room) || undefined,
    };

    const emailType = isVerified ? "confirmed" : "pending";
    const hostNotifType = isVerified ? "confirmed" : "flagged";

    const emailResult = await sendBookingConfirmationEmail(details, locale, emailType);
    console.log("[Notification] Email result:", emailResult);

    // Host notification: dispatch with retry + email fallback
    const statusLabel = hostNotifType === "confirmed" ? "ยืนยันแล้ว" : "รอตรวจสอบ";
    await dispatchHostNotification(
      details,
      () => sendHostSmsNotification(details, hostNotifType),
      () => sendHostLineNotification(details, hostNotifType),
      `การจองใหม่ — ${statusLabel}`,
      () => buildNewBookingMessage(details, hostNotifType),
    );
  } catch (error) {
    console.error("Notification error (non-blocking):", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = bookingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid booking data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const supabase = createServiceRoleClient();

    // Check if host is soft-blocked (free expired, overdue invoice, or overdrawn wallet)
    const { data: homestayHost } = await supabase
      .from("homestays")
      .select("host_id")
      .eq("id", data.homestay_id)
      .single();
    const hostId = (homestayHost as { host_id: string } | null)?.host_id;
    if (hostId) {
      const [{ isHostBlocked }, { getHostBlockState }] = await Promise.all([
        import("@/lib/plan-expiry"),
        import("@/lib/billing"),
      ]);
      const blockState = await getHostBlockState(hostId);
      if (blockState && isHostBlocked(blockState)) {
        return NextResponse.json(
          { error: "This homestay is temporarily unavailable for new bookings" },
          { status: 403 }
        );
      }
    }

    // Server-side price verification: never trust client-supplied total_price
    if (data.room_id) {
      // Parallel: room price + seasonal prices + option prices (if any)
      const optionIds = data.selected_options.map((o) => o.id);
      const [{ data: roomRow, error: roomError }, { data: seasonRows }, { data: dbOptions }] = await Promise.all([
        supabase.from("rooms").select("price_per_night").eq("id", data.room_id).single(),
        supabase.from("room_seasonal_prices").select("*").eq("room_id", data.room_id),
        optionIds.length > 0
          ? supabase.from("room_options").select("id, price").eq("room_id", data.room_id).in("id", optionIds)
          : Promise.resolve({ data: null }),
      ]);

      if (roomError || !roomRow) {
        return NextResponse.json(
          { error: "Room not found" },
          { status: 404 }
        );
      }

      const room = roomRow as unknown as { price_per_night: number };
      const checkIn = new Date(data.check_in);
      const checkOut = new Date(data.check_out);
      const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

      if (nights <= 0) {
        return NextResponse.json(
          { error: "Invalid date range" },
          { status: 400 }
        );
      }

      const seasons = (seasonRows as unknown as RoomSeasonalPrice[]) || [];

      const { total: serverBasePrice } = calculateTotalPrice(room.price_per_night, checkIn, checkOut, seasons);

      // Validate selected options prices against DB (per-night pricing)
      let serverOptionsTotal = 0;
      if (optionIds.length > 0) {
        const dbMap = new Map((dbOptions as { id: string; price: number }[] || []).map((o) => [o.id, o.price]));
        for (const opt of data.selected_options) {
          const dbPrice = dbMap.get(opt.id);
          if (dbPrice !== undefined) {
            opt.price = dbPrice * nights; // enforce DB price × nights
            serverOptionsTotal += dbPrice * nights;
          }
        }
      }

      const subtotal = serverBasePrice + serverOptionsTotal;

      // Resolve promo code (if supplied) and apply discount before price-mismatch check.
      // Promo state is stashed on `req` via locals — use a closure on the outer scope.
      let serverPrice = subtotal;
      if (data.promo_code_id) {
        const { data: homestayFlag } = await supabase
          .from("homestays")
          .select("promo_codes_enabled")
          .eq("id", data.homestay_id)
          .single();
        const flagEnabled = (homestayFlag as { promo_codes_enabled: boolean } | null)?.promo_codes_enabled;
        if (!flagEnabled) {
          return NextResponse.json({ error: "Promo codes are not enabled for this homestay" }, { status: 400 });
        }

        const { data: promoRow } = await supabase
          .from("promo_codes")
          .select("*")
          .eq("id", data.promo_code_id)
          .eq("homestay_id", data.homestay_id)
          .maybeSingle();
        const promo = promoRow as unknown as PromoCode | null;
        if (!promo) {
          return NextResponse.json({ error: "Invalid promo code" }, { status: 400 });
        }

        const verdict = evaluatePromoCode(promo);
        if (!verdict.ok) {
          return NextResponse.json({ error: `Promo code rejected (${verdict.reason})` }, { status: 400 });
        }

        if (promo.one_use_per_guest) {
          const phone = data.guest_phone.trim();
          const email = data.guest_email.trim().toLowerCase();
          const { data: existing } = await supabase
            .from("promo_redemptions")
            .select("id")
            .eq("promo_code_id", promo.id)
            .or(`guest_phone.eq.${phone},guest_email.eq.${email}`)
            .limit(1);
          if (existing && existing.length > 0) {
            return NextResponse.json({ error: "Promo code already used by this guest" }, { status: 400 });
          }
        }

        // Always attach _promo (even when discount = 0) so commission-only /
        // pure-attribution codes still write a redemption row and tick times_used.
        const discount = computePromoDiscount(promo, subtotal);
        serverPrice = Math.max(0, subtotal - discount);
        (data as typeof data & { _promo: { promo: PromoCode; discount: number; subtotal: number } })._promo = {
          promo,
          discount,
          subtotal,
        };
      }

      if (data.total_price !== serverPrice) {
        console.warn(`[Security] Price mismatch: client=${data.total_price}, server=${serverPrice} (base=${serverBasePrice}, options=${serverOptionsTotal})`);
        data.total_price = serverPrice;
      }
    }

    // Validate payment_type and amount_paid
    if (data.payment_type === "deposit") {
      // Single joined query for host deposit config
      const { data: depositRow } = await supabase
        .from("homestays")
        .select("hosts(deposit_amount, deposit_by_month)")
        .eq("id", data.homestay_id)
        .single();

      const hostData = (depositRow as unknown as { hosts: { deposit_amount: number; deposit_by_month: Record<string, number> | null } | null })?.hosts;
      const checkInDate = new Date(data.check_in);
      const hostDeposit = hostData ? getDepositForMonth(hostData, checkInDate) : 0;
      if (hostDeposit <= 0) {
        return NextResponse.json(
          { error: "Deposit payment is not enabled for this homestay" },
          { status: 400 }
        );
      }
      // Server enforces the host's deposit amount for the check-in month
      data.amount_paid = hostDeposit;
    } else {
      // Full payment: amount_paid = total_price
      data.amount_paid = data.total_price;
    }

    // Atomic booking creation: checks overlap + blocked dates + inserts in one transaction
    const promoState = (data as typeof data & { _promo?: { promo: PromoCode; discount: number; subtotal: number } })._promo;
    if (data.room_id) {
      const { data: bookingId, error: rpcError } = await supabase.rpc(
        "create_booking_atomic" as never,
        {
          p_homestay_id: data.homestay_id,
          p_room_id: data.room_id,
          p_guest_name: data.guest_name,
          p_guest_email: data.guest_email,
          p_guest_phone: data.guest_phone,
          p_guest_province: data.guest_province || null,
          p_check_in: data.check_in,
          p_check_out: data.check_out,
          p_num_guests: data.num_guests,
          p_total_price: data.total_price,
          p_status: data.easyslip_verified ? "confirmed" : "pending",
          p_easyslip_verified: data.easyslip_verified,
          p_payment_slip_hash: data.slip_hash,
          p_slip_trans_ref: data.slip_trans_ref || null,
          p_payment_slip_url: data.payment_slip_url || null,
          p_easyslip_response: data.easyslip_response || null,
          p_session_id: data.session_id || null,
          p_notes: data.notes || null,
          p_payment_type: data.payment_type || "full",
          p_amount_paid: data.amount_paid || data.total_price,
          p_created_by: data.guest_name,
          p_selected_options: data.selected_options,
          p_discount_amount: promoState?.discount || 0,
        } as never
      );

      if (rpcError) {
        console.error("Atomic booking error:", rpcError);

        if (rpcError.message?.includes("DATES_UNAVAILABLE")) {
          return NextResponse.json(
            { error: "Selected dates are no longer available for this room" },
            { status: 409 }
          );
        }
        if (rpcError.message?.includes("DATES_BLOCKED")) {
          return NextResponse.json(
            { error: "Some selected dates are blocked by the host" },
            { status: 409 }
          );
        }
        if (rpcError.message?.includes("ROOM_NOT_FOUND")) {
          return NextResponse.json(
            { error: "Room not found" },
            { status: 404 }
          );
        }

        return NextResponse.json(
          { error: "Failed to create booking" },
          { status: 500 }
        );
      }

      // Fetch the created booking for the response
      const { data: booking } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", bookingId as string)
        .single();

      // Persist promo redemption (if applied) and increment usage counter.
      if (promoState) {
        const { promo, discount, subtotal } = promoState;
        const commission = computeCommissionAmount(promo, subtotal);
        const { error: redemptionErr } = await supabase
          .from("promo_redemptions")
          .insert({
            promo_code_id: promo.id,
            booking_id: bookingId as string,
            discount_amount: discount,
            commission_amount: commission,
            payout_status: "pending",
            guest_phone: data.guest_phone.trim(),
            guest_email: data.guest_email.trim().toLowerCase(),
            created_by: data.guest_name,
            updated_by: data.guest_name,
          } as never);
        if (redemptionErr) {
          console.error("[Promo] Failed to record redemption:", redemptionErr);
        } else {
          await supabase
            .from("promo_codes")
            .update({ times_used: promo.times_used + 1 } as never)
            .eq("id", promo.id);
        }
      }

      if (data.easyslip_verified) {
        await deductCommission(bookingId as string);
      }

      // Logging + notifications can safely live in after() — they're non-critical.
      after(async () => {
        await logEvent({
          homestayId: data.homestay_id,
          entityType: "booking",
          entityId: bookingId as string,
          eventType: data.easyslip_verified ? EventType.BOOKING_CONFIRMED : EventType.BOOKING_CREATED,
          actorType: "guest",
          actorId: null,
          data: { guest_name: data.guest_name, check_in: data.check_in, check_out: data.check_out, total_price: data.total_price, room_id: data.room_id, payment_type: data.payment_type, promo_code_id: data.promo_code_id || null },
          req,
        });
        await sendNotifications(bookingId as string, supabase, data.locale || "th", data.easyslip_verified);
        if (promoState && data.easyslip_verified) {
          await sendRecommenderPromoUsedNotification({
            promo: promoState.promo,
            bookingId: bookingId as string,
            guestName: data.guest_name,
            discountAmount: promoState.discount,
            commissionAmount: computeCommissionAmount(promoState.promo, promoState.subtotal),
          }, data.locale || "th").catch((e) => console.error("[Promo] Recommender notify failed:", e));
        }
      });

      if (data.easyslip_verified) revalidateTag("admin-stats", "max");
      revalidateTag(`booking-availability:${data.homestay_id}`, "max");
      return NextResponse.json({ booking }, { status: 201 });
    }

    // Fallback for bookings without a room_id (shouldn't happen in normal flow)
    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        homestay_id: data.homestay_id,
        room_id: null,
        guest_name: data.guest_name,
        guest_email: data.guest_email,
        guest_phone: data.guest_phone,
        guest_province: data.guest_province || null,
        check_in: data.check_in,
        check_out: data.check_out,
        num_guests: data.num_guests,
        total_price: data.total_price,
        discount_amount: promoState?.discount || 0,
        status: data.easyslip_verified ? "confirmed" : "pending",
        easyslip_verified: data.easyslip_verified,
        payment_slip_hash: data.slip_hash,
        slip_trans_ref: data.slip_trans_ref || null,
        payment_slip_url: data.payment_slip_url || null,
        easyslip_response: data.easyslip_response || null,
        notes: data.notes || null,
        payment_type: data.payment_type || "full",
        amount_paid: data.amount_paid || data.total_price,
        created_by: data.guest_name,
      } as never)
      .select()
      .single();

    if (error) {
      console.error("Supabase booking insert error:", error);
      return NextResponse.json(
        { error: "Failed to create booking" },
        { status: 500 }
      );
    }

    // Commission deduction is financial — run synchronously before response.
    if (data.easyslip_verified) {
      await deductCommission((booking as unknown as Booking).id);
    }

    // Logging + notifications can safely live in after() — they're non-critical.
    after(async () => {
      await logEvent({
        homestayId: data.homestay_id,
        entityType: "booking",
        entityId: (booking as unknown as Booking).id,
        eventType: data.easyslip_verified ? EventType.BOOKING_CONFIRMED : EventType.BOOKING_CREATED,
        actorType: "guest",
        actorId: null,
        data: { guest_name: data.guest_name, check_in: data.check_in, check_out: data.check_out, total_price: data.total_price, payment_type: data.payment_type },
        req,
      });
      await sendNotifications((booking as unknown as Booking).id, supabase, data.locale || "th", data.easyslip_verified);
    });

    if (data.easyslip_verified) revalidateTag("admin-stats", "max");
    revalidateTag(`booking-availability:${data.homestay_id}`, "max");
    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    console.error("Booking creation error:", error);
    return NextResponse.json(
      { error: "Failed to create booking" },
      { status: 500 }
    );
  }
}
