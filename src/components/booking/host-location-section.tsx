"use client";

import Image from "next/image";
import { MapPin, ShieldCheck, CalendarDays, BookOpen } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { getInitials } from "@/lib/utils";

interface HostLocationSectionProps {
  hostName: string;
  hostAvatarUrl: string | null;
  isVerified: boolean;
  hostCreatedAt: string;
  totalBookings: number;
  location: string;
  mapEmbedUrl: string | null;
}

export function HostLocationSection({
  hostName,
  hostAvatarUrl,
  isVerified,
  hostCreatedAt,
  totalBookings,
  location,
  mapEmbedUrl,
}: HostLocationSectionProps) {
  const t = useTranslations("hostCard");
  const ta = useTranslations("about");

  const diffMs = Date.now() - new Date(hostCreatedAt).getTime();
  const totalMonths = Math.max(0, Math.floor(diffMs / (30.44 * 24 * 60 * 60 * 1000)));
  const yearsHosting = Math.floor(totalMonths / 12);
  const isUnderOneYear = yearsHosting < 1;
  const hostingCount = isUnderOneYear ? totalMonths : yearsHosting;

  return (
    <section className="py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-10">
          {/* Host Profile Card — 30% */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-3 flex items-stretch"
          >
            <div className="w-full rounded-2xl border bg-white shadow-sm flex p-5 lg:p-0 items-center gap-4">
              {/* Left: Avatar + Name — 60% */}
              <div className="flex flex-col items-center basis-[60%] shrink-0">
                <div className="relative">
                  <div className="h-20 w-20 overflow-hidden rounded-full bg-gray-100 ring-2 ring-gray-200">
                    {hostAvatarUrl ? (
                      <Image
                        src={hostAvatarUrl}
                        alt={hostName}
                        width={80}
                        height={80}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gray-200 text-xl font-bold text-gray-500">
                        {getInitials(hostName)}
                      </div>
                    )}
                  </div>
                  {isVerified && (
                    <div className="absolute bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 shadow-md ring-2 ring-white">
                      <ShieldCheck className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </div>
                <h3 className="mt-7 text-md font-bold text-gray-900 text-center leading-tight">
                  {hostName}
                </h3>
                {isVerified && (
                  <span className="mt-0.5 text-[11px] text-gray-500">
                    {t("verifiedHost")}
                  </span>
                )}
              </div>

              <div className="h-20 w-px bg-gray-200 shrink-0" />

              {/* Right: Stats vertical */}
              <div className="flex flex-col justify-center gap-3 min-w-0">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-gray-400 shrink-0" />
                  <div>
                    <span className="text-2xl font-bold text-gray-900">{hostingCount}</span>
                    <p className="text-[11px] text-gray-500 leading-tight">
                      {isUnderOneYear
                        ? t("monthsHosting", { count: totalMonths })
                        : t("yearsHosting", { count: yearsHosting })}
                    </p>
                  </div>
                </div>
                <div className="h-px w-full bg-gray-100" />
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-gray-400 shrink-0" />
                  <div>
                    <span className="text-2xl font-bold text-gray-900">{totalBookings}</span>
                    <p className="text-[11px] text-gray-500 leading-tight">
                      {t("totalBookings", { count: totalBookings })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Location + Map — 70% */}
          {mapEmbedUrl && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="lg:col-span-7"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                  <MapPin className="h-4 w-4 text-gray-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {ta("location")}
                  </h2>
                  <p className="text-sm text-gray-500">{location}</p>
                </div>
              </div>
              <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                <iframe
                  src={mapEmbedUrl}
                  className="h-52 w-full lg:h-[230px]"
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  title={ta("mapTitle")}
                />
              </div>
            </motion.div>
          )}
        </div>

        <Separator className="mt-10" />
      </div>
    </section>
  );
}
