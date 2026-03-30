import Image from "next/image";
import { MapPin } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface BookingFooterProps {
  homestayName: string;
  logoUrl?: string | null;
  location: string;
  hostName: string;
}

export function BookingFooter({
  homestayName,
  logoUrl,
  location,
  hostName,
}: BookingFooterProps) {
  const t = useTranslations("bookingFooter");
  const tc = useTranslations("common");

  return (
    <footer className="bg-earth-900">
      <div className="h-0.5 w-full bg-gradient-to-r from-brand via-earth-600 to-transparent" />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
          {/* Left: Brand */}
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={homestayName}
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-cover ring-1 ring-earth-700 shadow-sm"
              />
            ) : (
              <div></div>
            )}
            <div>
              <span className="font-semibold text-earth-50">{homestayName}</span>
              <div className="flex items-center gap-1 text-xs text-earth-400">
                <MapPin className="h-3 w-3" />
                {location}
              </div>
            </div>
          </div>

          {/* Right: Legal & Copyright */}
          <div className="flex flex-col items-center gap-1.5 sm:items-end">
            <p className="text-xs text-earth-500">{`\u00A9 ${new Date().getFullYear()} ${tc("copyright")}`}</p>
            <div className="flex items-center gap-3">
              <a
                href="/legal#privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-earth-400 hover:text-white transition-colors"
              >
                {tc("privacy")}
              </a>
              <span className="text-xs text-earth-600">|</span>
              <a
                href="/legal#terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-earth-400 hover:text-white transition-colors"
              >
                {tc("terms")}
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
