import { Mountain, MapPin } from "lucide-react";
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
              <img
                src={logoUrl}
                alt={homestayName}
                className="h-8 w-8 rounded-full object-cover border shadow-sm"
              />
            ) : (
              <Mountain className="h-5 w-5" style={{ color: themeColor }} />
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
              <Mountain className="h-3.5 w-3.5 text-green-600" />
              {t("poweredBy")} <span className="font-medium text-green-700">{tc("brand")}</span>
            </div>
            <p className="text-xs text-gray-400">{tc("copyright")}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
