"use client";

import { motion } from "motion/react";
import { HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqSectionProps {
  items: FaqItem[];
}

export function FaqSection({ items }: FaqSectionProps) {
  const t = useTranslations("faq");

  const visible = (items || []).filter(
    (item) => item.question.trim().length > 0 || item.answer.trim().length > 0
  );

  if (visible.length === 0) return null;

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
              <HelpCircle className="h-4 w-4 text-earth-700" />
            </div>
            <h2 className="text-2xl md:text-3xl font-serif text-earth-900 tracking-tight">
              {t("title")}
            </h2>
          </div>
          <Accordion type="single" collapsible className="mt-5 w-full border-t border-earth-200">
            {visible.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent>{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
