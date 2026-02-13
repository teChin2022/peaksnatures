import Link from "next/link";
import { Mountain, ArrowLeft } from "lucide-react";

interface BookingHeaderProps {
  homestayName: string;
  themeColor: string;
}

export function BookingHeader({ homestayName, themeColor }: BookingHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <Mountain className="h-5 w-5" style={{ color: themeColor }} />
        </Link>
        <span className="truncate text-sm font-medium text-gray-900">
          {homestayName}
        </span>
      </div>
    </header>
  );
}
