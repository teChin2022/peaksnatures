import Link from "next/link";
import { ArrowLeft, TreePine, Users, Search, Home } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PlatformFooter } from "@/components/platform-footer";
import type { Metadata } from "next";
import { SITE_NAME, buildAlternates } from "@/lib/seo";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "About",
  description: `Learn about ${SITE_NAME} — a platform for discovering and booking nature homestays in Thailand.`,
  alternates: buildAlternates("/about"),
  openGraph: {
    title: `About ${SITE_NAME}`,
    description: `Learn about ${SITE_NAME} — a platform for discovering and booking nature homestays in Thailand.`,
    url: "/about",
    type: "website",
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: `About ${SITE_NAME}`,
    description: `Learn about ${SITE_NAME} — a platform for discovering and booking nature homestays in Thailand.`,
  },
};

export default async function AboutPage() {
  const t = await getTranslations("aboutPage");
  const tc = await getTranslations("common");

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <span className="text-xl font-bold text-brand">{tc("brand")}</span>
          </Link>
          <nav className="flex items-center gap-1">
            <LanguageSwitcher />
            <Button variant="outline" size="icon" className="size-11" asChild>
              <Link href="/" aria-label={tc("back")} title={tc("back")}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50 to-white py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h1 className="text-balance text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 text-balance text-lg font-medium text-brand sm:text-xl">
            {t("tagline")}
          </p>
        </div>
      </section>

      {/* Content — measure capped at ~68ch so lines stay in the 65-75 character
          range that reads comfortably; wider than this and the eye loses the
          line it is returning to. */}
      <section className="flex-1 py-14 sm:py-16">
        <div className="mx-auto max-w-[68ch] space-y-14 px-4 sm:px-6">
          {/* Intro */}
          <div className="space-y-4 text-lg leading-relaxed text-gray-700">
            <p>{t("intro")}</p>
            <p>{t("belief")}</p>
            <p>{t("focus")}</p>
          </div>

          {/* Our Story */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t("storyTitle")}</h2>
            <div className="mt-4 space-y-4 leading-relaxed text-gray-600">
              <p>{t("storyP1")}</p>
              <p>{t("storyP2")}</p>
              <p>{t("storyP3")}</p>
              <ul className="ml-5 list-disc space-y-2 marker:text-brand">
                <li>{t("storyItem1")}</li>
                <li>{t("storyItem2")}</li>
              </ul>
              <p>{t("storyP4")}</p>
            </div>
          </div>

          {/* Mission */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t("missionTitle")}</h2>
            <div className="mt-4 space-y-4 leading-relaxed text-gray-600">
              <p>{t("mission")}</p>
              <p>{t("missionP2")}</p>
            </div>
          </div>

          {/* What Makes Different */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t("diffTitle")}</h2>
            <div className="mt-6 space-y-8">
              <div className="flex gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                  <TreePine className="h-5 w-5 text-brand" />
                </div>
                <div className="pt-1.5">
                  <h3 className="font-semibold text-gray-900">{t("diff1Title")}</h3>
                  <p className="mt-1.5 leading-relaxed text-gray-600">{t("diff1Desc")}</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                  <Home className="h-5 w-5 text-brand" />
                </div>
                <div className="pt-1.5">
                  <h3 className="font-semibold text-gray-900">{t("diff2Title")}</h3>
                  <p className="mt-1.5 leading-relaxed text-gray-600">{t("diff2Desc")}</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                  <Search className="h-5 w-5 text-brand" />
                </div>
                <div className="pt-1.5">
                  <h3 className="font-semibold text-gray-900">{t("diff3Title")}</h3>
                  <p className="mt-1.5 leading-relaxed text-gray-600">{t("diff3Desc")}</p>
                  <ul className="ml-5 mt-2 list-disc space-y-2 leading-relaxed text-gray-600 marker:text-brand">
                    <li>{t("diff3Item1")}</li>
                    <li>{t("diff3Item2")}</li>
                    <li>{t("diff3Item3")}</li>
                  </ul>
                  <p className="mt-3 leading-relaxed text-gray-600">{t("diff3P")}</p>
                </div>
              </div>
            </div>
          </div>

          {/* For Travelers */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t("travelersTitle")}</h2>
            <div className="mt-4 space-y-4 leading-relaxed text-gray-600">
              <p>{t("travelersIntro")}</p>
              <ul className="ml-5 list-disc space-y-2 marker:text-brand">
                <li>{t("travelersItem1")}</li>
                <li>{t("travelersItem2")}</li>
                <li>{t("travelersItem3")}</li>
                <li>{t("travelersItem4")}</li>
              </ul>
              <p>{t("travelersP")}</p>
            </div>
          </div>

          {/* For Hosts */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t("hostsTitle")}</h2>
            <div className="mt-4 space-y-4 leading-relaxed text-gray-600">
              <p>{t("hostsIntro")}</p>
              <ul className="ml-5 list-disc space-y-2 marker:text-brand">
                <li>{t("hostsItem1")}</li>
                <li>{t("hostsItem2")}</li>
                <li>{t("hostsItem3")}</li>
                <li>{t("hostsItem4")}</li>
              </ul>
              <p>{t("hostsP")}</p>
            </div>
          </div>

          {/* Join */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t("joinTitle")}</h2>
            <p className="mt-4 leading-relaxed text-gray-600">{t("joinP")}</p>
          </div>

          {/* CTA — colour/shadow transitions only, never transforms, so the
              cards give feedback without shifting layout under the cursor. */}
          <div className="grid gap-4 pt-2 sm:grid-cols-2">
            <Link
              href="/#homestays"
              className="rounded-xl border border-gray-200 p-6 text-center outline-none transition-colors duration-200 hover:border-brand hover:bg-brand-50/40 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <Users className="mx-auto h-8 w-8 text-brand" />
              <h3 className="mt-3 font-semibold text-gray-900">{t("exploreTitle")}</h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">{t("exploreDesc")}</p>
            </Link>
            <Link
              href="/register"
              className="rounded-xl border border-gray-200 p-6 text-center outline-none transition-colors duration-200 hover:border-brand hover:bg-brand-50/40 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <Home className="mx-auto h-8 w-8 text-brand" />
              <h3 className="mt-3 font-semibold text-gray-900">{t("becomeHostTitle")}</h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">{t("becomeHostDesc")}</p>
            </Link>
          </div>
        </div>
      </section>

      <PlatformFooter />
    </div>
  );
}
