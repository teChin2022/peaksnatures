import { createServiceRoleClient } from "@/lib/supabase/server";
import { logEvent, EventType } from "@/lib/history-log";
import type { Host, PlatformBillingConfig } from "@/types/database";

/**
 * Get the platform billing config (singleton row).
 */
export async function getBillingConfig(): Promise<PlatformBillingConfig | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("platform_billing_config")
    .select("*")
    .limit(1)
    .single();

  if (error) {
    console.error("[Billing] Failed to fetch billing config:", error);
    return null;
  }
  return data as unknown as PlatformBillingConfig;
}

/**
 * Get the effective commission percentage for a host.
 * Uses per-host override if set, otherwise falls back to global config.
 */
export function getEffectiveCommissionPct(
  host: Pick<Host, "commission_pct_override">,
  config: PlatformBillingConfig,
): number {
  return host.commission_pct_override || config.commission_pct;
}

/**
 * Get the effective fixed rate for a host.
 * Uses per-host override if set, otherwise falls back to global config.
 */
export function getEffectiveFixedRate(
  host: Pick<Host, "fixed_rate_override">,
  config: PlatformBillingConfig,
): number {
  return host.fixed_rate_override || config.fixed_rate_amount;
}

/**
 * Deduct commission from host wallet when a booking is confirmed.
 * Called in the after() callback when:
 * - Guest books with verified slip (auto-confirmed)
 * - Host manually approves a pending booking
 *
 * Idempotent: skips if commission already deducted (and not refunded).
 * Supports date-change cycles (deduct → refund → deduct).
 */
export async function deductCommission(bookingId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  try {
    // Fetch booking with homestay and host info
    const { data: bookingRow, error: bookingError } = await supabase
      .from("bookings")
      .select("id, total_price, homestay_id")
      .eq("id", bookingId)
      .single();

    const booking = bookingRow as { id: string; total_price: number; homestay_id: string } | null;
    if (bookingError || !booking) {
      console.error("[Billing] Booking not found for commission:", bookingId);
      return;
    }

    const { data: homestayRow, error: homestayError } = await supabase
      .from("homestays")
      .select("host_id")
      .eq("id", booking.homestay_id)
      .single();

    const homestay = homestayRow as { host_id: string } | null;
    if (homestayError || !homestay) {
      console.error("[Billing] Homestay not found for booking:", bookingId);
      return;
    }

    const { data: hostRow, error: hostError } = await supabase
      .from("hosts")
      .select("id, plan_type, commission_pct_override, wallet_balance, name, phone, notification_preference")
      .eq("id", homestay.host_id)
      .single();

    const host = hostRow as { id: string; plan_type: string; commission_pct_override: number | null; wallet_balance: number; name: string } | null;
    if (hostError || !host) {
      console.error("[Billing] Host not found for homestay:", homestay.host_id);
      return;
    }

    // Only deduct for commission plan hosts
    if (host.plan_type !== "commission") {
      return;
    }

    // Get global config for commission rate
    const config = await getBillingConfig();
    if (!config) {
      console.error("[Billing] Cannot deduct commission: billing config not found");
      return;
    }

    const commissionPct = getEffectiveCommissionPct(
      host as Pick<Host, "commission_pct_override">,
      config,
    );
    const commissionAmount = Math.round(
      booking.total_price * commissionPct / 100,
    );

    if (commissionAmount <= 0) return;

    // Idempotency: skip if commission already deducted (and not refunded)
    const [{ count: commissionCount }, { count: refundCount }] = await Promise.all([
      supabase
        .from("wallet_transactions")
        .select("id", { count: "exact", head: true })
        .eq("reference_id", bookingId)
        .eq("type", "commission"),
      supabase
        .from("wallet_transactions")
        .select("id", { count: "exact", head: true })
        .eq("reference_id", bookingId)
        .eq("type", "refund"),
    ]);

    if ((commissionCount ?? 0) > (refundCount ?? 0)) {
      console.log(`[Billing] Commission already deducted for booking ${bookingId}, skipping`);
      return;
    }

    // Call the atomic deduction function
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, error: deductError } = await (supabase.rpc as any)(
      "deduct_wallet_commission",
      {
        p_host_id: host.id,
        p_amount: commissionAmount,
        p_booking_id: bookingId,
        p_description: `Commission ${commissionPct}% on booking ${bookingId.slice(0, 8)}`,
      },
    );

    if (deductError) {
      console.error("[Billing] Commission deduction failed:", deductError);
      return;
    }

    const newBalance = (result as { new_balance: number }[])?.[0]?.new_balance ?? 0;

    console.log(
      `[Billing] Commission deducted: ฿${commissionAmount} (${commissionPct}%) from host ${host.id}, new balance: ฿${newBalance}`,
    );

    // Log the event
    await logEvent({
      homestayId: booking.homestay_id,
      entityType: "billing",
      entityId: bookingId,
      eventType: EventType.COMMISSION_DEDUCTED,
      actorType: "system",
      actorId: null,
      data: {
        host_id: host.id,
        booking_id: bookingId,
        total_price: booking.total_price,
        commission_pct: commissionPct,
        commission_amount: commissionAmount,
        new_balance: newBalance,
      },
    });
  } catch (error) {
    console.error("[Billing] Unexpected error in deductCommission:", error);
  }
}

/**
 * Refund commission to host wallet when a confirmed booking is cancelled
 * or when a date/room change requires recalculation.
 *
 * Refunds the exact amount from the original commission transaction.
 * No-op if no commission was ever deducted for this booking.
 * Idempotent: skips if already fully refunded (commissionCount <= refundCount).
 */
export async function refundCommission(bookingId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  try {
    // Find the most recent commission transaction for this booking
    const { data: commissionTxns, error: txnError } = await supabase
      .from("wallet_transactions")
      .select("id, host_id, amount")
      .eq("reference_id", bookingId)
      .eq("type", "commission")
      .order("created_at", { ascending: false });

    if (txnError || !commissionTxns || commissionTxns.length === 0) {
      // No commission was deducted — nothing to refund (e.g. pending booking)
      return;
    }

    // Check if already fully refunded
    const { count: refundCount } = await supabase
      .from("wallet_transactions")
      .select("id", { count: "exact", head: true })
      .eq("reference_id", bookingId)
      .eq("type", "refund");

    if (commissionTxns.length <= (refundCount ?? 0)) {
      console.log(`[Billing] Commission already refunded for booking ${bookingId}, skipping`);
      return;
    }

    // Use the most recent commission transaction for the refund amount
    const latestCommission = commissionTxns[0] as { id: string; host_id: string; amount: number };
    const refundAmount = Math.abs(latestCommission.amount);
    const hostId = latestCommission.host_id;

    if (refundAmount <= 0) return;

    // Fetch booking for logging context
    const { data: bookingRow } = await supabase
      .from("bookings")
      .select("homestay_id, total_price")
      .eq("id", bookingId)
      .single();

    const booking = bookingRow as { homestay_id: string; total_price: number } | null;

    // Call the atomic refund function
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, error: refundError } = await (supabase.rpc as any)(
      "refund_wallet_commission",
      {
        p_host_id: hostId,
        p_amount: refundAmount,
        p_booking_id: bookingId,
        p_description: `Commission refund for booking ${bookingId.slice(0, 8)}`,
      },
    );

    if (refundError) {
      console.error("[Billing] Commission refund failed:", refundError);
      return;
    }

    const newBalance = (result as { new_balance: number }[])?.[0]?.new_balance ?? 0;

    console.log(
      `[Billing] Commission refunded: ฿${refundAmount} to host ${hostId}, new balance: ฿${newBalance}`,
    );

    // Log the event
    if (booking) {
      await logEvent({
        homestayId: booking.homestay_id,
        entityType: "billing",
        entityId: bookingId,
        eventType: EventType.COMMISSION_REFUNDED,
        actorType: "system",
        actorId: null,
        data: {
          host_id: hostId,
          booking_id: bookingId,
          refund_amount: refundAmount,
          new_balance: newBalance,
        },
      });
    }
  } catch (error) {
    console.error("[Billing] Unexpected error in refundCommission:", error);
  }
}
