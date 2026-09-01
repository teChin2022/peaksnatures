import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logEvent, EventType } from "@/lib/history-log";
import { assertCronAuthorized } from "@/lib/auth/cron-auth";
import {
  computeFixedRateInvoice,
  getBillingConfig,
  getEffectiveFixedRate,
  isValidTermMonths,
  processBillingRetryQueue,
} from "@/lib/billing";
import { cronBillingDates } from "./dates";
import { LOW_WALLET_THRESHOLD } from "@/lib/wallet-thresholds";
import { GRACE_PERIOD_DAYS } from "@/lib/plan-expiry";
import { sendSms, notifyHostAlert } from "@/lib/notifications";
import { fmtDateStr } from "@/lib/format-date";
import type { Host, PlatformBillingConfig } from "@/types/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Host fields needed to route a multi-channel alert (LINE → SMS → email). */
type HostAlertRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notification_preference: string | null;
  line_channel_access_token: string | null;
  line_user_id: string | null;
  fixed_rate_term_ends_at?: string | null;
};

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const n = Math.min(limit, items.length);
  const runners = Array.from({ length: n }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        await worker(items[i]);
      } catch (err) {
        console.error("[Cron] worker error:", err);
      }
    }
  });
  await Promise.all(runners);
}

/**
 * GET /api/cron/billing
 * Daily cron job (triggered by Vercel Cron via GET).
 * - Every day: send SMS 3 days before free plan expiry, send SMS on expiry day,
 *   send SMS 5 days after expiry (grace period reminder), remind fixed-rate
 *   hosts 2 days before an invoice is due, mark past-due invoices overdue and
 *   alert those hosts that bookings have stopped, warn commission hosts whose
 *   wallet dipped below LOW_WALLET_THRESHOLD, and apply pending plan switches
 *   whose effective date has arrived.
 * - 1st of month only: generate invoices for fixed-rate hosts.
 * Secured with CRON_SECRET header.
 * Generate the secret: `openssl rand -base64 32`
 * Set CRON_SECRET in Vercel Environment Variables (both Production & Preview).
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
 */
export async function GET(req: NextRequest) {
  const unauthorized = assertCronAuthorized(req);
  if (unauthorized) return unauthorized;

  const supabase = createServiceRoleClient();
  const results: Record<string, unknown> = {};

  try {
    // Process billing retry queue first, so a transient RPC failure from
    // yesterday gets resolved before today's new work runs.
    try {
      results.retryQueue = await processBillingRetryQueue();
    } catch (err) {
      console.error("[Cron] Retry queue processing failed:", err);
      results.retryQueue = { error: err instanceof Error ? err.message : String(err) };
    }

    const config = await getBillingConfig();
    if (!config) {
      return NextResponse.json({ error: "Billing config not found" }, { status: 500 });
    }

    // Every date this run works from, derived once off the Bangkok billing
    // calendar. ago5Days/ago5DaysNext bound the grace-period reminder to hosts
    // whose plan expired exactly 5 days ago.
    const {
      todayDate,
      today,
      tomorrow: tomorrowStr,
      in3Days,
      in3DaysNext,
      in7Days,
      in7DaysNext,
      ago5Days,
      ago5DaysNext,
      dueWarnDay,
      dueInFiveDays,
      isFirstOfMonth,
      monthStart,
      monthEnd,
      monthDueDate,
    } = cronBillingDates();

    // ============================================================
    // DAILY: Send SMS 3 days before free plan expiry
    // ============================================================
    const { data: expiringIn3DaysHosts } = await supabase
      .from("hosts")
      .select("id, name, phone")
      .eq("plan_type", "free")
      .not("plan_free_expires_at", "is", null)
      .gte("plan_free_expires_at", in3Days + "T00:00:00Z")
      .lt("plan_free_expires_at", in3DaysNext + "T00:00:00Z");

    let preExpiryNotifications = 0;
    await runWithConcurrency(
      (expiringIn3DaysHosts || []) as { id: string; name: string; phone: string | null }[],
      10,
      async (host) => {
        if (!host.phone) return;
        try {
          const result = await sendSms(
            host.phone,
            `แพลนฟรีของคุณจะหมดอายุใน 3 วัน กรุณาเข้าระบบเพื่อเปลี่ยนแพลน`,
          );
          if (result.success) preExpiryNotifications++;
        } catch (err) {
          console.error("[Cron] Pre-expiry SMS error for host:", host.id, err);
        }
      },
    );
    results.pre_expiry_notifications = preExpiryNotifications;

    // ============================================================
    // DAILY: Check free plan expiry (already expired) — send SMS
    // ============================================================
    const { data: expiredFreeHosts } = await supabase
      .from("hosts")
      .select("id, name, phone")
      .eq("plan_type", "free")
      .not("plan_free_expires_at", "is", null)
      .lt("plan_free_expires_at", tomorrowStr + "T00:00:00Z")
      .gte("plan_free_expires_at", today + "T00:00:00Z");

    let expiryNotifications = 0;
    await runWithConcurrency(
      (expiredFreeHosts || []) as { id: string; name: string; phone: string | null }[],
      10,
      async (host) => {
        if (host.phone) {
          try {
            const result = await sendSms(
              host.phone,
              `แพลนฟรีหมดอายุแล้ว กรุณาเข้าระบบเพื่อเปลี่ยนแพลน`,
            );
            if (result.success) expiryNotifications++;
          } catch (err) {
            console.error("[Cron] Expiry SMS error for host:", host.id, err);
          }
        }

        await logEvent({
          entityType: "host",
          entityId: host.id,
          eventType: EventType.PLAN_EXPIRED,
          actorType: "system",
          actorId: null,
          data: { plan_type: "free", host_name: host.name },
        });
      },
    );
    results.expiry_notifications = expiryNotifications;

    // ============================================================
    // DAILY: Grace period reminder — 5 days after expiry (2 days before block)
    // ============================================================
    const graceDaysLeft = GRACE_PERIOD_DAYS - 5; // = 2
    const { data: graceReminderHosts } = await supabase
      .from("hosts")
      .select("id, name, phone")
      .eq("plan_type", "free")
      .not("plan_free_expires_at", "is", null)
      .gte("plan_free_expires_at", ago5Days + "T00:00:00Z")
      .lt("plan_free_expires_at", ago5DaysNext + "T00:00:00Z");

    let graceNotifications = 0;
    await runWithConcurrency(
      (graceReminderHosts || []) as { id: string; name: string; phone: string | null }[],
      10,
      async (host) => {
        if (!host.phone) return;
        try {
          const result = await sendSms(
            host.phone,
            `แพลนฟรีของคุณหมดอายุแล้ว การจองจะถูกระงับใน ${graceDaysLeft} วัน กรุณาเข้าระบบเพื่อเปลี่ยนแพลน`,
          );
          if (result.success) graceNotifications++;
        } catch (err) {
          console.error("[Cron] Grace reminder SMS error for host:", host.id, err);
        }
      },
    );
    results.grace_notifications = graceNotifications;

    // ============================================================
    // DAILY: 7 days before fixed_rate term ends — pre-expiry alert (LINE/SMS/email)
    // ============================================================
    const { data: termExpiringIn7Days } = await supabase
      .from("hosts")
      .select("id, name, phone, email, notification_preference, line_channel_access_token, line_user_id, fixed_rate_term_ends_at")
      .eq("plan_type", "fixed_rate")
      .is("plan_pending_type", null)
      .gte("fixed_rate_term_ends_at", in7Days)
      .lt("fixed_rate_term_ends_at", in7DaysNext);

    let termExpiryPreNotifications = 0;
    await runWithConcurrency(
      (termExpiringIn7Days || []) as HostAlertRow[],
      10,
      async (host) => {
        if (!host.fixed_rate_term_ends_at) return;
        try {
          const endDate = fmtDateStr(host.fixed_rate_term_ends_at, "d MMM", "th");
          const result = await notifyHostAlert(
            host,
            `แพลน Fixed Rate จะหมดอายุใน 7 วัน (${endDate}) เข้าระบบต่ออายุรับส่วนลด`,
            "แพลน Fixed Rate ใกล้หมดอายุ",
          );
          if (result.success) termExpiryPreNotifications++;
        } catch (err) {
          console.error("[Cron] Term pre-expiry alert error for host:", host.id, err);
        }
      },
    );
    results.term_expiry_pre_notifications = termExpiryPreNotifications;

    // ============================================================
    // DAILY: On fixed_rate term expiry day — alert to host (LINE/SMS/email)
    // ============================================================
    const { data: termExpiringToday } = await supabase
      .from("hosts")
      .select("id, name, phone, email, notification_preference, line_channel_access_token, line_user_id, fixed_rate_term_ends_at")
      .eq("plan_type", "fixed_rate")
      .is("plan_pending_type", null)
      .gte("fixed_rate_term_ends_at", today)
      .lt("fixed_rate_term_ends_at", tomorrowStr);

    let termExpiryNotifications = 0;
    await runWithConcurrency(
      (termExpiringToday || []) as HostAlertRow[],
      10,
      async (host) => {
        try {
          const result = await notifyHostAlert(
            host,
            `แพลน Fixed Rate หมดอายุแล้ว ระบบจะออกใบแจ้งหนี้รายเดือนอัตโนมัติ`,
            "แพลน Fixed Rate หมดอายุแล้ว",
          );
          if (result.success) termExpiryNotifications++;
        } catch (err) {
          console.error("[Cron] Term expiry alert error for host:", host.id, err);
        }
      },
    );
    results.term_expiry_notifications = termExpiryNotifications;

    // ============================================================
    // DAILY: Fixed-rate invoice reminder — 2 days BEFORE the due date.
    // Fixed-rate has no grace: the day after due_date the invoice flips to
    // overdue and new bookings stop, so the warning has to land beforehand.
    // ============================================================
    const { data: dueSoonInvoices } = await supabase
      .from("invoices")
      .select("id, host_id")
      .eq("status", "pending")
      .eq("due_date", dueWarnDay);

    let frDueSoonNotifications = 0;
    const dueSoonHostIds = [...new Set(((dueSoonInvoices || []) as { id: string; host_id: string }[]).map((i) => i.host_id))];
    if (dueSoonHostIds.length > 0) {
      const { data: dueSoonHosts } = await supabase
        .from("hosts")
        .select("id, name, phone, email, notification_preference, line_channel_access_token, line_user_id")
        .eq("plan_type", "fixed_rate")
        .in("id", dueSoonHostIds);

      await runWithConcurrency(
        (dueSoonHosts || []) as HostAlertRow[],
        10,
        async (host) => {
          try {
            const result = await notifyHostAlert(
              host,
              `ใบแจ้งหนี้ครบกำหนดชำระใน 2 วัน (${fmtDateStr(dueWarnDay, "d MMM", "th")}) หากเลยกำหนด การจองใหม่จะถูกระงับ`,
              "ใบแจ้งหนี้ใกล้ครบกำหนด",
            );
            if (result.success) frDueSoonNotifications++;
          } catch (err) {
            console.error("[Cron] Fixed-rate due reminder error for host:", host.id, err);
          }
        },
      );
    }
    results.fr_due_soon_notifications = frDueSoonNotifications;

    // ============================================================
    // DAILY: Mark overdue invoices
    // Fixed-rate gets no grace window — an invoice blocks the host the day
    // after its due date. Monthly invoices are due on the 5th, so an unpaid
    // host stops taking new bookings on the 6th. Flipping the status here
    // keeps /admin/billing and the host's invoice list in sync with the block.
    // ============================================================
    const { data: overdueInvoices } = await supabase
      .from("invoices")
      .select("id, host_id")
      .eq("status", "pending")
      .lt("due_date", today);

    let overdueCount = 0;
    const newlyOverdueHostIds = new Set<string>();
    for (const inv of (overdueInvoices || []) as { id: string; host_id: string }[]) {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "overdue", updated_by: "system" } as never)
        .eq("id", inv.id);

      if (!error) {
        overdueCount++;
        newlyOverdueHostIds.add(inv.host_id);
        await logEvent({
          entityType: "billing",
          entityId: inv.id,
          eventType: EventType.INVOICE_OVERDUE,
          actorType: "system",
          actorId: null,
          data: { host_id: inv.host_id },
        });
      }
    }
    results.invoices_overdue = overdueCount;

    // Tell the hosts their bookings just stopped. The pending → overdue flip
    // happens exactly once per invoice, so this can't send twice.
    let frBlockedNotifications = 0;
    if (newlyOverdueHostIds.size > 0) {
      const { data: blockedHosts } = await supabase
        .from("hosts")
        .select("id, name, phone, email, notification_preference, line_channel_access_token, line_user_id")
        .in("id", [...newlyOverdueHostIds]);

      await runWithConcurrency(
        (blockedHosts || []) as HostAlertRow[],
        10,
        async (host) => {
          try {
            const result = await notifyHostAlert(
              host,
              `ใบแจ้งหนี้เลยกำหนดชำระ การจองใหม่ถูกระงับแล้ว กรุณาชำระเงินเพื่อเปิดรับการจองอีกครั้ง`,
              "การจองถูกระงับ",
            );
            if (result.success) frBlockedNotifications++;
          } catch (err) {
            console.error("[Cron] Fixed-rate blocked alert error for host:", host.id, err);
          }
        },
      );
    }
    results.fr_blocked_notifications = frBlockedNotifications;

    // ============================================================
    // DAILY: Low wallet balance warning for commission hosts
    // Fires once per dip below LOW_WALLET_THRESHOLD, well before the balance
    // goes negative. Hosts already negative are skipped — notifyNegativeBalance
    // (fired at deduction time) owns those, and two overlapping warnings about
    // the same wallet would just be noise.
    // ============================================================
    const { data: lowWalletHosts } = await supabase
      .from("hosts")
      .select("id, name, phone, email, notification_preference, line_channel_access_token, line_user_id, wallet_balance")
      .eq("plan_type", "commission")
      .eq("status", "approved")
      .gte("wallet_balance", 0)
      .lt("wallet_balance", LOW_WALLET_THRESHOLD)
      .is("wallet_low_notified_at", null);

    let lowWalletNotifications = 0;
    await runWithConcurrency(
      (lowWalletHosts || []) as (HostAlertRow & { wallet_balance: number })[],
      10,
      async (host) => {
        try {
          const result = await notifyHostAlert(
            host,
            `ยอดเงินในกระเป๋าเหลือ ฿${host.wallet_balance.toLocaleString()} กรุณาเติมเงินเพื่อไม่ให้การจองสะดุด`,
            "ยอดเงินเหลือน้อย",
          );
          // Only stamp on a successful send, so a failed delivery retries tomorrow.
          if (!result.success) return;
          lowWalletNotifications++;

          await supabase
            .from("hosts")
            .update({ wallet_low_notified_at: new Date().toISOString(), updated_by: "system" } as never)
            .eq("id", host.id);

          await logEvent({
            entityType: "host",
            entityId: host.id,
            eventType: EventType.WALLET_LOW_BALANCE,
            actorType: "system",
            actorId: null,
            data: { wallet_balance: host.wallet_balance, threshold: LOW_WALLET_THRESHOLD },
          });
        } catch (err) {
          console.error("[Cron] Low wallet warning error for host:", host.id, err);
        }
      },
    );
    results.low_wallet_notifications = lowWalletNotifications;

    // Re-arm hosts who topped back up, so the next dip warns again.
    const { data: rearmedHosts } = await supabase
      .from("hosts")
      .update({ wallet_low_notified_at: null } as never)
      .eq("plan_type", "commission")
      .gte("wallet_balance", LOW_WALLET_THRESHOLD)
      .not("wallet_low_notified_at", "is", null)
      .select("id");
    results.low_wallet_rearmed = (rearmedHosts as unknown[] | null)?.length ?? 0;

    // ============================================================
    // DAILY: Apply pending plan switches whose effective date has arrived
    // (free hosts past expiry schedule same-day switches to avoid a gap)
    // ============================================================
    const { data: pendingSwitches } = await supabase
      .from("hosts")
      .select("id, plan_type, plan_pending_type, plan_pending_effective_at, plan_pending_term_months, fixed_rate_override, fixed_rate_term_months, name")
      .not("plan_pending_type", "is", null)
      .lte("plan_pending_effective_at", today);

    let switchCount = 0;
    let switchInvoiceCount = 0;
    for (const host of (pendingSwitches || []) as {
      id: string;
      plan_type: string;
      plan_pending_type: string;
      plan_pending_term_months: number | null;
      fixed_rate_override: number | null;
      fixed_rate_term_months: number | null;
      name: string;
    }[]) {
      const switchingToFixedRate = host.plan_pending_type === "fixed_rate";

      let termInvoice: ReturnType<typeof computeFixedRateInvoice> | null = null;
      let appliedTerm: number = 1;
      if (switchingToFixedRate) {
        const pendingTerm = host.plan_pending_term_months ?? 1;
        appliedTerm = isValidTermMonths(pendingTerm, config as PlatformBillingConfig)
          ? pendingTerm
          : 1;
        termInvoice = computeFixedRateInvoice(
          host as unknown as Pick<Host, "fixed_rate_override">,
          config as PlatformBillingConfig,
          appliedTerm,
          todayDate,
        );
      }

      const updateFields: Record<string, unknown> = {
        plan_type: host.plan_pending_type,
        plan_pending_type: null,
        plan_pending_effective_at: null,
        plan_pending_term_months: null,
        plan_free_expires_at: null,
        updated_by: "system",
      };
      if (switchingToFixedRate && termInvoice) {
        updateFields.fixed_rate_term_months = appliedTerm;
        updateFields.fixed_rate_term_started_at = termInvoice.period_start;
        updateFields.fixed_rate_term_ends_at = termInvoice.period_end;
      } else if (host.plan_pending_type === "commission") {
        // LEGACY DRAIN: since plan/switch applies commission changes immediately,
        // nothing writes plan_pending_type = 'commission' any more. This branch
        // exists for rows written before that change and must not be deleted as
        // unreachable until they have all aged out.
        // Leaving fixed_rate behind — clear stale term fields.
        updateFields.fixed_rate_term_months = null;
        updateFields.fixed_rate_term_started_at = null;
        updateFields.fixed_rate_term_ends_at = null;
      }

      const { error } = await supabase
        .from("hosts")
        .update(updateFields as never)
        .eq("id", host.id);

      if (error) continue;

      switchCount++;
      const isRenewal = host.plan_type === "fixed_rate" && switchingToFixedRate;
      await logEvent({
        entityType: "host",
        entityId: host.id,
        eventType: EventType.PLAN_CHANGED,
        actorType: "system",
        actorId: null,
        data: {
          from: host.plan_type,
          to: host.plan_pending_type,
          ...(switchingToFixedRate ? { term_months: appliedTerm } : {}),
          ...(isRenewal
            ? {
                renewal: true,
                from_term_months: host.fixed_rate_term_months,
                to_term_months: appliedTerm,
              }
            : {}),
        },
      });

      if (termInvoice && termInvoice.amount > 0) {
        const { error: invErr } = await supabase
          .from("invoices")
          .insert({
            host_id: host.id,
            amount: termInvoice.amount,
            period_start: termInvoice.period_start,
            period_end: termInvoice.period_end,
            term_months: termInvoice.term_months,
            discount_pct: termInvoice.discount_pct,
            due_date: dueInFiveDays,
            status: "pending",
            created_by: "system",
            updated_by: "system",
          } as never);
        if (!invErr) {
          switchInvoiceCount++;
          await logEvent({
            entityType: "billing",
            entityId: host.id,
            eventType: EventType.INVOICE_CREATED,
            actorType: "system",
            actorId: null,
            data: {
              amount: termInvoice.amount,
              period_start: termInvoice.period_start,
              period_end: termInvoice.period_end,
              term_months: termInvoice.term_months,
              discount_pct: termInvoice.discount_pct,
            },
          });
        }
      }
    }
    results.plan_switches = switchCount;
    results.plan_switch_invoices = switchInvoiceCount;

    if (isFirstOfMonth) {
      // ============================================================
      // MONTHLY (1st only): Generate 1-month revert invoice for fixed_rate
      // hosts whose multi-month term has ended (or who never had one).
      // Hosts mid-term skip — they already paid upfront.
      // ============================================================
      const { data: fixedRateHosts } = await supabase
        .from("hosts")
        .select("id, fixed_rate_override, fixed_rate_term_ends_at, name, phone, notification_preference, line_channel_access_token, line_user_id")
        .eq("plan_type", "fixed_rate")
        .eq("status", "approved");

      // The calendar month this run falls in, on the Bangkok billing calendar
      // — see ./dates for why that is not the same as now.getUTC*().
      const periodStart = monthStart;
      const periodEnd = monthEnd;
      const dueDate = monthDueDate;

      let invoiceCount = 0;
      let invoiceNotifications = 0;
      await runWithConcurrency(
        (fixedRateHosts || []) as { id: string; fixed_rate_override: number | null; fixed_rate_term_ends_at: string | null; name: string; phone: string | null; notification_preference: string | null; line_channel_access_token: string | null; line_user_id: string | null }[],
        5,
        async (host) => {
          // Mid-term hosts already paid upfront — skip.
          if (host.fixed_rate_term_ends_at && host.fixed_rate_term_ends_at >= today) return;

          const { data: existing } = await supabase
            .from("invoices")
            .select("id, status")
            .eq("host_id", host.id)
            .in("status", ["pending", "overdue"])
            .limit(1);

          if ((existing as unknown[] | null)?.length) return;

          // Reaching here means the prior term has ended (mid-term hosts returned
          // above). Roll the host onto this month's 1-month period regardless of
          // the billable amount, so the daily term-expiry warnings and the
          // mid-term skip see correct dates even for comped (฿0) hosts.
          await supabase
            .from("hosts")
            .update({
              fixed_rate_term_months: 1,
              fixed_rate_term_started_at: periodStart,
              fixed_rate_term_ends_at: periodEnd,
              updated_by: "system",
            } as never)
            .eq("id", host.id);

          const amount = getEffectiveFixedRate(
            host as unknown as Pick<Host, "fixed_rate_override">,
            config as PlatformBillingConfig,
          );

          if (amount <= 0) return;

          const { error } = await supabase
            .from("invoices")
            .insert({
              host_id: host.id,
              amount,
              period_start: periodStart,
              period_end: periodEnd,
              term_months: 1,
              discount_pct: 0,
              due_date: dueDate,
              status: "pending",
              created_by: "system",
              updated_by: "system",
            } as never);

          if (error) return;

          invoiceCount++;
          await logEvent({
            entityType: "billing",
            entityId: host.id,
            eventType: EventType.INVOICE_CREATED,
            actorType: "system",
            actorId: null,
            data: { amount, period_start: periodStart, period_end: periodEnd, term_months: 1, discount_pct: 0 },
          });

          const monthLabel = fmtDateStr(periodStart, "MMMM yyyy", "th"); // e.g. "พฤษภาคม 2569"
          const message = `ใบแจ้งหนี้ประจำเดือน${monthLabel} ฿${amount.toLocaleString()} ครบกำหนดชำระภายในวันที่ 5 กรุณาเข้าระบบเพื่อชำระเงิน`;
          try {
            const preference = host.notification_preference || "sms";
            let sent = false;

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
                signal: AbortSignal.timeout(5000),
              });
              sent = response.ok;
            }

            if (!sent && host.phone) {
              const result = await sendSms(host.phone, message);
              sent = result.success;
            }

            if (sent) invoiceNotifications++;
          } catch (err) {
            console.error("[Cron] Invoice reminder error for host:", host.id, err);
          }
        },
      );
      results.invoices_created = invoiceCount;
      results.invoice_notifications = invoiceNotifications;
    }

    // Demand-event retention. Rides this cron rather than adding a second
    // vercel.json entry. The RPC caps its own delete, so a shortened retention
    // window can never turn one nightly run into a table-wide delete — it just
    // takes a few more nights to drain.
    try {
      const { data: pruned, error: pruneErr } = await supabase.rpc(
        "prune_demand_events" as never,
        { p_days: 180, p_limit: 10000 } as never,
      );
      if (pruneErr) throw new Error(pruneErr.message);
      results.demand_events_pruned = pruned ?? 0;
    } catch (err) {
      console.error("[Cron] Demand prune error:", err);
      results.demand_events_pruned = { error: err instanceof Error ? err.message : String(err) };
    }

    await logEvent({
      entityType: "system",
      entityId: "cron_billing",
      eventType: "cron_billing_success",
      actorType: "system",
      actorId: null,
      data: { is_first_of_month: isFirstOfMonth, result_keys: Object.keys(results) },
    });

    return NextResponse.json({ success: true, is_first_of_month: isFirstOfMonth, results });
  } catch (error) {
    console.error("[Cron Billing] error:", error);
    await logEvent({
      entityType: "system",
      entityId: "cron_billing",
      eventType: "cron_billing_failure",
      actorType: "system",
      actorId: null,
      data: {
        error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
      },
    });
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
