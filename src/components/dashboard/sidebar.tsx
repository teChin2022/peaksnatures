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
  Tag,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
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
  { key: "promoCodes", href: "/dashboard/promo-codes", icon: Tag },
  { key: "billing", href: "/dashboard/billing", icon: Wallet },
  { key: "wallet", href: "/dashboard/wallet", icon: Receipt },
  // { key: "guide", href: "/dashboard/guide", icon: BookOpen },
  { key: "team", href: "/dashboard/team", icon: Users },
  { key: "profile", href: "/dashboard/profile", icon: User }
] as const;

/** Who is signed in: null until the shell knows. */
export type DashboardRole = "owner" | "staff" | null;

/**
 * Pages a staff login (migration 081) cannot use; the middleware sends staff
 * away from them too. Hidden until the role is known, so a staff login never
 * sees them flash in.
 */
const OWNER_ONLY_NAV = new Set<string>(["team", "billing", "wallet", "profile"]);
const navItemsFor = (role: DashboardRole) =>
  role === "owner" ? NAV_ITEMS : NAV_ITEMS.filter((item) => !OWNER_ONLY_NAV.has(item.key));

/** The signed-in email and role above Sign out: owner and staff often share the front-desk device. */
function SignedInAs({ email, role }: { email?: string | null; role: DashboardRole }) {
  const t = useTranslations("dashboardNav");
  if (!email || !role) return null;
  return (
    <div className="px-3 pb-1 pt-1.5">
      <p className="truncate text-xs font-medium text-earth-900" title={email}>
        {email}
      </p>
      <p className="text-xs text-earth-600">{role === "staff" ? t("roleStaff") : t("roleOwner")}</p>
    </div>
  );
}

/** Whether a nav item is the current page: the overview only on its own path. */
const isNavActive = (href: string, pathname: string) =>
  href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

/** The `dashboardNav` key of the current page, for the phone top bar's title; null off the nav. */
export function navKeyFor(pathname: string): (typeof NAV_ITEMS)[number]["key"] | null {
  return NAV_ITEMS.find((item) => isNavActive(item.href, pathname))?.key ?? null;
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  brandName?: string;
  brandLogo?: string | null;
  role?: DashboardRole;
  accountEmail?: string | null;
}

export function Sidebar({ collapsed, onToggle, brandName = "Peaksnature", brandLogo, role = null, accountEmail }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("dashboardNav");
  const ta = useTranslations("auth");
  const tc = useTranslations("common");

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
        "fixed left-0 top-0 z-40 flex h-full flex-col border-r border-earth-200/80 bg-white transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Brand */}
      <div className="flex h-14 items-center justify-between border-b border-earth-100 px-3">
        {/* <Link href="/" className="flex items-center gap-2.5 overflow-hidden"> */}
          {!collapsed && (
            <span className="whitespace-nowrap font-semibold truncate text-earth-900">
              {brandName}
            </span>
          )}
        {/* </Link> */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-earth-600 hover:text-earth-700"
          onClick={onToggle}
          aria-label={collapsed ? tc("expandSidebar") : tc("collapseSidebar")}
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
        {navItemsFor(role).map((item) => {
          const Icon = item.icon;
          const isActive = isNavActive(item.href, pathname);

          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                isActive
                  ? "bg-brand/8 text-brand"
                  : "text-earth-600 hover:bg-earth-50 hover:text-earth-900"
              )}
              title={collapsed ? t(item.key) : undefined}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-brand" : "text-earth-600")} />
              {!collapsed && <span className="truncate">{t(item.key)}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="border-t border-earth-100 px-2 py-2">
        {!collapsed && <SignedInAs email={accountEmail} role={role} />}
        <button
          onClick={handleSignOut}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-earth-600 transition-colors hover:bg-earth-50 hover:text-earth-700"
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
  role = null,
  accountEmail,
}: {
  open: boolean;
  onClose: () => void;
  brandName?: string;
  brandLogo?: string | null;
  role?: DashboardRole;
  accountEmail?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("dashboardNav");
  const ta = useTranslations("auth");
  const tc = useTranslations("common");

  const handleSignOut = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await logClientEvent({ entity_type: "host", entity_id: user?.id || "unknown", event_type: "HOST_LOGOUT", data: { email: user?.email } });
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    // A real dialog: focus moves in and is trapped, Esc and the backdrop close it,
    // focus returns to the menu button. Plain dim overlay, no blur (DESIGN.md).
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-60 gap-0 border-earth-200/80 bg-white p-0 data-[state=closed]:duration-200 data-[state=open]:duration-300 motion-reduce:animate-none sm:max-w-none lg:hidden"
      >
        <SheetTitle className="sr-only">{tc("menu")}</SheetTitle>
        <SheetDescription className="sr-only">{brandName}</SheetDescription>
        <div className="flex h-14 items-center justify-between border-b border-earth-100 px-3">
          <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
            {brandLogo ? (
              <Image src={brandLogo} alt={brandName} width={28} height={28} className="h-7 w-7 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-[10px] font-bold text-brand">
                {getInitials(brandName)}
              </div>
            )}
            <span className="font-semibold truncate text-earth-900">{brandName}</span>
          </Link>
          {/* 44px target on phones; -mr-2 keeps the icon where the 28px button had it. */}
          <Button variant="ghost" size="icon" className="-mr-2 size-11 shrink-0 text-earth-600 hover:text-earth-700" onClick={onClose} aria-label={tc("close")}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3 scrollbar-hide">
          {navItemsFor(role).map((item) => {
            const Icon = item.icon;
            const isActive = isNavActive(item.href, pathname);

            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onClose}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  // 44px rows, 14px text on phones (DESIGN: Body-sm for the dashboard)
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-brand/8 text-brand"
                    : "text-earth-600 hover:bg-earth-50 hover:text-earth-900"
                )}
              >
                <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-brand" : "text-earth-600")} />
                <span className="truncate">{t(item.key)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-earth-100 px-2 py-2">
          <SignedInAs email={accountEmail} role={role} />
          <button
            onClick={handleSignOut}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-earth-600 transition-colors hover:bg-earth-50 hover:text-earth-700"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">{ta("signOut")}</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
