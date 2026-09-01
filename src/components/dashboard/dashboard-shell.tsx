"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu, AlertTriangle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar, MobileSidebar } from "./sidebar";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { getPlanExpiryInfo, type PlanExpiryInfo } from "@/lib/plan-expiry";
import { blockingInvoiceFilter } from "@/lib/billing-dates";
import Link from "next/link";
import { useTranslations } from "next-intl";

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const isPending = pathname === "/dashboard/pending";
  const t = useTranslations("billing");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [brandName, setBrandName] = useState("Peaksnature");
  const [brandLogo, setBrandLogo] = useState<string | null>(null);
  const [expiryInfo, setExpiryInfo] = useState<PlanExpiryInfo | null>(null);
  const [invoiceBlocked, setInvoiceBlocked] = useState(false);

  useEffect(() => {
    const fetchBrand = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: host } = await supabase
        .from("hosts")
        .select("id, plan_type, plan_free_expires_at, plan_pending_type")
        .eq("user_id", user.id)
        .single();
      if (!host) return;

      const hostRow = host as {
        id: string;
        plan_type: string;
        plan_free_expires_at: string | null;
        plan_pending_type: string | null;
      };

      // Compute plan expiry phase — suppress banner if a switch is pending,
      // since the scheduled switch will resolve the expiry.
      const info = getPlanExpiryInfo(hostRow.plan_type, hostRow.plan_free_expires_at);
      setExpiryInfo(info.phase !== "active" && !hostRow.plan_pending_type ? info : null);

      // Fixed-rate hosts are blocked the day after an invoice's due date. The
      // expiry phase above only covers the free plan, so without this they'd
      // lose bookings with no dashboard-wide explanation.
      if (hostRow.plan_type === "fixed_rate") {
        const { data: pastDue } = await supabase
          .from("invoices")
          .select("id")
          .eq("host_id", hostRow.id)
          .or(blockingInvoiceFilter())
          .limit(1);
        setInvoiceBlocked(((pastDue as unknown[] | null)?.length ?? 0) > 0);
      } else {
        setInvoiceBlocked(false);
      }

      const { data: homestay } = await supabase
        .from("homestays")
        .select("name, logo_url")
        .eq("host_id", hostRow.id)
        .limit(1)
        .single();

      if (homestay) {
        const h = homestay as { name: string; logo_url: string | null };
        setBrandName(h.name);
        setBrandLogo(h.logo_url);
      }
    };
    fetchBrand();

    // Refetch when another part of the app mutates the host row (e.g. plan switch).
    const onPlanChanged = () => { fetchBrand(); };
    window.addEventListener("host:plan-changed", onPlanChanged);
    return () => window.removeEventListener("host:plan-changed", onPlanChanged);
  }, []);

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} brandName={brandName} brandLogo={brandLogo} />
      </div>

      {/* Mobile sidebar */}
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} brandName={brandName} brandLogo={brandLogo} />

      {/* Main content */}
      <div
        className={cn(
          "transition-all duration-300",
          collapsed ? "lg:ml-16" : "lg:ml-60"
        )}
      >
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-14 items-center border-b border-gray-200/80 bg-white/80 backdrop-blur-md px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-500 hover:text-gray-700"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="ml-3 text-sm font-semibold text-gray-900">
            {brandName}
          </span>
        </header>

        {/* Plan expiry banner — grace period */}
        {expiryInfo?.phase === "grace" && (
          <div className="mx-4 sm:mx-6 lg:mx-8 mt-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 p-2 shrink-0">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-800">{t("graceTitle")}</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  {t("graceDesc", { days: expiryInfo.graceDaysRemaining ?? 0 })}
                </p>
              </div>
              <Link href="/dashboard/billing">
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white text-xs shrink-0">
                  {t("upgradePlan")}
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Fixed-rate banner — unpaid invoice past its due date */}
        {invoiceBlocked && (
          <div className="mx-4 sm:mx-6 lg:mx-8 mt-4">
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
              <div className="rounded-lg bg-red-100 p-2 shrink-0">
                <ShieldAlert className="h-4 w-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-800">{t("blockedTitle")}</p>
                <p className="text-xs text-red-600 mt-0.5">{t("invoiceBlockedDesc")}</p>
              </div>
              <Link href="/dashboard/billing">
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white text-xs shrink-0">
                  {t("payNow")}
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Plan expiry banner — blocked */}
        {expiryInfo?.phase === "blocked" && (
          <div className="mx-4 sm:mx-6 lg:mx-8 mt-4">
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
              <div className="rounded-lg bg-red-100 p-2 shrink-0">
                <ShieldAlert className="h-4 w-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-800">{t("blockedTitle")}</p>
                <p className="text-xs text-red-600 mt-0.5">{t("blockedDesc")}</p>
              </div>
              <Link href="/dashboard/billing">
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white text-xs shrink-0">
                  {t("upgradePlan")}
                </Button>
              </Link>
            </div>
          </div>
        )}

        <main className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Blur overlay for pending approval */}
      {isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-sm">
          <div className="pointer-events-auto">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
