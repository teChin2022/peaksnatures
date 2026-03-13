"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { BookingSearchDialog } from "@/components/booking/booking-search-dialog";

interface BookingHeaderProps {
  homestayName: string;
  logoUrl?: string | null;
  homestayId: string;
  promptpayId?: string;
  hostName?: string;
  cancellationDays?: number;
}

export function BookingHeader({ homestayName, logoUrl, homestayId, promptpayId, hostName, cancellationDays }: BookingHeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? "glass-nav py-3 shadow-sm" : "bg-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className={`flex items-center gap-1.5 text-sm transition-colors shrink-0 ${
              scrolled ? "text-gray-400 hover:text-gray-700" : "text-white/70 hover:text-white"
            }`}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
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
            className={`truncate text-sm font-semibold transition-colors ${
              scrolled ? "text-gray-900" : "text-white"
            }`}
          >
            {homestayName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <BookingSearchDialog homestayId={homestayId} promptpayId={promptpayId} hostName={hostName} cancellationDays={cancellationDays} />
        </div>
      </div>
    </nav>
  );
}
