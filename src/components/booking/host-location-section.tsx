"use client";

import Image from "next/image";
import { MapPin, ShieldCheck, CalendarDays, BookOpen, Clock } from "lucide-react";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { getInitials } from "@/lib/utils";

interface HostLocationSectionProps {
  hostName: string;
  hostAvatarUrl: string | null;
  isVerified: boolean;
  hostCreatedAt: string;
  totalBookings: number;
  lastBookingDate: string | null;
  location: string;
  mapEmbedUrl: string | null;
}

export function HostLocationSection({
  hostName,
  hostAvatarUrl,
  isVerified,
  hostCreatedAt,
  totalBookings,
  lastBookingDate,
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
    <section className="py-14 md:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Location heading */}
        {mapEmbedUrl && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-6"
          >
            <span className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400 block mb-2">{ta("location")}</span>
            <div className="overflow-hidden">
              <motion.h2
                initial={{ y: "100%" }}
                whileInView={{ y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, ease: [0.33, 1, 0.68, 1] }}
                className="text-2xl md:text-3xl font-serif text-earth-900 tracking-tight"
              >
                {location}
              </motion.h2>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-10">
          {/* Location + Map — 70% (left) */}
          {mapEmbedUrl && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="lg:col-span-7"
            >
              <div className="overflow-hidden rounded-2xl border bg-white shadow-sm h-full">
                <iframe
                  src={mapEmbedUrl}
                  className="h-80 w-full lg:h-full"
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  title={ta("mapTitle")}
                />
              </div>
            </motion.div>
          )}

          {/* Host Profile Card — 30% (right) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="lg:col-span-3"
          >
            <div className="w-full rounded-2xl border bg-white shadow-sm p-6 flex flex-col items-center justify-center h-full">
              {/* Avatar */}
              <div className="relative">
                <div className="h-24 w-24 overflow-hidden rounded-full bg-earth-100 ring-2 ring-earth-200">
                  {hostAvatarUrl ? (
                    <Image
                      src={hostAvatarUrl}
                      alt={hostName}
                      width={96}
                      height={96}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-earth-200 text-2xl font-bold text-earth-500">
                      {getInitials(hostName)}
                    </div>
                  )}
                </div>
                <div className={`absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full shadow-md ring-2 ring-white ${isVerified ? "bg-brand" : "bg-amber-500"}`}>
                  <ShieldCheck className="h-4 w-4 text-white" />
                </div>
              </div>

              {/* Name + Verified */}
              <h3 className="mt-4 text-lg font-bold text-earth-900 text-center leading-tight">
                {hostName}
              </h3>
              <span className={`mt-1 text-xs font-medium ${isVerified ? "text-brand" : "text-amber-600"}`}>
                {isVerified ? t("verifiedHost") : t("unverifiedHost")}
              </span>

              <div className="w-full h-px bg-earth-200 my-5" />

              {/* Stats */}
              <div className="flex items-center gap-8">
                <div className="flex flex-col items-center">
                  <CalendarDays className="h-4.5 w-4.5 text-earth-400 mb-1" />
                  <span className="text-2xl font-bold text-earth-900">{hostingCount}</span>
                  <p className="text-[11px] text-earth-500 leading-tight text-center">
                    {isUnderOneYear
                      ? t("monthsHosting", { count: totalMonths })
                      : t("yearsHosting", { count: yearsHosting })}
                  </p>
                </div>

                {/* <div className="h-12 w-px bg-earth-200" /> */}

                <div className="flex flex-col items-center">
                  <BookOpen className="h-4.5 w-4.5 text-earth-400 mb-1" />
                  <span className="text-2xl font-bold text-earth-900">{totalBookings}</span>
                  <p className="text-[11px] text-earth-500 leading-tight text-center">
                    {t("totalBookings", { count: totalBookings })}
                  </p>
                </div>
              </div>

              {/* Last Booking */}
              {lastBookingDate && (
                <>
                  <div className="w-full h-px bg-earth-200 my-4" />
                  <div className="flex items-center gap-2 text-earth-500">
                    <Clock className="h-3.5 w-3.5" />
                    <p className="text-[11px]">
                      {t("lastBooking")}{" "}
                      <span className="font-semibold text-earth-700">
                        {new Date(lastBookingDate).toLocaleDateString("th-TH", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </p>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>

      </div>
    </section>
  );
}
