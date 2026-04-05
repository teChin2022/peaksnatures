"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  User,
  Home,
  BedDouble,
  CalendarDays,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  LogOut,
  X,
  BookOpen,
  ClipboardCheck,
  Wallet,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { logClientEvent } from "@/lib/history-log-client";

const NAV_ITEMS = [
  { key: "overview", href: "/dashboard", icon: LayoutDashboard },
  { key: "homestay", href: "/dashboard/homestay", icon: Home },
  { key: "rooms", href: "/dashboard/rooms", icon: BedDouble },
  { key: "bookings", href: "/dashboard/bookings", icon: CalendarDays },
  { key: "calendar", href: "/dashboard/calendar", icon: CalendarCheck },
  { key: "checkins", href: "/dashboard/checkins", icon: ClipboardCheck },
  { key: "billing", href: "/dashboard/billing", icon: Wallet },
  { key: "wallet", href: "/dashboard/wallet", icon: Receipt },
  { key: "guide", href: "/dashboard/guide", icon: BookOpen },
  { key: "profile", href: "/dashboard/profile", icon: User }
] as const;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  brandName?: string;
  brandLogo?: string | null;
}

export function Sidebar({ collapsed, onToggle, brandName = "Peaksnature", brandLogo }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("dashboardNav");
  const ta = useTranslations("auth");

  const handleSignOut = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await logClientEvent({ entity_type: "host", entity_id: user?.id || "unknown", event_type: "HOST_LOGOUT", data: { email: user?.email } });
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-full flex-col border-r border-gray-200/80 bg-white transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Brand */}
      <div className="flex h-14 items-center justify-between border-b border-gray-100 px-3">
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
          {brandLogo ? (
            <Image src={brandLogo} alt={brandName} width={28} height={28} className="h-7 w-7 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-[10px] font-bold text-brand">
              {getInitials(brandName)}
            </div>
          )}
          {!collapsed && (
            <span className="whitespace-nowrap font-semibold truncate text-gray-900">
              {brandName}
            </span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-gray-400 hover:text-gray-600"
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
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3 scrollbar-hide">
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
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                isActive
                  ? "bg-brand/8 text-brand"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
              )}
              title={collapsed ? t(item.key) : undefined}
            >
              <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-brand" : "text-gray-400")} />
              {!collapsed && <span className="truncate">{t(item.key)}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="border-t border-gray-100 px-2 py-2">
        <button
          onClick={handleSignOut}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
          )}
          title={collapsed ? ta("signOut") : undefined}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
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
  brandName = "Peaksnature",
  brandLogo,
}: {
  open: boolean;
  onClose: () => void;
  brandName?: string;
  brandLogo?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("dashboardNav");
  const ta = useTranslations("auth");

  const handleSignOut = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await logClientEvent({ entity_type: "host", entity_id: user?.id || "unknown", event_type: "HOST_LOGOUT", data: { email: user?.email } });
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside className="fixed left-0 top-0 z-50 flex h-full w-60 flex-col border-r border-gray-200/80 bg-white lg:hidden">
        <div className="flex h-14 items-center justify-between border-b border-gray-100 px-3">
          <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
            {brandLogo ? (
              <Image src={brandLogo} alt={brandName} width={28} height={28} className="h-7 w-7 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-[10px] font-bold text-brand">
                {getInitials(brandName)}
              </div>
            )}
            <span className="font-semibold truncate text-gray-900">{brandName}</span>
          </Link>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-600" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3 scrollbar-hide">
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
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-brand/8 text-brand"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                )}
              >
                <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-brand" : "text-gray-400")} />
                <span className="truncate">{t(item.key)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-100 px-2 py-2">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">{ta("signOut")}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
