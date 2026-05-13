import { RecommenderClient } from "./RecommenderClient";
import { HowItWorks } from "@/components/recommender/HowItWorks";
import { FaqAccordion } from "@/components/recommender/FaqAccordion";
import { getTranslations } from "next-intl/server";

export default async function RecommenderStatsPage() {
  const t = await getTranslations("recommenderStats");

  return (
    <div className="px-4 py-10 md:py-14">
      <div className="mx-auto max-w-3xl space-y-10">
        <header className="text-center">
          <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
            {t("programPill")}
          </span>
          <h1 className="mt-4 font-serif text-4xl font-normal leading-tight text-earth-900 md:text-5xl">
            {t("title")}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-earth-500">
            {t("subtitle")}
          </p>
        </header>

        <RecommenderClient
          emptyState={
            <div className="space-y-10">
              <HowItWorks />
              <FaqAccordion />
            </div>
          }
        />
      </div>
    </div>
  );
}
