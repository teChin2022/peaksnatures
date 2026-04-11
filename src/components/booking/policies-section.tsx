"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import { Shield } from "lucide-react";
import { useTranslations } from "next-intl";

import { HTMLContent } from "@/components/ui/html-content";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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
  const [modalOpen, setModalOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      setOverflows(el.scrollHeight > el.clientHeight);
    }
  }, [content]);

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
              <Shield className="h-4 w-4 text-earth-700" />
            </div>
            <h2 className="text-2xl md:text-3xl font-serif text-earth-900 tracking-tight">
              {t("title")}
            </h2>
          </div>
          <div className="relative mt-5 overflow-hidden">
            <div ref={contentRef} className="line-clamp-6 sm:line-clamp-10">
              <HTMLContent
                content={content as string}
                className="leading-relaxed text-earth-600"
              />
            </div>
            {overflows && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-earth-50 via-earth-50/80 to-transparent" />
            )}
          </div>
          {overflows && (
            <button
              type="button"
              className="mt-2 text-sm font-medium text-earth-900 underline underline-offset-4 hover:text-earth-600"
              onClick={() => setModalOpen(true)}
            >
              {t("readMore")}
            </button>
          )}
        </motion.div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription className="sr-only">{t("title")}</DialogDescription>
          </DialogHeader>
          <HTMLContent
            content={content as string}
            className="leading-relaxed text-earth-600"
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}
