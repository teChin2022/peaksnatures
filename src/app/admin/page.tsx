import Link from "next/link";
import { Users, Home, CalendarDays, DollarSign, AlertTriangle, CheckCircle2, UserCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";

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
    { label: "Total Hosts", value: stats.totalHosts, icon: Users, bg: "bg-blue-100", fg: "text-blue-600" },
    { label: "Pending Hosts", value: stats.pendingHosts, icon: UserCheck, bg: "bg-amber-100", fg: "text-amber-600", href: "/admin/hosts?status=pending" },
    { label: "Total Homestays", value: stats.totalHomestays, icon: Home, bg: "bg-purple-100", fg: "text-purple-600" },
    { label: "Total Bookings", value: stats.totalBookings, icon: CalendarDays, bg: "bg-orange-100", fg: "text-orange-600" },
    { label: "Total Revenue", value: `฿${stats.totalRevenue.toLocaleString()}`, icon: DollarSign, bg: "bg-brand-50", fg: "text-brand" },
    { label: "Confirmed", value: stats.confirmedBookings, icon: CheckCircle2, bg: "bg-brand-50", fg: "text-brand" },
    { label: "Pending Bookings", value: stats.pendingBookings, icon: AlertTriangle, bg: "bg-yellow-100", fg: "text-yellow-600" },
  ];

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-1">Dashboard</p>
        <h1 className="text-2xl font-serif text-gray-900">Platform Overview</h1>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const inner = (
            <Card key={card.label} className={(card as { href?: string }).href ? "hover:shadow-md transition-shadow cursor-pointer" : ""}>
              <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                <div className={`rounded-lg p-2 sm:p-2.5 ${card.bg}`}>
                  <Icon className={`h-5 w-5 ${card.fg}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-500 truncate">{card.label}</p>
                  <p className="text-xl sm:text-2xl font-bold truncate">{card.value}</p>
                </div>
              </CardContent>
            </Card>
          );
          const href = (card as { href?: string }).href;
          return href ? <Link key={card.label} href={href}>{inner}</Link> : <div key={card.label}>{inner}</div>;
        })}
      </div>
    </div>
  );
}
