"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, LogIn, ArrowRightLeft, Receipt } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LanguageSwitcherIcon } from "@/components/language-switcher-icon";
import { HeaderCart } from "@/components/booking/header-cart";
import { ResumeBookingDialog } from "@/components/booking/resume-booking-dialog";

interface BookingHeaderProps {
  homestayName: string;
  logoUrl?: string | null;
  slug: string;
  homestayId: string;
  /** False when the host has booking_draft_hours = 0, or bookings are blocked. */
  resumeEnabled?: boolean;
}

export function BookingHeader({ homestayName, logoUrl, slug, homestayId, resumeEnabled = false }: BookingHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  // Set while the resume item is handing off to its dialog, read once by
  // onCloseAutoFocus below. A ref, not state: it must be readable in the same
  // interaction, and it must not re-render the nav.
  const openingResumeRef = useRef(false);
  const t = useTranslations("bookingMenu");

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.15);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? "glass-nav py-3 shadow-sm" : "bg-transparent py-6"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
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
            className={`truncate text-sm font-semibold transition-all duration-500 ${
              scrolled ? "text-earth-900 opacity-100 translate-y-0" : "text-white opacity-0 -translate-y-2 pointer-events-none"
            }`}
          >
            {homestayName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <HeaderCart scrolled={scrolled} />
          <LanguageSwitcherIcon scrolled={scrolled} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("aria")}
                className={`p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer ${
                  scrolled ? "text-[#111111]" : "text-white"
                }`}
              >
                <Menu size={20} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
              // Radix hands focus back to the trigger as the menu closes. When
              // the close is the one opening the resume dialog, that focus
              // return fights the dialog's focus trap — survivable on desktop,
              // it traps the field on iOS Safari. Suppressing it here is what
              // lets the item close the menu normally; the two Link items above
              // still get the focus return they want.
              onCloseAutoFocus={(e) => {
                if (!openingResumeRef.current) return;
                openingResumeRef.current = false;
                e.preventDefault();
              }}
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
                  onSelect={() => {
                    openingResumeRef.current = true;
                    setResumeOpen(true);
                  }}
                >
                  <Receipt className="mr-2 h-4 w-4" />
                  {t("resumeBooking")}
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
    </nav>
  );
}
