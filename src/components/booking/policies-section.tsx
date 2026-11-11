"use client";

import { useTranslations } from "next-intl";

import { ExpandableText } from "@/components/booking/expandable-text";
import { SectionHeading, SectionMark } from "@/components/booking/section-mark";

interface PoliciesSectionProps {
  content: string | null;
}

function isEmptyRichText(value: string | null): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "<p></p>" || trimmed === "<p><br></p>";
}

export function PoliciesSection({ content }: PoliciesSectionProps) {
  const t = useTranslations("policies");

  if (isEmptyRichText(content)) return null;

  return (
    <section id="policies" className="scroll-mt-20 py-14 md:py-28">
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
