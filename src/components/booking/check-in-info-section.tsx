"use client";

import { useTranslations } from "next-intl";

import { ExpandableText } from "@/components/booking/expandable-text";
import { SectionHeading, SectionMark } from "@/components/booking/section-mark";

interface CheckInInfoSectionProps {
  content: string | null;
}

function isEmptyRichText(value: string | null): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "<p></p>" || trimmed === "<p><br></p>";
}

export function CheckInInfoSection({ content }: CheckInInfoSectionProps) {
  const t = useTranslations("checkInInfo");

  if (isEmptyRichText(content)) return null;

  // A column of the page's check-in + policies pair (side by side from lg); the page gives the container.
  return (
    <section className="min-w-0 scroll-mt-20">
      <SectionMark />
      <SectionHeading>{t("title")}</SectionHeading>
      <div className="mt-7 rounded-[20px] bg-white px-6 py-6 md:px-10 md:py-8">
        <ExpandableText html={content as string} clampClassName="line-clamp-6 sm:line-clamp-10" fadeClassName="from-white via-white/80" />
      </div>
    </section>
  );
}
