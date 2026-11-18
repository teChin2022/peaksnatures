import Link from "next/link";
import { Receipt, Banknote, RotateCcw, Clock, Ban, CalendarClock, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { AdminDemandSection } from "@/components/admin/admin-demand-section";
import { blockingInvoiceFilter } from "@/lib/billing-dates";
import { EventType } from "@/lib/history-log";
import { getCronHealth } from "@/lib/cron-health";
import { HOST_BLOCK_COLUMNS, type HostBlockRow } from "@/lib/billing";
import { blockedHostIds } from "@/lib/host-blocked";
import { countStaleDateChanges } from "./bookings/date-changes/data";
import { countUnsettledRejected } from "./billing/rejected/data";
import { ATTENTION_WINDOW_DAYS, attentionItems, type AttentionItem } from "./attention";

const ATTENTION_ICONS: Record<AttentionItem["key"], typeof Clock> = {
  payments: Banknote,
  invoices: Receipt,
  retries: RotateCcw,
  blocked: Ban,
  dateChanges: CalendarClock,
  cron: Clock,
};

/** The verb on each queue row: what the admin goes there to do. */
const ATTENTION_ACTIONS: Record<AttentionItem["key"], string> = {
  payments: "Settle",
  invoices: "Review invoices",
  retries: "See failures",
  blocked: "See hosts",
  dateChanges: "Review",
  cron: "Check logs",
};

async function getAdminStats() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) redirect("/");

  const sc = createServiceRoleClient();
  const since = new Date(Date.now() - ATTENTION_WINDOW_DAYS * 86_400_000).toISOString();
  const recentEvents = (eventType: string) =>
    sc.from("history_logs").select("id", { count: "exact", head: true }).eq("event_type", eventType).gte("created_at", since);
  const [hostsRes, pendingHostsRes, homestaysRes, totalBookingsRes, pendingBookingsRes, confirmedBookingsRes, revenueRes, homestayListRes, blockingInvoicesRes, unsettledRejected, retriesExhaustedRes, cron, blockedHosts, staleDateChanges] = await Promise.all([
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
    // Settled ones (082) no longer need anyone.
    countUnsettledRejected(since),
    recentEvents(EventType.BILLING_RETRY_EXHAUSTED),
    getCronHealth(),
    // Approved hosts only: a pending host has nothing bookable to block.
    sc
      .from("hosts")
      .select(`id, ${HOST_BLOCK_COLUMNS}`)
      .eq("status", "approved")
      .then(async ({ data }) => (await blockedHostIds((data ?? []) as (HostBlockRow & { id: string })[], sc)).size),
    countStaleDateChanges(),
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
    rejectedPayments: unsettledRejected,
    retriesExhausted: retriesExhaustedRes.count || 0,
    cron,
    blockedHosts,
    staleDateChanges,
  };
}

export default async function AdminDashboardPage() {
  const stats = await getAdminStats();

  // Totals are context, not work: one quiet strip under the queue.
  const totals: { label: string; value: string | number; href?: string }[] = [
    // Guests' confirmed booking value before promo discounts (get_admin_revenue_total), not platform income.
    { label: "Gross booking value", value: `฿${stats.bookingValue.toLocaleString()}` },
    { label: "Confirmed bookings", value: stats.confirmedBookings },
    { label: "Pending bookings", value: stats.pendingBookings, href: "/admin/bookings" },
    { label: "Pending hosts", value: stats.pendingHosts, href: "/admin/hosts?status=pending" },
    { label: "Hosts", value: stats.totalHosts, href: "/admin/hosts" },
    { label: "Homestays", value: stats.totalHomestays, href: "/admin/homestays" },
    { label: "Bookings", value: stats.totalBookings, href: "/admin/bookings" },
  ];

  const attention = attentionItems(stats);

  return (
    <div>
      <PageHeader title="Platform Overview" />
      <section aria-labelledby="attention-heading" className="mb-6">
        <h2 id="attention-heading" className="mb-3 text-sm font-semibold text-earth-900">
          Needs attention
        </h2>
        {attention.length === 0 ? (
          <p className="text-sm text-earth-600">
            All clear: the billing cron ran on time, and there are no overdue invoices or rejected payments.
          </p>
        ) : (
          <Card className="gap-0 overflow-hidden border-earth-100 bg-white py-0">
            <ul className="divide-y divide-earth-100">
              {attention.map((item) => {
                const Icon = ATTENTION_ICONS[item.key];
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-earth-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                    >
                      <Icon className="h-4.5 w-4.5 shrink-0 text-amber-700" aria-hidden />
                      <span className="min-w-0 flex-1 text-sm text-earth-800">{item.label}</span>
                      <span className="text-base font-semibold tabular-nums text-earth-900">{item.value}</span>
                      <span className="hidden items-center gap-0.5 text-sm font-medium text-brand sm:inline-flex">
                        {ATTENTION_ACTIONS[item.key]}
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-earth-600 sm:hidden" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="totals-heading">
        <h2 id="totals-heading" className="mb-3 text-sm font-semibold text-earth-900">
          Totals
        </h2>
        <Card className="border-earth-100 bg-white py-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
            {totals.map((t) => {
              const body = (
                <>
                  <p className="text-xs text-earth-600">{t.label}</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-earth-900">{t.value}</p>
                </>
              );
              return t.href ? (
                <Link
                  key={t.label}
                  href={t.href}
                  className="block px-4 py-3 transition-colors hover:bg-earth-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                >
                  {body}
                </Link>
              ) : (
                <div key={t.label} className="px-4 py-3">
                  {body}
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      {/* Guest demand, platform-wide. Same panel the hosts see on their own
          dashboard, just unscoped and filterable. */}
      <div className="mt-6">
        <AdminDemandSection homestays={stats.homestayList} />
      </div>
    </div>
  );
}
