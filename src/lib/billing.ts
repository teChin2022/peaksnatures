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
  return host.commission_pct_override ?? config.commission_pct;
}

/**
 * Get the effective fixed rate for a host.
 * Uses per-host override if set, otherwise falls back to global config.
 */
export function getEffectiveFixedRate(
  host: Pick<Host, "fixed_rate_override">,
  config: PlatformBillingConfig,
): number {
  return host.fixed_rate_override ?? config.fixed_rate_amount;
}

/**
 * Deduct commission from host wallet when a booking is completed.
 * Called in the after() callback of the checkout flow.
 *
 * Uses the PostgreSQL `deduct_wallet_commission` function which:
 * - Acquires an advisory lock on the host
 * - Deducts from hosts.wallet_balance (can go negative)
 * - Inserts a wallet_transactions record
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
