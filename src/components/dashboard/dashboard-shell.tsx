"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu, AlertTriangle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar, MobileSidebar, navKeyFor, type DashboardRole } from "./sidebar";
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
  const tc = useTranslations("common");
  const tNav = useTranslations("dashboardNav");
  const pageKey = navKeyFor(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [brandName, setBrandName] = useState("Peaksnature");
  const [brandLogo, setBrandLogo] = useState<string | null>(null);
  const [expiryInfo, setExpiryInfo] = useState<PlanExpiryInfo | null>(null);
  const [invoiceBlocked, setInvoiceBlocked] = useState(false);
  const [role, setRole] = useState<DashboardRole>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  // Staff cannot open billing, so they get a plain notice when guests cannot book.
  const [staffBlocked, setStaffBlocked] = useState(false);

  useEffect(() => {
    const fetchBrand = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setAccountEmail(user.email ?? null);

      // No user_id filter: RLS shows a login only its own host, or the one it is staff of (081).
      const { data: host } = await supabase
        .from("hosts")
        .select("id, user_id, plan_type, plan_free_expires_at, plan_pending_type")
        .single();
      if (!host) return;

      const hostRow = host as {
        id: string;
        user_id: string;
        plan_type: string;
        plan_free_expires_at: string | null;
        plan_pending_type: string | null;
      };

      // A staff login works for this host but cannot open billing, so the
      // billing banners and their links are the owner's alone.
      const staff = hostRow.user_id !== user.id;
      setRole(staff ? "staff" : "owner");
      if (staff) {
        const res = await fetch("/api/host/profile").catch(() => null);
        const profile = res?.ok ? ((await res.json()) as { bookingBlocked?: boolean }) : null;
        setStaffBlocked(profile?.bookingBlocked === true);
      }

      // Compute plan expiry phase — suppress banner if a switch is pending,
      // since the scheduled switch will resolve the expiry.
      const info = getPlanExpiryInfo(hostRow.plan_type, hostRow.plan_free_expires_at);
      setExpiryInfo(!staff && info.phase !== "active" && !hostRow.plan_pending_type ? info : null);

      // Fixed-rate hosts are blocked the day after an invoice's due date. The
      // expiry phase above only covers the free plan, so without this they'd
      // lose bookings with no dashboard-wide explanation.
      if (!staff && hostRow.plan_type === "fixed_rate") {
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
    <div data-surface="dashboard" className="min-h-screen bg-earth-50">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} brandName={brandName} brandLogo={brandLogo} role={role} accountEmail={accountEmail} />
      </div>

      {/* Mobile sidebar */}
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} brandName={brandName} brandLogo={brandLogo} role={role} accountEmail={accountEmail} />

      {/* Main content */}
      <div
        className={cn(
          "transition-all duration-300",
          collapsed ? "lg:ml-16" : "lg:ml-60"
        )}
      >
        {/* Mobile header */}
        {/* Solid white, no glass (DESIGN.md: no backdrop-blur on bars). */}
        <header className="sticky top-0 z-30 flex h-14 items-center border-b border-earth-200/80 bg-white px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 size-11 text-earth-600 hover:text-earth-800"
            onClick={() => setMobileOpen(true)}
            aria-label={tc("menu")}
            aria-expanded={mobileOpen}
            aria-haspopup="dialog"
          >
            <Menu className="h-5 w-5" />
          </Button>
          {/* Where the host is, not who they are: the sidebar already carries the brand (D5). */}
          <span className="ml-1 truncate text-sm font-semibold text-earth-900">
            {pageKey ? tNav(pageKey) : brandName}
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
                <p className="text-sm text-amber-800 mt-0.5">
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
                <p className="text-sm text-red-700 mt-0.5">{t("invoiceBlockedDesc")}</p>
              </div>
              <Link href="/dashboard/billing">
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white text-xs shrink-0">
                  {t("payNow")}
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Staff: guests cannot book. No link: billing is the owner's. */}
        {role === "staff" && staffBlocked && (
          <div className="mx-4 sm:mx-6 lg:mx-8 mt-4">
            <div role="status" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
              <div className="rounded-lg bg-red-100 p-2 shrink-0">
                <ShieldAlert className="h-4 w-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-800">{t("staffBlockedTitle")}</p>
                <p className="text-sm text-red-700 mt-0.5">{t("staffBlockedDesc")}</p>
              </div>
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
                <p className="text-sm text-red-700 mt-0.5">{t("blockedDesc")}</p>
              </div>
              <Link href="/dashboard/billing">
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white text-xs shrink-0">
                  {t("upgradePlan")}
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* The pending page renders once, in the overlay below (D4). */}
        <main className="p-4 sm:p-6 lg:p-8">
          {!isPending && children}
        </main>
      </div>

      {/* Pending approval: a plain dim over the shell, no blur (DESIGN.md) */}
      {isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-earth-50/90">
          <div className="pointer-events-auto">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
