import { Users, Home, CalendarDays, DollarSign, AlertTriangle, CheckCircle2, UserCheck, Receipt, Banknote, RotateCcw, Clock } from "lucide-react";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { KpiCard } from "@/components/admin/kpi-card";
import { AdminDemandSection } from "@/components/admin/admin-demand-section";
import { blockingInvoiceFilter } from "@/lib/billing-dates";
import { EventType } from "@/lib/history-log";
import { getCronHealth } from "@/lib/cron-health";
import { ATTENTION_WINDOW_DAYS, attentionItems, type AttentionItem } from "./attention";

const ATTENTION_ICONS: Record<AttentionItem["key"], typeof Clock> = {
  payments: Banknote,
  invoices: Receipt,
  retries: RotateCcw,
  cron: Clock,
};

async function getAdminStats() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) redirect("/");

  const sc = createServiceRoleClient();
  const since = new Date(Date.now() - ATTENTION_WINDOW_DAYS * 86_400_000).toISOString();
  const recentEvents = (eventType: string) =>
    sc.from("history_logs").select("id", { count: "exact", head: true }).eq("event_type", eventType).gte("created_at", since);
  const [hostsRes, pendingHostsRes, homestaysRes, totalBookingsRes, pendingBookingsRes, confirmedBookingsRes, revenueRes, homestayListRes, blockingInvoicesRes, rejectedPaymentsRes, retriesExhaustedRes, cron] = await Promise.all([
    sc.from("hosts").select("id", { count: "exact", head: true }),
    sc.from("hosts").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sc.from("homestays").select("id", { count: "exact", head: true }),
    sc.from("bookings").select("id", { count: "exact", head: true }),
    sc.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sc.from("bookings").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
    // Summed in SQL: fetching rows here was capped by PostgREST's row limit.
    sc.rpc("get_admin_revenue_total"),
    // Options for the demand panel's homestay filter.
    sc.from("homestays").select("id, name").order("name"),
    // Needs attention
    sc.from("invoices").select("id", { count: "exact", head: true }).or(blockingInvoiceFilter()),
    recentEvents(EventType.PLATFORM_PAYMENT_REJECTED),
    recentEvents(EventType.BILLING_RETRY_EXHAUSTED),
    getCronHealth(),
  ]);

  return {
    totalHosts: hostsRes.count || 0,
    pendingHosts: pendingHostsRes.count || 0,
    totalHomestays: homestaysRes.count || 0,
    totalBookings: totalBookingsRes.count || 0,
    pendingBookings: pendingBookingsRes.count || 0,
    confirmedBookings: confirmedBookingsRes.count || 0,
    bookingValue: Number(revenueRes.data ?? 0),
    homestayList: (homestayListRes.data as { id: string; name: string }[]) || [],
    blockingInvoices: blockingInvoicesRes.count || 0,
    rejectedPayments: rejectedPaymentsRes.count || 0,
    retriesExhausted: retriesExhaustedRes.count || 0,
    cron,
  };
}

export default async function AdminDashboardPage() {
  const stats = await getAdminStats();

  const cards = [
    // Guests' confirmed booking value before promo discounts (get_admin_revenue_total), not platform income.
    { label: "Gross booking value", value: `฿${stats.bookingValue.toLocaleString()}`, icon: DollarSign, tone: "brand" as const },
    { label: "Confirmed Bookings", value: stats.confirmedBookings, icon: CheckCircle2, tone: "brand" as const },
    { label: "Pending Bookings", value: stats.pendingBookings, icon: AlertTriangle, tone: "amber" as const, href: "/admin/bookings" },
    { label: "Pending Hosts", value: stats.pendingHosts, icon: UserCheck, tone: "amber" as const, href: "/admin/hosts?status=pending" },
    { label: "Total Hosts", value: stats.totalHosts, icon: Users, tone: "earth" as const, href: "/admin/hosts" },
    { label: "Total Homestays", value: stats.totalHomestays, icon: Home, tone: "earth" as const, href: "/admin/homestays" },
    { label: "Total Bookings", value: stats.totalBookings, icon: CalendarDays, tone: "neutral" as const, href: "/admin/bookings" },
  ];

  const attention = attentionItems(stats);

  return (
    <div>
      <PageHeader eyebrow="Dashboard" title="Platform Overview" />
      <section aria-labelledby="attention-heading" className="mb-6">
        <h2 id="attention-heading" className="mb-3 text-sm font-semibold text-earth-900">
          Needs attention
        </h2>
        {attention.length === 0 ? (
          <p className="text-sm text-earth-600">
            All clear: the billing cron ran on time, and there are no overdue invoices or rejected payments.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {attention.map((item) => (
              <KpiCard key={item.key} label={item.label} value={item.value} icon={ATTENTION_ICONS[item.key]} tone="amber" href={item.href} />
            ))}
          </div>
        )}
      </section>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <KpiCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            tone={card.tone}
            href={card.href}
          />
        ))}
      </div>

      {/* Guest demand, platform-wide. Same panel the hosts see on their own
          dashboard, just unscoped and filterable. */}
      <div className="mt-6">
        <AdminDemandSection homestays={stats.homestayList} />
      </div>
    </div>
  );
}
