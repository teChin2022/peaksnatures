"use client";

import Image from "next/image";
import { ShieldCheck, CalendarDays, BookOpen, Phone, BadgeCheck } from "lucide-react";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { getInitials } from "@/lib/utils";

interface HostLocationSectionProps {
  hostName: string;
  hostPhone: string | null;
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
  hostPhone,
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
            <div className="overflow-hidden pt-2 -mt-2">
              <motion.h2
                initial={{ y: "100%" }}
                whileInView={{ y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, ease: [0.33, 1, 0.68, 1] }}
                className="text-2xl md:text-3xl font-serif text-earth-900 tracking-tight"
              >
                {ta("location")}
              </motion.h2>
            </div>
            <p className="mt-2 text-sm text-earth-500">{location}</p>
          </motion.div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-10">
          {/* Location + Map — 70% (left) */}
          {mapEmbedUrl && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="md:col-span-7"
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
            className="md:col-span-3"
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
              <span
                className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  isVerified
                    ? "bg-brand/10 text-brand ring-1 ring-brand/20"
                    : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                }`}
              >
                <BadgeCheck className="h-3.5 w-3.5" />
                {isVerified ? t("verifiedHost") : t("unverifiedHost")}
              </span>
              {hostPhone && (
                <a
                  href={`tel:${hostPhone}`}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-earth-50 px-3 py-1.5 text-xs font-medium text-earth-700 transition-colors hover:bg-earth-100 hover:text-brand"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {hostPhone}
                </a>
              )}

              <div className="w-full h-px bg-earth-200 my-4" />

              {/* Stats */}
              <div className="grid w-full grid-cols-2 gap-3">
                <div className="flex flex-col items-center rounded-xl bg-earth-50/60 p-3">
                  <span className="mb-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <CalendarDays className="h-4 w-4" />
                  </span>
                  <span className="text-2xl font-bold text-earth-900 leading-none">{hostingCount}</span>
                  <p className="mt-1 text-[11px] text-earth-500 leading-tight text-center">
                    {isUnderOneYear
                      ? t("monthsHosting", { count: totalMonths })
                      : t("yearsHosting", { count: yearsHosting })}
                  </p>
                </div>

                <div className="flex flex-col items-center rounded-xl bg-earth-50/60 p-3">
                  <span className="mb-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <BookOpen className="h-4 w-4" />
                  </span>
                  <span className="text-2xl font-bold text-earth-900 leading-none">{totalBookings}</span>
                  <p className="mt-1 text-[11px] text-earth-500 leading-tight text-center">
                    {t("totalBookings", { count: totalBookings })}
                  </p>
                </div>
              </div>

              {/* Last Booking */}
              {lastBookingDate && (
                <>
                  <div className="w-full h-px bg-earth-200 my-4" />
                  <div className="flex items-center gap-2 text-earth-500">
                    <span className="relative inline-flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
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
