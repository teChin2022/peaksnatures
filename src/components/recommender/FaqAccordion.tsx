import { getTranslations } from "next-intl/server";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export async function FaqAccordion() {
  const t = await getTranslations("recommenderStats.faq");

  const items = [
    { id: "q1", q: t("q1"), a: t("a1") },
    { id: "q2", q: t("q2"), a: t("a2") },
    { id: "q3", q: t("q3"), a: t("a3") },
    { id: "q4", q: t("q4"), a: t("a4") },
    { id: "q5", q: t("q5"), a: t("a5") },
  ];

  return (
    <section aria-labelledby="faq-title" className="space-y-4">
      <h2
        id="faq-title"
        className="text-sm font-semibold uppercase tracking-[0.18em] text-earth-500"
      >
        {t("title")}
      </h2>
      <div className="rounded-2xl border border-earth-200 bg-white px-4 shadow-sm md:px-5">
        <Accordion type="single" collapsible>
          {items.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger className="text-sm md:text-base">
                {item.q}
              </AccordionTrigger>
              <AccordionContent>{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
