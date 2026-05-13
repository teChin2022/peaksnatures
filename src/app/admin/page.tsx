import { Users, Home, CalendarDays, DollarSign, AlertTriangle, CheckCircle2, UserCheck } from "lucide-react";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { KpiCard } from "@/components/admin/kpi-card";

async function getAdminStats() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) redirect("/");

  const sc = createServiceRoleClient();
  const [hostsRes, pendingHostsRes, homestaysRes, totalBookingsRes, pendingBookingsRes, confirmedBookingsRes, revenueRes] = await Promise.all([
    sc.from("hosts").select("id", { count: "exact", head: true }),
    sc.from("hosts").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sc.from("homestays").select("id", { count: "exact", head: true }),
    sc.from("bookings").select("id", { count: "exact", head: true }),
    sc.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sc.from("bookings").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
    sc.from("bookings").select("total_price").in("status", ["confirmed", "completed"]),
  ]);

  const revenueRows = (revenueRes.data as { total_price: number }[]) || [];
  return {
    totalHosts: hostsRes.count || 0,
    pendingHosts: pendingHostsRes.count || 0,
    totalHomestays: homestaysRes.count || 0,
    totalBookings: totalBookingsRes.count || 0,
    pendingBookings: pendingBookingsRes.count || 0,
    confirmedBookings: confirmedBookingsRes.count || 0,
    totalRevenue: revenueRows.reduce((sum, b) => sum + b.total_price, 0),
  };
}

export default async function AdminDashboardPage() {
  const stats = await getAdminStats();

  const cards = [
    { label: "Total Revenue", value: `฿${stats.totalRevenue.toLocaleString()}`, icon: DollarSign, tone: "brand" as const },
    { label: "Confirmed Bookings", value: stats.confirmedBookings, icon: CheckCircle2, tone: "brand" as const },
    { label: "Pending Bookings", value: stats.pendingBookings, icon: AlertTriangle, tone: "amber" as const, href: "/admin/bookings" },
    { label: "Pending Hosts", value: stats.pendingHosts, icon: UserCheck, tone: "amber" as const, href: "/admin/hosts?status=pending" },
    { label: "Total Hosts", value: stats.totalHosts, icon: Users, tone: "earth" as const, href: "/admin/hosts" },
    { label: "Total Homestays", value: stats.totalHomestays, icon: Home, tone: "earth" as const, href: "/admin/homestays" },
    { label: "Total Bookings", value: stats.totalBookings, icon: CalendarDays, tone: "neutral" as const, href: "/admin/bookings" },
  ];

  return (
    <div>
      <PageHeader eyebrow="Dashboard" title="Platform Overview" />
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
    </div>
  );
}
