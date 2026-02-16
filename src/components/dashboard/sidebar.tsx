"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  User,
  Home,
  BedDouble,
  Palette,
  CalendarDays,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  LogOut,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const NAV_ITEMS = [
  { key: "overview", href: "/dashboard", icon: LayoutDashboard },
  { key: "homestay", href: "/dashboard/homestay", icon: Home },
  { key: "rooms", href: "/dashboard/rooms", icon: BedDouble },
  { key: "bookings", href: "/dashboard/bookings", icon: CalendarDays },
  { key: "calendar", href: "/dashboard/calendar", icon: CalendarCheck },
  { key: "theme", href: "/dashboard/theme", icon: Palette },
  { key: "profile", href: "/dashboard/profile", icon: User }
] as const;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  brandName?: string;
  brandLogo?: string | null;
  themeColor?: string;
}

export function Sidebar({ collapsed, onToggle, brandName = "PeaksNature", brandLogo, themeColor = "#16a34a" }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("dashboardNav");
  const ta = useTranslations("auth");

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-full flex-col border-r bg-white transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Brand */}
      <div className="flex h-14 items-center justify-between border-b px-3">
        <Link href="/" className="flex items-center gap-2 overflow-hidden">
          {brandLogo ? (
            <img src={brandLogo} alt={brandName} className="h-6 w-6 shrink-0 rounded object-cover" />
          ) : (
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
              style={{ backgroundColor: themeColor }}
            >
              {getInitials(brandName)}
            </div>
          )}
          {!collapsed && (
            <span className="whitespace-nowrap font-bold truncate" style={{ color: themeColor }}>
              {brandName}
            </span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onToggle}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? ""
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
              style={isActive ? { backgroundColor: themeColor + '0d', color: themeColor } : undefined}
              title={collapsed ? t(item.key) : undefined}
            >
              <Icon className="h-4.5 w-4.5 shrink-0" />
              {!collapsed && <span className="truncate">{t(item.key)}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="border-t p-2">
        <button
          onClick={handleSignOut}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
          )}
          title={collapsed ? ta("signOut") : undefined}
        >
          <LogOut className="h-4.5 w-4.5 shrink-0" />
          {!collapsed && <span className="truncate">{ta("signOut")}</span>}
        </button>
      </div>
    </aside>
  );
}

/** Mobile overlay sidebar */
export function MobileSidebar({
  open,
  onClose,
  brandName = "PeaksNature",
  brandLogo,
  themeColor = "#16a34a",
}: {
  open: boolean;
  onClose: () => void;
  brandName?: string;
  brandLogo?: string | null;
  themeColor?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("dashboardNav");
  const ta = useTranslations("auth");

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside className="fixed left-0 top-0 z-50 flex h-full w-60 flex-col border-r bg-white lg:hidden">
        <div className="flex h-14 items-center justify-between border-b px-3">
          <Link href="/" className="flex items-center gap-2 overflow-hidden">
            {brandLogo ? (
              <img src={brandLogo} alt={brandName} className="h-6 w-6 shrink-0 rounded object-cover" />
            ) : (
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
                style={{ backgroundColor: themeColor }}
              >
                {getInitials(brandName)}
              </div>
            )}
            <span className="font-bold truncate" style={{ color: themeColor }}>{brandName}</span>
          </Link>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? ""
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
                style={isActive ? { backgroundColor: themeColor + '0d', color: themeColor } : undefined}
              >
                <Icon className="h-4.5 w-4.5 shrink-0" />
                <span className="truncate">{t(item.key)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-2">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <LogOut className="h-4.5 w-4.5 shrink-0" />
            <span className="truncate">{ta("signOut")}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
