"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Home,
  CalendarDays,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Shield,
  ScrollText,
  Settings,
  CreditCard,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { key: "Overview", href: "/admin", icon: LayoutDashboard },
  { key: "Hosts", href: "/admin/hosts", icon: Users },
  { key: "Homestays", href: "/admin/homestays", icon: Home },
  { key: "Bookings", href: "/admin/bookings", icon: CalendarDays },
  { key: "Promo Codes", href: "/admin/promo-codes", icon: Tag },
  { key: "Billing", href: "/admin/billing", icon: CreditCard },
  { key: "Logs", href: "/admin/logs", icon: ScrollText },
  { key: "Settings", href: "/admin/settings", icon: Settings },
] as const;

const NAV_LINK_BASE =
  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors";
const NAV_LINK_ACTIVE = "bg-brand-50 text-brand sidebar-active-glow";
const NAV_LINK_INACTIVE =
  "text-earth-700 hover:bg-earth-50 hover:text-brand";

interface AdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

function AdminSidebar({ collapsed, onToggle }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-full flex-col border-r border-earth-100 bg-white transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-earth-100 px-3">
        <Link href="/admin" className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brand">
            <Shield className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <span className="whitespace-nowrap font-bold text-brand-700">
              Platform Admin
            </span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 cursor-pointer text-earth-600 hover:bg-earth-50 hover:text-brand"
          onClick={onToggle}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(NAV_LINK_BASE, isActive ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE)}
              title={collapsed ? item.key : undefined}
            >
              <Icon className="h-4.5 w-4.5 shrink-0" />
              {!collapsed && <span className="truncate">{item.key}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-earth-100 p-2">
        <button
          onClick={handleSignOut}
          className={cn(
            NAV_LINK_BASE,
            "w-full cursor-pointer text-earth-700 hover:bg-earth-50 hover:text-brand"
          )}
          title={collapsed ? "Sign Out" : undefined}
        >
          <LogOut className="h-4.5 w-4.5 shrink-0" />
          {!collapsed && <span className="truncate">Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}

function AdminMobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-earth-900/30 backdrop-blur-sm lg:hidden" onClick={onClose} />
      <aside className="fixed left-0 top-0 z-50 flex h-full w-60 flex-col border-r border-earth-100 bg-white lg:hidden">
        <div className="flex h-14 items-center justify-between border-b border-earth-100 px-3">
          <Link href="/admin" className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brand">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-brand-700">Platform Admin</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 cursor-pointer text-earth-600 hover:bg-earth-50 hover:text-brand"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onClose}
                className={cn(NAV_LINK_BASE, isActive ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE)}
              >
                <Icon className="h-4.5 w-4.5 shrink-0" />
                <span className="truncate">{item.key}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-earth-100 p-2">
          <button
            onClick={handleSignOut}
            className={cn(
              NAV_LINK_BASE,
              "w-full cursor-pointer text-earth-700 hover:bg-earth-50 hover:text-brand"
            )}
          >
            <LogOut className="h-4.5 w-4.5 shrink-0" />
            <span className="truncate">Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const currentNav = NAV_ITEMS.find((item) =>
    item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href)
  );
  const currentTitle = currentNav?.key ?? "Platform Admin";

  return (
    <div className="admin-surface min-h-screen">
      <div className="hidden lg:block">
        <AdminSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </div>

      <AdminMobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div
        className={cn(
          "transition-all duration-300",
          collapsed ? "lg:ml-16" : "lg:ml-60"
        )}
      >
        <header
          className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-earth-100 bg-white/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-white/70 lg:hidden"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 cursor-pointer text-earth-700 hover:bg-earth-50 hover:text-brand"
            onClick={() => setMobileOpen(true)}
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
