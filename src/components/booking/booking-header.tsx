"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, LogIn, ArrowRightLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BookingHeaderProps {
  homestayName: string;
  logoUrl?: string | null;
  slug: string;
}

export function BookingHeader({ homestayName, logoUrl, slug }: BookingHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
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
            <DropdownMenuContent align="end" className="w-56">
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}
