"use client";

import { useState, useEffect } from "react";
import { Users, Home, CalendarDays, DollarSign, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Stats {
  totalHosts: number;
  totalHomestays: number;
  totalBookings: number;
  totalRevenue: number;
  pendingBookings: number;
  confirmedBookings: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/admin/stats");
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error("Failed to fetch admin stats:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-bold text-gray-900 mb-6">Platform Overview</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-4 p-4">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-7 w-12" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div>
        <h1 className="text-xl font-bold text-gray-900 mb-6">Platform Overview</h1>
        <p className="text-gray-500">Failed to load stats.</p>
      </div>
    );
  }

  const cards = [
    { label: "Total Hosts", value: stats.totalHosts, icon: Users, bg: "bg-blue-100", fg: "text-blue-600" },
    { label: "Total Homestays", value: stats.totalHomestays, icon: Home, bg: "bg-purple-100", fg: "text-purple-600" },
    { label: "Total Bookings", value: stats.totalBookings, icon: CalendarDays, bg: "bg-orange-100", fg: "text-orange-600" },
    { label: "Total Revenue", value: `฿${stats.totalRevenue.toLocaleString()}`, icon: DollarSign, bg: "bg-green-100", fg: "text-green-600" },
    { label: "Confirmed", value: stats.confirmedBookings, icon: CheckCircle2, bg: "bg-emerald-100", fg: "text-emerald-600" },
    { label: "Pending Review", value: stats.pendingBookings, icon: AlertTriangle, bg: "bg-yellow-100", fg: "text-yellow-600" },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">Platform Overview</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className={`rounded-lg p-2.5 ${card.bg}`}>
                  <Icon className={`h-5 w-5 ${card.fg}`} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="text-2xl font-bold">{card.value}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
