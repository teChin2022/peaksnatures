import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logEvent, EventType } from "@/lib/history-log";
import { getBillingConfig, getEffectiveFixedRate, processBillingRetryQueue } from "@/lib/billing";
import { GRACE_PERIOD_DAYS } from "@/lib/plan-expiry";
import type { Host, PlatformBillingConfig } from "@/types/database";

/**
 * GET /api/cron/billing
 * Daily cron job (triggered by Vercel Cron via GET).
 * - Every day: send SMS 3 days before free plan expiry, send SMS on expiry day,
 *   send SMS 5 days after expiry (grace period reminder), mark overdue invoices.
 * - 1st of month only: apply pending plan switches, generate invoices for fixed-rate hosts.
 * Secured with CRON_SECRET header.
 * Generate the secret: `openssl rand -base64 32`
 * Set CRON_SECRET in Vercel Environment Variables (both Production & Preview).
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[Cron] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const today = todayUTC.toISOString().split("T")[0];
    const in3Days = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 3))
      .toISOString().split("T")[0];
    const in3DaysNext = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 4))
      .toISOString().split("T")[0];
    const tomorrowStr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
      .toISOString().split("T")[0];
    // 5 days ago = hosts whose plan expired 5 days ago (grace period reminder)
    const ago5Days = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 5))
      .toISOString().split("T")[0];
    const ago5DaysNext = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 4))
      .toISOString().split("T")[0];
    const isFirstOfMonth = now.getUTCDate() === 1;

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
    for (const host of (expiringIn3DaysHosts || []) as { id: string; name: string; phone: string | null }[]) {
      if (host.phone) {
        try {
          const { sendSms } = await import("@/lib/notifications");
          const result = await sendSms(
            host.phone,
            `แพลนฟรีของคุณจะหมดอายุใน 3 วัน กรุณาเข้าระบบเพื่อเปลี่ยนแพลน`,
          );
          if (result.success) preExpiryNotifications++;
        } catch (err) {
          console.error("[Cron] Pre-expiry SMS error for host:", host.id, err);
        }
      }
    }
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
    for (const host of (expiredFreeHosts || []) as { id: string; name: string; phone: string | null }[]) {
      if (host.phone) {
        try {
          const { sendSms } = await import("@/lib/notifications");
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
    }
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
    for (const host of (graceReminderHosts || []) as { id: string; name: string; phone: string | null }[]) {
      if (host.phone) {
        try {
          const { sendSms } = await import("@/lib/notifications");
          const result = await sendSms(
            host.phone,
            `แพลนฟรีของคุณหมดอายุแล้ว การจองจะถูกระงับใน ${graceDaysLeft} วัน กรุณาเข้าระบบเพื่อเปลี่ยนแพลน`,
          );
          if (result.success) graceNotifications++;
        } catch (err) {
          console.error("[Cron] Grace reminder SMS error for host:", host.id, err);
        }
      }
    }
    results.grace_notifications = graceNotifications;

    // ============================================================
    // DAILY: Mark overdue invoices
    // ============================================================
    const { data: overdueInvoices } = await supabase
      .from("invoices")
      .select("id, host_id")
      .eq("status", "pending")
      .lt("due_date", today);

    let overdueCount = 0;
    for (const inv of (overdueInvoices || []) as { id: string; host_id: string }[]) {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "overdue", updated_by: "system" } as never)
        .eq("id", inv.id);

      if (!error) {
        overdueCount++;
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

    // ============================================================
    // MONTHLY (1st only): Apply pending plan switches
    // ============================================================
    if (isFirstOfMonth) {
      const { data: pendingSwitches } = await supabase
        .from("hosts")
        .select("id, plan_type, plan_pending_type, plan_pending_effective_at, name")
        .not("plan_pending_type", "is", null)
        .lte("plan_pending_effective_at", today);

      let switchCount = 0;
      for (const host of (pendingSwitches || []) as { id: string; plan_type: string; plan_pending_type: string; name: string }[]) {
        const { error } = await supabase
          .from("hosts")
          .update({
            plan_type: host.plan_pending_type,
            plan_pending_type: null,
            plan_pending_effective_at: null,
            plan_free_expires_at: null,
            updated_by: "system",
          } as never)
          .eq("id", host.id);

        if (!error) {
          switchCount++;
          await logEvent({
            entityType: "host",
            entityId: host.id,
            eventType: EventType.PLAN_CHANGED,
            actorType: "system",
            actorId: null,
            data: { from: host.plan_type, to: host.plan_pending_type },
          });
        }
      }
      results.plan_switches = switchCount;

      // ============================================================
      // MONTHLY (1st only): Generate invoices for fixed_rate hosts
      // ============================================================
      const { data: fixedRateHosts } = await supabase
        .from("hosts")
        .select("id, fixed_rate_override, name, phone, notification_preference, line_channel_access_token, line_user_id")
        .eq("plan_type", "fixed_rate")
        .eq("status", "approved");

      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      const dueDate = new Date(now.getFullYear(), now.getMonth(), 5).toISOString().split("T")[0];

      let invoiceCount = 0;
      let invoiceNotifications = 0;
      for (const host of (fixedRateHosts || []) as { id: string; fixed_rate_override: number | null; name: string; phone: string | null; notification_preference: string | null; line_channel_access_token: string | null; line_user_id: string | null }[]) {
        const { data: existing } = await supabase
          .from("invoices")
          .select("id")
          .eq("host_id", host.id)
          .eq("period_start", periodStart)
          .limit(1);

        if ((existing as unknown[] | null)?.length) continue;

        const amount = getEffectiveFixedRate(
          host as unknown as Pick<Host, "fixed_rate_override">,
          config as PlatformBillingConfig,
        );

        if (amount <= 0) continue;

        const { error } = await supabase
          .from("invoices")
          .insert({
            host_id: host.id,
            amount,
            period_start: periodStart,
            period_end: periodEnd,
            due_date: dueDate,
            status: "pending",
            created_by: "system",
            updated_by: "system",
          } as never);

        if (!error) {
          invoiceCount++;
          await logEvent({
            entityType: "billing",
            entityId: host.id,
            eventType: EventType.INVOICE_CREATED,
            actorType: "system",
            actorId: null,
            data: { amount, period_start: periodStart, period_end: periodEnd },
          });

          // Send payment reminder SMS/LINE
          const message = `ใบแจ้งหนี้ประจำเดือน ฿${amount.toLocaleString()} ครบกำหนดชำระภายในวันที่ 5 กรุณาเข้าระบบเพื่อชำระเงิน`;
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
              });
              sent = response.ok;
            }

            if (!sent && host.phone) {
              const { sendSms } = await import("@/lib/notifications");
              const result = await sendSms(host.phone, message);
              sent = result.success;
            }

            if (sent) invoiceNotifications++;
          } catch (err) {
            console.error("[Cron] Invoice reminder error for host:", host.id, err);
          }
        }
      }
      results.invoices_created = invoiceCount;
      results.invoice_notifications = invoiceNotifications;
    }

    return NextResponse.json({ success: true, is_first_of_month: isFirstOfMonth, results });
  } catch (error) {
    console.error("[Cron Billing] error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
