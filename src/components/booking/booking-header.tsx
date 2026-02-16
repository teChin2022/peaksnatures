import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BookingSearchDialog } from "@/components/booking/booking-search-dialog";

interface BookingHeaderProps {
  homestayName: string;
  themeColor: string;
  logoUrl?: string | null;
  homestayId: string;
}

export function BookingHeader({ homestayName, themeColor, logoUrl, homestayId }: BookingHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
      <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${themeColor}, ${themeColor}66, transparent)` }} />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={homestayName}
              className="h-8 w-8 rounded-full object-cover border shadow-sm shrink-0"
            />
          ) : (
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm"
              style={{ backgroundColor: themeColor }}
            >
              {getInitials(homestayName)}
            </div>
          )}
          <span className="truncate text-sm font-semibold text-gray-900">
            {homestayName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <BookingSearchDialog homestayId={homestayId} themeColor={themeColor} />
          <Button
            size="sm"
            className="shrink-0 rounded-full text-white hover:brightness-90 shadow-sm"
            style={{ backgroundColor: themeColor }}
            asChild
          >
            <a href="#booking">
              <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
              Book Now
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
