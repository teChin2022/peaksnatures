import { createServiceRoleClient } from "@/lib/supabase/server";
import { logEvent, EventType } from "@/lib/history-log";
import type { HostBlockState } from "@/lib/plan-expiry";
import type { FixedRateTermTier, Host, PlatformBillingConfig } from "@/types/database";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/**
 * Commission hosts are warned by SMS/LINE once their wallet dips below this,
 * giving them room to top up before the balance goes negative and the
 * GRACE_PERIOD_DAYS countdown to a booking block starts.
 */
export const LOW_WALLET_THRESHOLD = 300;

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

function getTermTiers(config: PlatformBillingConfig): FixedRateTermTier[] {
  return Array.isArray(config.fixed_rate_term_tiers)
    ? (config.fixed_rate_term_tiers as FixedRateTermTier[])
    : [];
}

export function getFixedRateDiscount(
  months: number,
  config: PlatformBillingConfig,
): number {
  const tier = getTermTiers(config).find((t) => Number(t.months) === months);
  return tier ? Number(tier.discount_pct) : 0;
}

export function isValidTermMonths(
  months: number,
  config: PlatformBillingConfig,
): boolean {
  return getTermTiers(config).some((t) => Number(t.months) === months);
}

/**
 * Compute one upfront invoice covering `months` calendar months starting at
 * `startDate`. The amount is `monthly_rate × months × (1 − discount%)`.
 * `period_end` is the last day of the (startDate.month + months - 1) month.
 */
export function computeFixedRateInvoice(
  host: Pick<Host, "fixed_rate_override">,
  config: PlatformBillingConfig,
  months: number,
  startDate: Date,
): {
  amount: number;
  period_start: string;
  period_end: string;
  term_months: number;
  discount_pct: number;
} {
  const monthly = getEffectiveFixedRate(host, config);
  const discount = getFixedRateDiscount(months, config);
  const amount = Math.round(monthly * months * (1 - discount / 100));
  const period_start = startDate.toISOString().split("T")[0];
  const end = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + months, 0),
  );
  const period_end = end.toISOString().split("T")[0];
  return { amount, period_start, period_end, term_months: months, discount_pct: discount };
}

/** Today as YYYY-MM-DD (UTC), matching how invoice due_date is written. */
export function utcToday(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * PostgREST filter for "this invoice is blocking the host".
 *
 * Two ways an invoice blocks:
 *  - status = 'overdue' — either the cron flipped it, or an admin marked it
 *    overdue by hand (which stays a working lever even before the due date).
 *  - status = 'pending' and the due date has passed — the block is driven by
 *    due_date directly rather than waiting on the cron, so a missed or failed
 *    cron run can't hand a non-paying host extra free days.
 *
 * `due_date < today` means an invoice due on the 5th still allows bookings on
 * the 5th and blocks them from the 6th onwards.
 */
export function blockingInvoiceFilter(today = utcToday()): string {
  return `status.eq.overdue,and(status.eq.pending,due_date.lt.${today})`;
}

/** Host ids among `hostIds` that have an invoice blocking new bookings. */
export async function fetchPastDueHostIds(
  hostIds: string[],
  client?: ServiceClient,
): Promise<Set<string>> {
  if (hostIds.length === 0) return new Set();
  const supabase = client ?? createServiceRoleClient();
  const { data } = await supabase
    .from("invoices")
    .select("host_id")
    .in("host_id", hostIds)
    .or(blockingInvoiceFilter());
  return new Set(((data as { host_id: string }[] | null) ?? []).map((r) => r.host_id));
}

/** Single-host variant of fetchPastDueHostIds. */
export async function hasPastDueInvoice(
  hostId: string,
  client?: ServiceClient,
): Promise<boolean> {
  const supabase = client ?? createServiceRoleClient();
  const { data } = await supabase
    .from("invoices")
    .select("id")
    .eq("host_id", hostId)
    .or(blockingInvoiceFilter())
    .limit(1);
  return ((data as unknown[] | null)?.length ?? 0) > 0;
}

/**
 * Fetch the full state needed by isHostBlocked for a given host.
 * Does one hosts read and (for fixed_rate) one invoices read.
 */
export async function getHostBlockState(hostId: string): Promise<HostBlockState | null> {
  const supabase = createServiceRoleClient();
  const { data: hostRow } = await supabase
    .from("hosts")
    .select("plan_type, plan_free_expires_at, wallet_balance, wallet_credit_limit, wallet_negative_since")
    .eq("id", hostId)
    .single();

  if (!hostRow) return null;
  const host = hostRow as {
    plan_type: string;
    plan_free_expires_at: string | null;
    wallet_balance: number | null;
    wallet_credit_limit: number | null;
    wallet_negative_since: string | null;
  };

  const has_past_due_invoice =
    host.plan_type === "fixed_rate" ? await hasPastDueInvoice(hostId, supabase) : false;

  return {
    plan_type: host.plan_type,
    plan_free_expires_at: host.plan_free_expires_at,
    wallet_balance: host.wallet_balance ?? 0,
    wallet_credit_limit: host.wallet_credit_limit,
    wallet_negative_since: host.wallet_negative_since,
    has_past_due_invoice,
  };
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
      .select("id, total_price, discount_amount, commission_base, homestay_id")
      .eq("id", bookingId)
      .single();

    const booking = bookingRow as {
      id: string;
      total_price: number;
      discount_amount: number | null;
      commission_base: number | null;
      homestay_id: string;
    } | null;
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
      .select("id, plan_type, commission_pct_override, wallet_balance, wallet_credit_limit, name, email, phone, notification_preference, line_channel_access_token, line_user_id")
      .eq("id", homestay.host_id)
      .single();

    const host = hostRow as {
      id: string;
      plan_type: string;
      commission_pct_override: number | null;
      wallet_balance: number;
      wallet_credit_limit: number | null;
      name: string;
      email: string | null;
      phone: string | null;
      notification_preference: string | null;
      line_channel_access_token: string | null;
      line_user_id: string | null;
    } | null;
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
    // Platform commission is charged on the original subtotal (GMV) so
    // a host-issued promo doesn't silently shrink the platform's cut.
    // total_price is post-discount; adding discount_amount reconstructs
    // the original subtotal.
    //
    // commission_base overrides that when set — quick bookings carry a
    // host-entered total_price (an OTA/walk-in figure that may be 0), so they
    // are charged on the room's own configured rate instead.
    const commissionBase =
      booking.commission_base ?? booking.total_price + (booking.discount_amount || 0);
    // Wallet stores integer baht. Floor sub-baht commissions up to 1 so
    // small bookings still deduct something instead of silently rounding to 0.
    const rawCommission = commissionBase * commissionPct / 100;
    const commissionAmount =
      rawCommission > 0 && rawCommission < 1 ? 1 : Math.round(rawCommission);

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
      await enqueueBillingRetry(bookingId, "deduct_commission", deductError.message);
      return;
    }

    const newBalance = (result as { new_balance: number }[])?.[0]?.new_balance ?? 0;

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
        discount_amount: booking.discount_amount || 0,
        commission_base: commissionBase,
        commission_pct: commissionPct,
        commission_amount: commissionAmount,
        new_balance: newBalance,
      },
    });

    // Notify host if wallet balance went negative
    if (newBalance < 0) {
      const creditLimit = host.wallet_credit_limit ?? 0;
      const overLimit = newBalance < -creditLimit;
      await notifyNegativeBalance(host, newBalance, overLimit);
    }
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
      await enqueueBillingRetry(bookingId, "refund_commission", refundError.message);
      return;
    }

    const newBalance = (result as { new_balance: number }[])?.[0]?.new_balance ?? 0;

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

/**
 * Notify host when wallet balance goes negative after commission deduction.
 * Tries LINE → SMS → email in order until one succeeds.
 */
async function notifyNegativeBalance(
  host: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    notification_preference: string | null;
    line_channel_access_token: string | null;
    line_user_id: string | null;
  },
  balance: number,
  overLimit: boolean = false,
): Promise<void> {
  const urgencyPrefix = overLimit ? "URGENT: " : "";
  const message = overLimit
    ? `[Peaksnature] ${urgencyPrefix}ยอดเงินติดลบเกินวงเงินเครดิตของคุณ ฿${Math.abs(balance).toLocaleString()} — การรับจองใหม่จะถูกระงับหากยังไม่ชำระ / Your wallet is overdrawn beyond your credit limit (-฿${Math.abs(balance).toLocaleString()}). New bookings will be blocked until you top up.`
    : `[Peaksnature] ยอดเงินคงเหลือของคุณติดลบ ฿${Math.abs(balance).toLocaleString()} กรุณาเติมเงินเพื่อป้องกันการหยุดให้บริการ / Your wallet balance is -฿${Math.abs(balance).toLocaleString()}. Please top up to avoid service interruption.`;

  const preference = host.notification_preference || "sms";

  try {
    // LINE first if preferred and configured
    if (preference === "line" && host.line_channel_access_token && host.line_user_id) {
      const response = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${host.line_channel_access_token}`,
        },
        body: JSON.stringify({
          to: host.line_user_id,
          messages: [{ type: "text", text: message }],
        }),
      });

      if (response.ok) {
        return;
      }
      console.error("[Billing] LINE notification failed, falling back to SMS");
    }

    // SMS fallback
    if (host.phone) {
      const { sendSms } = await import("@/lib/notifications");
      const result = await sendSms(host.phone, message);
      if (result.success) {
        return;
      }
      console.error("[Billing] SMS notification failed, falling back to email");
    }

    // Email fallback via Resend
    if (host.email) {
      const apiKey = (process.env.RESEND_API_KEY || "").replace(/["']/g, "").trim();
      if (!apiKey) {
        console.warn(`[Billing] Email fallback skipped — RESEND_API_KEY not configured`);
      } else {
        const { Resend } = await import("resend");
        const resend = new Resend(apiKey);
        const cleaned = (process.env.RESEND_FROM_EMAIL || "").replace(/["'\r\n]/g, "").trim();
        const fromEmail = cleaned
          ? cleaned.replace(/<([^>]+)>/, (_, email: string) => `<${email.replace(/\s+/g, "")}>`)
          : "Peaksnature <onboarding@resend.dev>";

        await resend.emails.send({
          from: fromEmail,
          to: [host.email],
          subject: `${urgencyPrefix}Peaksnature: Wallet balance is -฿${Math.abs(balance).toLocaleString()}`,
          text: message,
        });
        return;
      }
    }

    console.warn(`[Billing] Could not notify host ${host.id} about negative balance — no channel available`);
  } catch (error) {
    console.error("[Billing] Failed to send negative balance notification:", error);
  }
}

/**
 * Insert a row into billing_retry_queue so the cron can retry a failed
 * deduct/refund. Idempotent: skips if a pending row already exists for this
 * (booking_id, operation) — the partial unique index enforces this at the DB
 * level, so we just swallow conflicts.
 */
export async function enqueueBillingRetry(
  bookingId: string,
  operation: "deduct_commission" | "refund_commission",
  errorMessage: string | null,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("billing_retry_queue")
    .insert({
      booking_id: bookingId,
      operation,
      last_error: errorMessage,
    } as never);
  if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
    console.error("[Billing] Failed to enqueue retry:", error);
  }
}

const MAX_RETRY_ATTEMPTS = 5;

/**
 * Process pending billing_retry_queue rows whose next_attempt_at has passed.
 * Called from the daily cron. Uses exponential backoff; escalates after
 * MAX_RETRY_ATTEMPTS and emits a BILLING_RETRY_EXHAUSTED event.
 */
export async function processBillingRetryQueue(): Promise<{
  processed: number;
  resolved: number;
  exhausted: number;
}> {
  const supabase = createServiceRoleClient();
  const { data: rows } = await supabase
    .from("billing_retry_queue")
    .select("id, operation, booking_id, attempts")
    .is("resolved_at", null)
    .lte("next_attempt_at", new Date().toISOString())
    .lt("attempts", MAX_RETRY_ATTEMPTS)
    .limit(100);

  const pending = (rows as {
    id: string;
    operation: "deduct_commission" | "refund_commission";
    booking_id: string;
    attempts: number;
  }[]) || [];

  let resolved = 0;
  let exhausted = 0;

  for (const row of pending) {
    const nextAttempts = row.attempts + 1;

    try {
      if (row.operation === "deduct_commission") {
        await deductCommission(row.booking_id);
      } else {
        await refundCommission(row.booking_id);
      }

      // Check whether the underlying operation succeeded by re-inspecting the
      // ledger. The helpers above are idempotent, so if a matching txn exists
      // the retry is resolved.
      const type = row.operation === "deduct_commission" ? "commission" : "refund";
      const { count: refundCount } = await supabase
        .from("wallet_transactions")
        .select("id", { count: "exact", head: true })
        .eq("reference_id", row.booking_id)
        .eq("type", "refund");
      const { count: commissionCount } = await supabase
        .from("wallet_transactions")
        .select("id", { count: "exact", head: true })
        .eq("reference_id", row.booking_id)
        .eq("type", "commission");

      const nowResolved =
        type === "commission"
          ? (commissionCount ?? 0) > (refundCount ?? 0)
          : (refundCount ?? 0) >= (commissionCount ?? 0) && (commissionCount ?? 0) > 0;

      if (nowResolved) {
        await supabase
          .from("billing_retry_queue")
          .update({
            resolved_at: new Date().toISOString(),
            attempts: nextAttempts,
            last_attempt_at: new Date().toISOString(),
          } as never)
          .eq("id", row.id);
        resolved++;
        continue;
      }

      // Still unresolved — schedule next attempt with exponential backoff.
      const backoffMs = 60 * 60 * 1000 * Math.pow(2, nextAttempts); // 2h, 4h, 8h, 16h, 32h
      const nextAt = new Date(Date.now() + backoffMs).toISOString();

      if (nextAttempts >= MAX_RETRY_ATTEMPTS) {
        await supabase
          .from("billing_retry_queue")
          .update({
            attempts: nextAttempts,
            last_attempt_at: new Date().toISOString(),
            last_error: "Max attempts reached without resolution",
          } as never)
          .eq("id", row.id);

        const { data: bk } = await supabase
          .from("bookings")
          .select("homestay_id")
          .eq("id", row.booking_id)
          .single();

        await logEvent({
          homestayId: (bk as { homestay_id: string } | null)?.homestay_id || null,
          entityType: "billing",
          entityId: row.booking_id,
          eventType: EventType.BILLING_RETRY_EXHAUSTED,
          actorType: "system",
          actorId: null,
          data: { operation: row.operation, attempts: nextAttempts },
        });
        exhausted++;
      } else {
        await supabase
          .from("billing_retry_queue")
          .update({
            attempts: nextAttempts,
            last_attempt_at: new Date().toISOString(),
            next_attempt_at: nextAt,
          } as never)
          .eq("id", row.id);
      }
    } catch (err) {
      console.error(`[Billing] Retry ${row.id} threw:`, err);
      const backoffMs = 60 * 60 * 1000 * Math.pow(2, nextAttempts);
      await supabase
        .from("billing_retry_queue")
        .update({
          attempts: nextAttempts,
          last_attempt_at: new Date().toISOString(),
          next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
          last_error: err instanceof Error ? err.message : String(err),
        } as never)
        .eq("id", row.id);
    }
  }

  return { processed: pending.length, resolved, exhausted };
}
