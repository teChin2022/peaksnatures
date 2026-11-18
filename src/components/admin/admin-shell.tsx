"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Home,
  CalendarDays,
  CalendarClock,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Shield,
  ScrollText,
  Settings,
  CreditCard,
  Banknote,
  Tag,
  TrendingUp,
  Star,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

/** What /api/admin/nav-counts returns: work waiting behind a nav item. */
export type NavCounts = {
  pendingHosts: number;
  overdueInvoices: number;
  unsettledPayments: number;
  staleDateChanges: number;
};

type NavItem = { key: string; href: string; icon: LucideIcon; count?: keyof NavCounts; countLabel?: string };

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Operations",
    items: [
      { key: "Overview", href: "/admin", icon: LayoutDashboard },
      { key: "Hosts", href: "/admin/hosts", icon: Users, count: "pendingHosts", countLabel: "waiting for approval" },
      { key: "Homestays", href: "/admin/homestays", icon: Home },
      { key: "Bookings", href: "/admin/bookings", icon: CalendarDays },
      { key: "Date changes", href: "/admin/bookings/date-changes", icon: CalendarClock, count: "staleDateChanges", countLabel: "waiting on hosts" },
      { key: "Reviews", href: "/admin/reviews", icon: Star },
    ],
  },
  {
    label: "Money",
    items: [
      { key: "Billing", href: "/admin/billing", icon: CreditCard, count: "overdueInvoices", countLabel: "overdue" },
      { key: "Rejected payments", href: "/admin/billing/rejected", icon: Banknote, count: "unsettledPayments", countLabel: "to settle" },
      { key: "Revenue", href: "/admin/revenue", icon: TrendingUp },
      { key: "Promo Codes", href: "/admin/promo-codes", icon: Tag },
    ],
  },
  {
    label: "System",
    items: [
      { key: "Logs", href: "/admin/logs", icon: ScrollText },
      { key: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/** The longest nav href the path sits under, so /admin/billing/rejected lights "Rejected payments", not "Billing" too. */
export function activeNavHref(pathname: string): string | undefined {
  return NAV_ITEMS.map((i) => i.href)
    .filter((href) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0];
}

const NAV_LINK_BASE =
  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const NAV_LINK_ACTIVE = "bg-brand-50 text-brand";
const NAV_LINK_INACTIVE = "text-earth-700 hover:bg-earth-50 hover:text-brand";

async function signOut(router: ReturnType<typeof useRouter>) {
  const supabase = createClient();
  await supabase.auth.signOut();
  router.push("/admin/login");
  router.refresh();
}

function AdminNav({
  collapsed = false,
  onNavigate,
  counts,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  counts: NavCounts | null;
}) {
  const active = activeNavHref(usePathname());
  return (
    <nav aria-label="Admin" className="flex-1 overflow-y-auto p-2">
      {NAV_GROUPS.map((group, gi) => (
        <div key={group.label} className={cn(gi > 0 && "mt-4")}>
          {collapsed ? (
            gi > 0 && <div className="mx-2 mb-3 border-t border-earth-100" aria-hidden />
          ) : (
            <p className="px-3 pb-1 text-xs font-medium text-earth-600">{group.label}</p>
          )}
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === active;
              const n = item.count && counts ? counts[item.count] : 0;
              const name = n > 0 ? `${item.key}, ${n} ${item.countLabel}` : item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={collapsed || n > 0 ? name : undefined}
                  title={collapsed ? name : undefined}
                  className={cn(NAV_LINK_BASE, "relative", isActive ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE)}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">{item.key}</span>}
                  {n > 0 &&
                    (collapsed ? (
                      <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-600" aria-hidden />
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-800" aria-hidden>
                        {n}
                      </span>
                    ))}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SignOutButton({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  return (
    <div className="border-t border-earth-100 p-2">
      <button
        onClick={() => signOut(router)}
        className={cn(NAV_LINK_BASE, "w-full cursor-pointer text-earth-700 hover:bg-earth-50 hover:text-brand")}
        aria-label={collapsed ? "Sign Out" : undefined}
        title={collapsed ? "Sign Out" : undefined}
      >
        <LogOut className="h-4.5 w-4.5 shrink-0" />
        {!collapsed && <span className="truncate">Sign Out</span>}
      </button>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brand">
      <Shield className="h-4 w-4 text-white" />
    </div>
  );
}

function AdminSidebar({ collapsed, onToggle, counts }: { collapsed: boolean; onToggle: () => void; counts: NavCounts | null }) {
  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-full flex-col border-r border-earth-100 bg-white transition-[width] duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-earth-100 px-3">
        <Link href="/admin" aria-label="Platform Admin home" className="flex items-center gap-2 overflow-hidden">
          <BrandMark />
          {!collapsed && <span className="whitespace-nowrap font-bold text-brand-700">Platform Admin</span>}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 cursor-pointer text-earth-600 hover:bg-earth-50 hover:text-brand"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      <AdminNav collapsed={collapsed} counts={counts} />
      <SignOutButton collapsed={collapsed} />
    </aside>
  );
}

function AdminMobileSidebar({ open, onClose, counts }: { open: boolean; onClose: () => void; counts: NavCounts | null }) {
  return (
    // A real dialog (same as the host drawer): focus is trapped, Esc and the backdrop close it,
    // focus returns to the menu button. Plain dim overlay, no blur (DESIGN.md).
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-60 gap-0 border-earth-100 bg-white p-0 data-[state=closed]:duration-200 data-[state=open]:duration-300 motion-reduce:animate-none sm:max-w-none lg:hidden"
      >
        <SheetTitle className="sr-only">Admin menu</SheetTitle>
        <SheetDescription className="sr-only">Platform Admin navigation</SheetDescription>
        <div className="flex h-14 items-center justify-between border-b border-earth-100 px-3">
          <Link href="/admin" onClick={onClose} className="flex items-center gap-2 overflow-hidden">
            <BrandMark />
            <span className="font-bold text-brand-700">Platform Admin</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 cursor-pointer text-earth-600 hover:bg-earth-50 hover:text-brand"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <AdminNav onNavigate={onClose} counts={counts} />
        <SignOutButton />
      </SheetContent>
    </Sheet>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const active = activeNavHref(pathname);
  const [counts, setCounts] = useState<NavCounts | null>(null);

  // Refetched on every page change, so a badge clears once its work is done.
  // A failed fetch keeps the last counts: badges are a hint, the pages are the truth.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/nav-counts")
      .then((r) => (r.ok ? r.json() : null))
      .then((c: NavCounts | null) => {
        if (!cancelled && c) setCounts(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);
  const currentTitle = NAV_ITEMS.find((item) => item.href === active)?.key ?? "Platform Admin";

  return (
    <div className="admin-surface min-h-screen">
      <div className="hidden lg:block">
        <AdminSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} counts={counts} />
      </div>

      <AdminMobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} counts={counts} />

      <div className={cn("transition-[margin] duration-200", collapsed ? "lg:ml-16" : "lg:ml-60")}>
        {/* Solid white, no glass (DESIGN.md: no backdrop-blur on bars). */}
        <header
          className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-earth-100 bg-white px-4 lg:hidden"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 size-11 shrink-0 cursor-pointer text-earth-700 hover:bg-earth-50 hover:text-brand"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-brand">
              <Shield className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="truncate font-serif text-sm text-earth-900">{currentTitle}</span>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
