import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logEvent, EventType } from "@/lib/history-log";
import { getBillingConfig, getEffectiveFixedRate } from "@/lib/billing";
import type { Host, PlatformBillingConfig } from "@/types/database";

/**
 * POST /api/cron/billing
 * Monthly cron job: apply pending plan switches, generate invoices, mark overdue, check free plan expiry.
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

    const today = new Date().toISOString().split("T")[0];

    // 1. Apply pending plan switches
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

    // 2. Generate invoices for fixed_rate hosts
    const { data: fixedRateHosts } = await supabase
      .from("hosts")
      .select("id, fixed_rate_override, name")
      .eq("plan_type", "fixed_rate")
      .eq("status", "approved");

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
    const dueDate = new Date(now.getFullYear(), now.getMonth(), 15).toISOString().split("T")[0]; // Due 15th

    let invoiceCount = 0;
    for (const host of (fixedRateHosts || []) as { id: string; fixed_rate_override: number | null; name: string }[]) {
      // Check if invoice already exists for this period
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

    // 3. Mark overdue invoices
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

    // 4. Check free plan expiry - send SMS notifications
    const { data: expiredFreeHosts } = await supabase
      .from("hosts")
      .select("id, name, phone, notification_preference")
      .eq("plan_type", "free")
      .not("plan_free_expires_at", "is", null)
      .lte("plan_free_expires_at", new Date().toISOString());

    let expiryNotifications = 0;
    for (const host of (expiredFreeHosts || []) as { id: string; name: string; phone: string | null; notification_preference: string }[]) {
      if (host.phone) {
        try {
          const { sendSms } = await import("@/lib/notifications");
          await sendSms(
            host.phone,
            `[Peaksnature] แพลนฟรีหมดอายุ กรุณาเข้าระบบเพื่อเปลี่ยนแพลน / Your free plan has expired. Please switch to a paid plan.`,
          );
          expiryNotifications++;
        } catch (err) {
          console.error("[Cron] SMS notification error for host:", host.id, err);
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

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("[Cron Billing] error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
