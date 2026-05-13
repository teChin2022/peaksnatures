import { getTranslations } from "next-intl/server";
import { Share2, Calendar, Wallet } from "lucide-react";

export async function HowItWorks() {
  const t = await getTranslations("recommenderStats.howItWorks");

  const steps = [
    { n: 1, icon: Share2, title: t("step1Title"), body: t("step1Body") },
    { n: 2, icon: Calendar, title: t("step2Title"), body: t("step2Body") },
    { n: 3, icon: Wallet, title: t("step3Title"), body: t("step3Body") },
  ];

  return (
    <section aria-labelledby="how-it-works-title" className="space-y-4">
      <h2
        id="how-it-works-title"
        className="text-sm font-semibold uppercase tracking-[0.18em] text-earth-500"
      >
        {t("title")}
      </h2>
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map(({ n, icon: Icon, title, body }) => (
          <li
            key={n}
            className="relative rounded-2xl bg-earth-100/70 p-5"
          >
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-semibold text-brand">
                {n}
              </span>
              <Icon className="h-5 w-5 text-earth-500" aria-hidden="true" />
            </div>
            <h3 className="font-serif text-lg text-earth-900">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-earth-600">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
