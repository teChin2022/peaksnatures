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
    <section id="faq" className="scroll-mt-20 pb-14 md:pb-20 lg:pb-28">
      <div className="mx-auto max-w-[820px] px-4 sm:px-6">
        <SectionMark />
        <SectionHeading>{t("title")}</SectionHeading>
        <Accordion type="single" collapsible className="mt-7 grid w-full gap-2.5">
          {visible.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="rounded-2xl border-0 bg-white px-5 md:px-6">
              <AccordionTrigger className="min-h-16 rounded-sm text-[17px] text-ink outline-none hover:text-ink-2 focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 [&>svg]:h-5 [&>svg]:w-5 [&>svg]:text-ink-2">
                {item.question}
              </AccordionTrigger>
              {/* forceMount keeps closed answers in the HTML for crawlers that don't run JS */}
              <AccordionContent forceMount className="pb-5 text-[15px] text-ink-2">{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
