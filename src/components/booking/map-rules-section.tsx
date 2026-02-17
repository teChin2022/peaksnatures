"use client";

import { Ban, ShieldAlert, MapPin } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useTranslations } from "next-intl";

interface MapRulesSectionProps {
  mapEmbedUrl: string | null;
  location: string;
  prohibitions: string[];
  themeColor?: string;
}

export function MapRulesSection({
  mapEmbedUrl,
  location,
  prohibitions,
  themeColor = "#16a34a",
}: MapRulesSectionProps) {
  const t = useTranslations("about");
  const tp = useTranslations("prohibitions");

  const hasMap = !!mapEmbedUrl;
  const hasRules = prohibitions && prohibitions.length > 0;

  if (!hasMap && !hasRules) return null;

  return (
    <section className="py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Map — Left */}
          {hasMap && (
            <div>
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ backgroundColor: themeColor + "15" }}
                >
                  <MapPin className="h-4.5 w-4.5" style={{ color: themeColor }} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    {t("location")}
                  </h2>
                  <p className="text-sm text-gray-500">{location}</p>
                </div>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
                <iframe
                  src={mapEmbedUrl!}
                  className="h-80 w-full lg:h-[400px]"
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Map"
                />
              </div>
            </div>
          )}

          {/* House Rules — Right */}
          {hasRules && (
            <div>
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ backgroundColor: themeColor + "15" }}
                >
                  <ShieldAlert className="h-4.5 w-4.5" style={{ color: themeColor }} />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {tp("title")}
                </h2>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {prohibitions.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition-colors hover:border-gray-300"
                  >
                    <Ban className="h-4 w-4 shrink-0 text-red-400" />
                    <span className="truncate">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <Separator className="mt-10" />
      </div>
    </section>
  );
}
