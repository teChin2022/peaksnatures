"use client";

import { useTranslations } from "next-intl";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SectionHeading, SectionMark } from "@/components/booking/section-mark";

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqSectionProps {
  items: FaqItem[];
}

export function FaqSection({ items }: FaqSectionProps) {
  const t = useTranslations("faq");

  // Both halves, the rule the page's nav link and FAQPage JSON-LD count by.
  const visible = (items || []).filter((item) => item.question?.trim() && item.answer?.trim());

  if (visible.length === 0) return null;

  return (
    <section id="faq" className="scroll-mt-20 py-14 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:gap-12">
          <div className="md:col-span-4">
            <SectionMark />
            <SectionHeading>{t("title")}</SectionHeading>
          </div>
          <Accordion type="single" collapsible className="w-full border-t border-earth-200 md:col-span-8">
            {visible.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">{item.question}</AccordionTrigger>
                {/* forceMount keeps closed answers in the HTML for crawlers that don't run JS */}
                <AccordionContent forceMount>{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
