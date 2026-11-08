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

  return (
    <section className="py-14 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:gap-12">
          <div className="md:col-span-4">
            <SectionMark />
            <SectionHeading>{t("title")}</SectionHeading>
          </div>
          <ExpandableText html={content as string} clampClassName="line-clamp-6 sm:line-clamp-10" className="md:col-span-8" />
        </div>
      </div>
    </section>
  );
}
