import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, BookOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PlatformFooter } from "@/components/platform-footer";
import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Host Guidelines — Peaksnature",
  description: "Guidelines for hosts on Peaksnature to provide quality service.",
};

export default async function HostGuidelinesPage() {
  const t = await getTranslations("hostGuidelinesPage");
  const tc = await getTranslations("common");

  const guidelines = [
    { titleKey: "g1Title" as const, introKey: "g1Intro" as const, items: ["g1Item1", "g1Item2", "g1Item3", "g1Item4"] as const, extra: "g1Photo" as const, noteKey: "g1Note" as const },
    { titleKey: "g2Title" as const, introKey: "g2Intro" as const, items: ["g2Item1", "g2Item2", "g2Item3"] as const, noteKey: "g2Note" as const },
    { titleKey: "g3Title" as const, introKey: "g3Intro" as const, items: ["g3Item1", "g3Item2"] as const, noteKey: "g3Note" as const },
    { titleKey: "g4Title" as const, introKey: "g4Intro" as const, items: ["g4Item1", "g4Item2", "g4Item3"] as const, noteKey: "g4Note" as const },
    { titleKey: "g5Title" as const, introKey: "g5Intro" as const, items: ["g5Item1", "g5Item2", "g5Item3"] as const, noteKey: "g5Note" as const },
    { titleKey: "g6Title" as const, introKey: "g6Intro" as const, items: ["g6Item1", "g6Item2", "g6Item3"] as const, noteKey: "g6Note" as const },
    { titleKey: "g7Title" as const, introKey: "g7Intro" as const, items: ["g7Item1", "g7Item2"] as const, noteKey: "g7Note" as const },
    { titleKey: "g8Title" as const, introKey: "g8Intro" as const, items: ["g8Item1", "g8Item2"] as const, noteKey: "g8Note" as const },
    { titleKey: "g9Title" as const, introKey: "g9Intro" as const, items: ["g9Item1", "g9Item2", "g9Item3"] as const, noteKey: "g9Note" as const },
    { titleKey: "g10Title" as const, introKey: "g10Intro" as const, items: ["g10Item1", "g10Item2"] as const, noteKey: "g10Note" as const },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Peaksnature" width={32} height={32} className="h-8 w-8 rounded" />
            <span className="text-xl font-bold text-brand">{tc("brand")}</span>
          </Link>
          <nav className="flex items-center gap-4">
            <LanguageSwitcher />
            <Button variant="outline" size="sm" asChild>
              <Link href="/">
                <ArrowLeft className="mr-1 h-4 w-4" />
                {tc("back")}
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50 to-white py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
            <BookOpen className="h-7 w-7 text-brand" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">{t("title")}</h1>
          <p className="mt-2 text-gray-600">{t("subtitle")}</p>
        </div>
      </section>

      {/* Content */}
      <section className="flex-1 py-12">
        <div className="mx-auto max-w-3xl space-y-4 px-4 sm:px-6">
          <p className="text-gray-600">{t("intro")}</p>
          <p className="text-gray-600">{t("introP2")}</p>

          <div className="mt-8 space-y-8">
            {guidelines.map((g, i) => (
              <div key={i} className="rounded-lg border p-6">
                <h2 className="text-lg font-semibold text-gray-900">{t(g.titleKey)}</h2>
                <p className="mt-2 text-sm text-gray-600">{t(g.introKey)}</p>
                <ul className="ml-6 mt-2 list-disc space-y-1 text-sm text-gray-600">
                  {g.items.map((itemKey) => (
                    <li key={itemKey}>{t(itemKey)}</li>
                  ))}
                </ul>
                {"extra" in g && g.extra && (
                  <p className="mt-2 text-sm text-gray-600">{t(g.extra)}</p>
                )}
                <p className="mt-2 text-sm text-gray-500 italic">{t(g.noteKey)}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-10 rounded-lg bg-brand-50 p-6 text-center">
            <h2 className="text-xl font-bold text-gray-900">{t("ctaTitle")}</h2>
            <p className="mt-2 text-sm text-gray-600">{t("ctaDesc")}</p>
            <Button className="mt-4 bg-brand hover:bg-brand-hover" asChild>
              <Link href="/register">{t("ctaTitle")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <PlatformFooter />
    </div>
  );
}
