"use client";

import { motion } from "motion/react";
import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { HTMLContent } from "@/components/ui/html-content";

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
    <section className="py-14 md:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-earth-100">
              <KeyRound className="h-4 w-4 text-earth-700" />
            </div>
            <h2 className="text-2xl md:text-3xl font-serif text-earth-900 tracking-tight">
              {t("title")}
            </h2>
          </div>
          <HTMLContent
            content={content as string}
            className="mt-5 leading-relaxed text-earth-600"
          />
        </motion.div>
      </div>
    </section>
  );
}
