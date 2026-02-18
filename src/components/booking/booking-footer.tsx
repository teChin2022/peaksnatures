import Image from "next/image";
import { MapPin } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface BookingFooterProps {
  homestayName: string;
  themeColor: string;
  logoUrl?: string | null;
  location: string;
  hostName: string;
}

export function BookingFooter({
  homestayName,
  themeColor,
  logoUrl,
  location,
  hostName,
}: BookingFooterProps) {
  const t = useTranslations("bookingFooter");
  const tc = useTranslations("common");

  return (
    <footer className="border-t bg-gray-50/80">
      <div
        className="h-0.5 w-full"
        style={{
          background: `linear-gradient(90deg, ${themeColor}, ${themeColor}66, transparent)`,
        }}
      />
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
                className="h-8 w-8 rounded-full object-cover border shadow-sm"
              />
            ) : (
              <div></div>
              // <div
              //   className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm"
              //   style={{ backgroundColor: themeColor }}
              // >
              //   {getInitials(homestayName)}
              // </div>
            )}
            <div>
              <span className="font-semibold text-gray-900">{homestayName}</span>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <MapPin className="h-3 w-3" />
                {location}
              </div>
            </div>
          </div>

          {/* Right: Powered by */}
          <div className="flex flex-col items-center gap-1 sm:items-end">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Image src="/logo.png" alt="PeaksNature" width={16} height={16} className="h-4 w-4 rounded" />
              {t("poweredBy")} <span className="font-medium text-green-700">{tc("brand")}</span>
            </div>
            <p className="text-xs text-gray-400">{`Copyright \u00A9 ${new Date().getFullYear()} All rights reserved.`}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
