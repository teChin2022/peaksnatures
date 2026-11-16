"use client";

import { useTranslations } from "next-intl";
import { StaffCard } from "@/components/dashboard/staff-card";

/** Owner-only: the middleware sends staff logins away, and /api/host/staff refuses them. */
export default function TeamPage() {
  const t = useTranslations("hostStaff");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold text-earth-900">{t("title")}</h1>
      <p className="mt-2 mb-6 text-sm text-earth-700">{t("description")}</p>
      <StaffCard />
    </div>
  );
}
