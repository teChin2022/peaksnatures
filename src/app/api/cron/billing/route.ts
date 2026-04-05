import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logEvent, EventType } from "@/lib/history-log";
import { getBillingConfig, getEffectiveFixedRate } from "@/lib/billing";
import type { Host, PlatformBillingConfig } from "@/types/database";

/**
 * POST /api/cron/billing
 * Daily cron job.
 * - Every day: send SMS 1 day before free plan expiry, send SMS on expiry day, mark overdue invoices.
 * - 1st of month only: apply pending plan switches, generate invoices for fixed-rate hosts.
 * Secured with CRON_SECRET header.
 */
export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const results: Record<string, unknown> = {};

  try {
    const config = await getBillingConfig();
    if (!config) {
      return NextResponse.json({ error: "Billing config not found" }, { status: 500 });
    }

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      .toISOString().split("T")[0];
    const isFirstOfMonth = now.getDate() === 1;

    // ============================================================
    // DAILY: Send SMS 1 day before free plan expiry
    // ============================================================
    const { data: expiringTomorrowHosts } = await supabase
      .from("hosts")
      .select("id, name, phone")
      .eq("plan_type", "free")
      .not("plan_free_expires_at", "is", null)
      .gte("plan_free_expires_at", tomorrow + "T00:00:00Z")
      .lt("plan_free_expires_at", tomorrow + "T23:59:59Z");

    let preExpiryNotifications = 0;
    for (const host of (expiringTomorrowHosts || []) as { id: string; name: string; phone: string | null }[]) {
      if (host.phone) {
        try {
          const { sendSms } = await import("@/lib/notifications");
          await sendSms(
            host.phone,
            `แพลนฟรีของคุณจะหมดอายุพรุ่งนี้ กรุณาเข้าระบบเพื่อเปลี่ยนแพลน`,
          );
          preExpiryNotifications++;
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
      .lte("plan_free_expires_at", now.toISOString())
      .gte("plan_free_expires_at", today + "T00:00:00Z");

    let expiryNotifications = 0;
    for (const host of (expiredFreeHosts || []) as { id: string; name: string; phone: string | null }[]) {
      if (host.phone) {
        try {
          const { sendSms } = await import("@/lib/notifications");
          await sendSms(
            host.phone,
            `แพลนฟรีหมดอายุแล้ว กรุณาเข้าระบบเพื่อเปลี่ยนแพลน`,
          );
          expiryNotifications++;
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
        .select("id, fixed_rate_override, name")
        .eq("plan_type", "fixed_rate")
        .eq("status", "approved");

      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      const dueDate = new Date(now.getFullYear(), now.getMonth(), 15).toISOString().split("T")[0];

      let invoiceCount = 0;
      for (const host of (fixedRateHosts || []) as { id: string; fixed_rate_override: number | null; name: string }[]) {
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
        }
      }
      results.invoices_created = invoiceCount;
    }

    return NextResponse.json({ success: true, is_first_of_month: isFirstOfMonth, results });
  } catch (error) {
    console.error("[Cron Billing] error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
