import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  sendGroupBookingConfirmationEmail,
  sendGroupHostLineNotification,
  sendGroupHostSmsNotification,
  dispatchGroupHostNotification,
  buildGroupBookingMessage,
  sendRecommenderPromoUsedNotification,
  type GroupBookingDetails,
} from "@/lib/notifications";
import type { Booking, BookingGroup, Homestay, Host, PromoCode, Room } from "@/types/database";
import { verifyRoomLineItem, splitProportional, type LineItemInput } from "@/lib/booking-pricing";
import { getDepositForMonth } from "@/lib/get-deposit";
import { logEvent, EventType } from "@/lib/history-log";
import { deductCommission } from "@/lib/billing";
import { computeCommissionAmount, computePromoDiscount, evaluatePromoCode } from "@/lib/promo-codes";

const groupSchema = z.object({
  homestay_id: z.string().uuid(),
  guest_name: z.string().min(1, "Name is required"),
  guest_email: z.string().email("Valid email required"),
  guest_phone: z.string().min(1, "Phone is required"),
  guest_province: z.string().optional(),
  notes: z.string().optional(),
  locale: z.string().optional(),
  payment_type: z.enum(["full", "deposit"]).optional().default("full"),
  promo_code_id: z.string().uuid().optional(),
  session_id: z.string().optional(),
  // Slip verification data (slip verified ONCE for the combined amount)
  slip_hash: z.string().min(1, "Slip hash is required"),
  slip_trans_ref: z.string().nullable().optional(),
  payment_slip_url: z.string().nullable().optional(),
  easyslip_response: z.unknown().optional(),
  easyslip_verified: z.boolean().optional().default(true),
  items: z
    .array(
      z.object({
        room_id: z.string().uuid(),
        check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
        check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
        num_guests: z.number().int().min(1),
        guest_pricing_id: z.string().uuid().optional(),
        selected_options: z
          .array(
            z.object({
              id: z.string().uuid(),
              name: z.string(),
              price: z.number().int().min(0),
              unit_price: z.number().int().min(0).optional(),
              pricing_type: z.enum(["per_night", "per_time"]).optional(),
            }),
          )
          .optional()
          .default([]),
        total_price: z.number().int().min(0).optional(),
      }),
    )
    .min(1, "At least one room is required"),
});

async function sendGroupNotifications(
  groupId: string,
  supabase: ReturnType<typeof createServiceRoleClient>,
  locale: string,
  isVerified: boolean,
) {
  try {
    const { data: groupRow } = await supabase
      .from("booking_groups")
      .select("*, homestay:homestays(*, host:hosts(*))")
      .eq("id", groupId)
      .single();
    if (!groupRow) {
      console.error("[Notification] Booking group not found:", groupId);
      return;
    }

    const joined = groupRow as unknown as BookingGroup & {
      homestay: (Homestay & { host: Host | null }) | null;
    };
    const homestay = joined.homestay;
    if (!homestay) return;
    const host = homestay.host;
    if (!host) return;

    const { homestay: _h, ...groupFields } = joined;
    void _h;
    const group = groupFields as BookingGroup;

    const { data: memberRows } = await supabase
      .from("bookings")
      .select("*, room:rooms(*)")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });

    const items = ((memberRows as unknown as (Booking & { room: Room | null })[]) || []).map((row) => {
      const { room, ...bookingFields } = row;
      return { booking: bookingFields as Booking, room: (room as Room) || undefined };
    });

    const details: GroupBookingDetails = {
      group,
      homestay: homestay as Homestay,
      host: host as Host,
      items,
    };

    const emailType = isVerified ? "confirmed" : "pending";
    const hostNotifType = isVerified ? "confirmed" : "flagged";

    await sendGroupBookingConfirmationEmail(details, locale, emailType);

    const statusLabel = hostNotifType === "confirmed" ? "ยืนยันแล้ว" : "รอตรวจสอบ";
    await dispatchGroupHostNotification(
      details,
      () => sendGroupHostSmsNotification(details, hostNotifType),
      () => sendGroupHostLineNotification(details, hostNotifType),
      `การจองใหม่ (${items.length} ห้อง) — ${statusLabel}`,
      () => buildGroupBookingMessage(details, hostNotifType),
    );
  } catch (error) {
    console.error("Group notification error (non-blocking):", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = groupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid booking data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = parsed.data;
    const supabase = createServiceRoleClient();
    const locale = data.locale || "th";

    // Homestay + host config (block check + deposit) in one query.
    const { data: hsRow } = await supabase
      .from("homestays")
      .select("host_id, promo_codes_enabled, hosts(deposit_amount, deposit_by_month)")
      .eq("id", data.homestay_id)
      .single();
    const homestayRow = hsRow as unknown as {
      host_id: string;
      promo_codes_enabled: boolean;
      hosts: { deposit_amount: number; deposit_by_month: Record<string, number> | null } | null;
    } | null;
    if (!homestayRow) {
      return NextResponse.json({ error: "Homestay not found" }, { status: 404 });
    }

    // Soft-block check (expired plan / overdue invoice / overdrawn wallet)
    if (homestayRow.host_id) {
      const [{ isHostBlocked }, { getHostBlockState }] = await Promise.all([
        import("@/lib/plan-expiry"),
        import("@/lib/billing"),
      ]);
      const blockState = await getHostBlockState(homestayRow.host_id);
      if (blockState && isHostBlocked(blockState)) {
        return NextResponse.json(
          { error: "This homestay is temporarily unavailable for new bookings" },
          { status: 403 },
        );
      }
    }

    // ---- Per-item server price re-verification (never trust client) ----
    const verified = [];
    for (const item of data.items) {
      const result = await verifyRoomLineItem(supabase, data.homestay_id, item as LineItemInput, locale);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      verified.push(result.data);
    }

    const combinedSubtotal = verified.reduce((sum, v) => sum + v.gross, 0);
    const weights = verified.map((v) => v.gross);

    // ---- Promo (resolved once against the combined subtotal) ----
    let combinedDiscount = 0;
    let promoState: { promo: PromoCode; discount: number; subtotal: number } | null = null;
    if (data.promo_code_id) {
      if (!homestayRow.promo_codes_enabled) {
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
      combinedDiscount = computePromoDiscount(promo, combinedSubtotal);
      promoState = { promo, discount: combinedDiscount, subtotal: combinedSubtotal };
    }

    const combinedTotal = Math.max(0, combinedSubtotal - combinedDiscount);

    // ---- Deposit (sum of per-room host deposit, by each room's check-in month) ----
    let amountPaid = combinedTotal;
    let paymentType = data.payment_type;
    if (paymentType === "deposit") {
      const hostDeposit = homestayRow.hosts;
      const combinedDeposit = hostDeposit
        ? verified.reduce((sum, v) => sum + getDepositForMonth(hostDeposit, new Date(v.check_in)), 0)
        : 0;
      const clampedDeposit = Math.min(combinedDeposit, combinedTotal);
      if (clampedDeposit <= 0) {
        return NextResponse.json({ error: "Deposit payment is not enabled for this homestay" }, { status: 400 });
      }
      amountPaid = clampedDeposit;
    } else {
      paymentType = "full";
    }

    // ---- Per-row money split (largest-remainder → Σ rows ≡ group exactly) ----
    const discountShares = splitProportional(combinedDiscount, weights);
    const nets = verified.map((v, i) => Math.max(0, v.gross - discountShares[i]));
    const amountPaidShares = paymentType === "deposit" ? splitProportional(amountPaid, weights) : [...nets];

    const rpcItems = verified.map((v, i) => ({
      room_id: v.room_id,
      check_in: v.check_in,
      check_out: v.check_out,
      num_guests: v.num_guests,
      total_price: nets[i],
      discount_amount: discountShares[i],
      amount_paid: amountPaidShares[i],
      selected_options: v.selected_options,
      guest_pricing_label: v.guest_pricing_label,
      guest_pricing_surcharge: v.guest_pricing_surcharge,
    }));

    const status = data.easyslip_verified ? "confirmed" : "pending";

    const { data: groupId, error: rpcError } = await supabase.rpc("create_booking_group_atomic" as never, {
      p_homestay_id: data.homestay_id,
      p_guest_name: data.guest_name,
      p_guest_email: data.guest_email,
      p_guest_phone: data.guest_phone,
      p_guest_province: data.guest_province || null,
      p_notes: data.notes || null,
      p_status: status,
      p_easyslip_verified: data.easyslip_verified,
      p_payment_slip_hash: data.slip_hash,
      p_slip_trans_ref: data.slip_trans_ref || null,
      p_payment_slip_url: data.payment_slip_url || null,
      p_easyslip_response: data.easyslip_response || null,
      p_payment_type: paymentType,
      p_amount_paid: amountPaid,
      p_total_price: combinedTotal,
      p_discount_amount: combinedDiscount,
      p_session_id: data.session_id || null,
      p_created_by: data.guest_name,
      p_booking_source: "guest",
      p_items: rpcItems,
    } as never);

    if (rpcError) {
      console.error("Atomic group booking error:", rpcError);
      const msg = rpcError.message || "";
      if (msg.includes("DATES_UNAVAILABLE")) {
        return NextResponse.json(
          { error: "One of the selected rooms is no longer available for these dates", code: "DATES_UNAVAILABLE" },
          { status: 409 },
        );
      }
      if (msg.includes("DATES_BLOCKED")) {
        return NextResponse.json(
          { error: "Some selected dates are blocked by the host", code: "DATES_BLOCKED" },
          { status: 409 },
        );
      }
      if (msg.includes("ROOM_NOT_FOUND")) {
        return NextResponse.json({ error: "Room not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
    }

    const gid = groupId as unknown as string;

    // Fetch the created group + member bookings for the response.
    const [{ data: group }, { data: bookings }] = await Promise.all([
      supabase.from("booking_groups").select("*").eq("id", gid).single(),
      supabase.from("bookings").select("*").eq("group_id", gid).order("created_at", { ascending: true }),
    ]);

    const memberBookings = (bookings as unknown as Booking[]) || [];

    // Promo redemption — one row attached to the group.
    if (promoState) {
      const { promo, discount, subtotal } = promoState;
      const commission = computeCommissionAmount(promo, subtotal);
      const { error: redemptionErr } = await supabase.from("promo_redemptions").insert({
        promo_code_id: promo.id,
        booking_id: null,
        group_id: gid,
        discount_amount: discount,
        commission_amount: commission,
        payout_status: "pending",
        guest_phone: data.guest_phone.trim(),
        guest_email: data.guest_email.trim().toLowerCase(),
        created_by: data.guest_name,
        updated_by: data.guest_name,
      } as never);
      if (redemptionErr) {
        console.error("[Promo] Failed to record group redemption:", redemptionErr);
      } else {
        await supabase
          .from("promo_codes")
          .update({ times_used: promoState.promo.times_used + 1 } as never)
          .eq("id", promoState.promo.id);
      }
    }

    // Commission deduction is financial — run synchronously, per member row.
    if (data.easyslip_verified) {
      for (const b of memberBookings) {
        await deductCommission(b.id);
      }
    }

    after(async () => {
      await logEvent({
        homestayId: data.homestay_id,
        entityType: "booking",
        entityId: gid,
        eventType: data.easyslip_verified ? EventType.BOOKING_CONFIRMED : EventType.BOOKING_CREATED,
        actorType: "guest",
        actorId: null,
        data: {
          guest_name: data.guest_name,
          group_id: gid,
          room_count: memberBookings.length,
          room_ids: memberBookings.map((b) => b.room_id),
          total_price: combinedTotal,
          payment_type: paymentType,
          promo_code_id: data.promo_code_id || null,
        },
        req,
      });
      await sendGroupNotifications(gid, supabase, locale, data.easyslip_verified);
      if (promoState && data.easyslip_verified) {
        await sendRecommenderPromoUsedNotification(
          {
            promo: promoState.promo,
            bookingId: gid,
            guestName: data.guest_name,
            discountAmount: promoState.discount,
            commissionAmount: computeCommissionAmount(promoState.promo, promoState.subtotal),
          },
          locale,
        ).catch((e) => console.error("[Promo] Recommender notify failed:", e));
      }
    });

    if (data.easyslip_verified) revalidateTag("admin-stats", "max");
    revalidateTag(`booking-availability:${data.homestay_id}`, "max");

    return NextResponse.json({ group, bookings: memberBookings }, { status: 201 });
  } catch (error) {
    console.error("Group booking creation error:", error);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }
}
