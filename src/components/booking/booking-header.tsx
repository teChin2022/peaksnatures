"use client";

import { useState, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, LogIn, ArrowRightLeft, Receipt, PenLine } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FullScreenMenu, type MenuItem } from "@/components/full-screen-menu";
import { LanguageSwitcherIcon } from "@/components/language-switcher-icon";
import { HeaderCart } from "@/components/booking/header-cart";
import { ResumeBookingDialog } from "@/components/booking/resume-booking-dialog";

interface BookingHeaderProps {
  homestayName: string;
  logoUrl?: string | null;
  slug: string;
  homestayId: string;
  /**
   * False when the host has booking_draft_hours = 0, or bookings are blocked.
   * Needs BookingCartProvider, so it stays false on the landing.
   */
  resumeEnabled?: boolean;
  /**
   * Landing mode (/[slug]): a Book button links here in place of the cart,
   * which needs BookingCartProvider.
   */
  bookHref?: string;
  /** Landing mode: the host can't take bookings, so the Book button is left out. */
  bookingDisabled?: boolean;
  /** Landing section links: inline from xl, in the full-screen menu below it. menuOnly: the menu only (the xl row has no room). */
  navItems?: { href: string; label: string; menuOnly?: boolean }[];
}

// Solid once the hero's top is scrolled past. Read from the page itself, so a
// reload mid-page or a #section link starts solid, with no scroll event needed.
const subscribeScroll = (onChange: () => void) => {
  window.addEventListener("scroll", onChange, { passive: true });
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
};
const pastHeroTop = () => window.scrollY > window.innerHeight * 0.15;
const atTopOnServer = () => false;

export function BookingHeader({ homestayName, logoUrl, slug, homestayId, resumeEnabled = false, bookHref, bookingDisabled = false, navItems = [] }: BookingHeaderProps) {
  const scrolled = useSyncExternalStore(subscribeScroll, pastHeroTop, atTopOnServer);
  // The landing's section links need xl: at lg they wrap to two lines and crowd the Book button.
  const inlineNav = navItems.length > 0;
  const [resumeOpen, setResumeOpen] = useState(false);
  // Set while the resume item is handing off to its dialog, read once by
  // keepFocusForResume below. A ref, not state: it must be readable in the same
  // interaction, and it must not re-render the nav.
  const openingResumeRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const t = useTranslations("bookingMenu");
  const tb = useTranslations("booking");
  const tc = useTranslations("common");
  const tl = useTranslations("landing");
  const tr = useTranslations("reviews");
  // Forest on the solid header, white over the hero photo.
  const focusRing = scrolled
    ? "outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
    : "outline-none focus-visible:ring-2 focus-visible:ring-white";

  const openResume = () => {
    openingResumeRef.current = true;
    setResumeOpen(true);
  };
  // Radix hands focus back to the trigger as a menu closes. When the close is
  // the one opening the resume dialog, that focus return fights the dialog's
  // focus trap — survivable on desktop, it traps the field on iOS Safari.
  // Suppressing it here is what lets either menu close normally; their link
  // items still get the focus return they want.
  const keepFocusForResume = (e: Event) => {
    if (!openingResumeRef.current) return;
    openingResumeRef.current = false;
    e.preventDefault();
  };

  // Phones and tablets: the landing lists its sections; the booking page its tools.
  const menuItems: MenuItem[] = bookHref
    ? navItems
    : [
        { label: tl("viewDetails"), href: `/${slug}` },
        { label: t("checkInOut"), href: `/${slug}/check-in-out` },
        { label: t("changeBooking"), href: `/${slug}/change-booking` },
        ...(resumeEnabled ? [{ label: t("resumeBooking"), onSelect: openResume }] : []),
        // Reviews are read on the landing; writing one starts from the booking page's menu.
        { label: tr("writeReview"), href: `/${slug}/reviews` },
      ];
  const menuSecondaryItems: MenuItem[] = bookHref
    ? [
        { label: t("checkInOut"), href: `/${slug}/check-in-out` },
        { label: t("changeBooking"), href: `/${slug}/change-booking` },
      ]
    : [];

  return (
    <nav
      // Solid once scrolled (DESIGN.md: no glass, no shadow); the 1px border is there in both states so only its colour changes.
      className={`fixed top-0 left-0 right-0 z-50 border-b transition-colors duration-300 ${
        scrolled ? "border-line bg-white py-3" : "border-transparent bg-transparent py-6"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <Link href={`/${slug}`} className={`flex items-center gap-3 min-w-0 rounded-full py-2 -my-2 ${focusRing}`}>
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={homestayName}
              width={32}
              height={32}
              className="h-8 w-8 rounded-full object-cover shadow-sm shrink-0"
            />
          ) : (
            <div />
          )}
          <span
            className={`truncate font-serif text-lg transition-[opacity,translate,color] duration-300 ${
              scrolled ? "text-ink opacity-100 translate-y-0" : "text-white opacity-0 -translate-y-2 pointer-events-none"
            }`}
          >
            {homestayName}
          </span>
        </Link>
        {inlineNav && (
          <div className="hidden xl:flex items-center gap-7">
            {navItems.filter((item) => !item.menuOnly).map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`rounded-sm text-sm font-medium transition-colors ${focusRing} ${
                  scrolled ? "text-ink-2 hover:text-ink" : "text-white underline-offset-4 hover:underline"
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          {bookHref ? (
            !bookingDisabled && (
              <Link
                href={bookHref}
                // 44px: from md this is the only Book button on screen, and tablets are touch devices.
                // Over the hero it turns white so it reads on the photo; solid, it is the Pine primary.
                className={`hidden md:inline-flex h-11 items-center rounded-full px-5 text-[15px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                  scrolled ? "bg-pine text-white hover:bg-pine-hover focus-visible:ring-pine" : "bg-white text-pine-deep hover:bg-pine-mist focus-visible:ring-white focus-visible:ring-offset-transparent"
                }`}
              >
                {tb("bookHouse")}
              </Link>
            )
          ) : (
            <HeaderCart scrolled={scrolled} />
          )}
          <LanguageSwitcherIcon scrolled={scrolled} />
          <button
            type="button"
            // On the landing this menu holds the section links, not booking tools.
            aria-label={bookHref ? tc("menu") : t("aria")}
            onClick={() => setMenuOpen(true)}
            className={`${inlineNav ? "xl:hidden" : "lg:hidden"} inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors cursor-pointer ${focusRing} ${
              scrolled ? "text-ink hover:bg-mist" : "text-white hover:bg-white/10"
            }`}
          >
            <Menu size={20} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("aria")}
                className={`hidden ${inlineNav ? "xl:inline-flex" : "lg:inline-flex"} h-11 w-11 items-center justify-center rounded-full transition-colors cursor-pointer ${focusRing} ${
                  scrolled ? "text-ink hover:bg-mist" : "text-white hover:bg-white/10"
                }`}
              >
                <Menu size={20} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
              onCloseAutoFocus={keepFocusForResume}
            >
              <DropdownMenuItem asChild>
                <Link href={`/${slug}/check-in-out`} className="cursor-pointer">
                  <LogIn className="mr-2 h-4 w-4" />
                  {t("checkInOut")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/${slug}/change-booking`} className="cursor-pointer">
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  {t("changeBooking")}
                </Link>
              </DropdownMenuItem>
              {resumeEnabled && (
                <DropdownMenuItem
                  className="cursor-pointer"
                  // No preventDefault: that kept the menu open behind the
                  // dialog and left it open afterwards. Let Radix close it and
                  // neutralise the focus return in onCloseAutoFocus instead.
                  onSelect={openResume}
                >
                  <Receipt className="mr-2 h-4 w-4" />
                  {t("resumeBooking")}
                </DropdownMenuItem>
              )}
              {!bookHref && (
                <DropdownMenuItem asChild>
                  <Link href={`/${slug}/reviews`} className="cursor-pointer">
                    <PenLine className="mr-2 h-4 w-4" />
                    {tr("writeReview")}
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* Sibling of the menu on purpose: rendered inside DropdownMenuContent it
          would unmount the moment the menu closes. */}
      {resumeEnabled && (
        <ResumeBookingDialog open={resumeOpen} onOpenChange={setResumeOpen} homestayId={homestayId} />
      )}
      {/* Below lg (xl on the landing), where the inline section links and the dropdown are hidden. */}
      <FullScreenMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title={homestayName}
        items={menuItems}
        secondaryItems={menuSecondaryItems}
        onCloseAutoFocus={keepFocusForResume}
        // The open menu covers the landing's sticky Book bar, so it offers Book itself.
        action={bookHref && !bookingDisabled ? { label: tb("bookHouse"), href: bookHref } : undefined}
      />
    </nav>
  );
}
