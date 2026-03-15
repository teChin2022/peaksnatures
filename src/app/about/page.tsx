import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Mountain, TreePine, Users, Search, Home } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PlatformFooter } from "@/components/platform-footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — Peaksnature",
  description: "Learn about Peaksnature — a platform for discovering and booking nature homestays in Thailand.",
};

export default async function AboutPage() {
  const t = await getTranslations("aboutPage");
  const tc = await getTranslations("common");

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
            <Mountain className="h-7 w-7 text-brand" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">{t("title")}</h1>
          <p className="mt-2 text-lg font-medium text-brand">{t("tagline")}</p>
        </div>
      </section>

      {/* Content */}
      <section className="flex-1 py-12">
        <div className="mx-auto max-w-3xl space-y-12 px-4 sm:px-6">
          {/* Intro */}
          <div className="space-y-4 text-gray-600">
            <p>{t("intro")}</p>
            <p>{t("belief")}</p>
            <p>{t("focus")}</p>
          </div>

          {/* Our Story */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t("storyTitle")}</h2>
            <div className="mt-4 space-y-4 text-gray-600">
              <p>{t("storyP1")}</p>
              <p>{t("storyP2")}</p>
              <p>{t("storyP3")}</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>{t("storyItem1")}</li>
                <li>{t("storyItem2")}</li>
              </ul>
              <p>{t("storyP4")}</p>
            </div>
          </div>

          {/* Mission */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t("missionTitle")}</h2>
            <div className="mt-4 space-y-4 text-gray-600">
              <p>{t("mission")}</p>
              <p>{t("missionP2")}</p>
            </div>
          </div>

          {/* What Makes Different */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t("diffTitle")}</h2>
            <div className="mt-6 space-y-6">
              <div className="flex gap-4">
                <div className="shrink-0 rounded-lg bg-brand-50 p-2.5 h-fit">
                  <TreePine className="h-5 w-5 text-brand" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{t("diff1Title")}</h3>
                  <p className="mt-1 text-sm text-gray-600">{t("diff1Desc")}</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="shrink-0 rounded-lg bg-brand-50 p-2.5 h-fit">
                  <Home className="h-5 w-5 text-brand" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{t("diff2Title")}</h3>
                  <p className="mt-1 text-sm text-gray-600">{t("diff2Desc")}</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="shrink-0 rounded-lg bg-brand-50 p-2.5 h-fit">
                  <Search className="h-5 w-5 text-brand" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{t("diff3Title")}</h3>
                  <p className="mt-1 text-sm text-gray-600">{t("diff3Desc")}</p>
                  <ul className="ml-6 mt-2 list-disc space-y-1 text-sm text-gray-600">
                    <li>{t("diff3Item1")}</li>
                    <li>{t("diff3Item2")}</li>
                    <li>{t("diff3Item3")}</li>
                  </ul>
                  <p className="mt-2 text-sm text-gray-600">{t("diff3P")}</p>
                </div>
              </div>
            </div>
          </div>

          {/* For Travelers */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t("travelersTitle")}</h2>
            <div className="mt-4 space-y-4 text-gray-600">
              <p>{t("travelersIntro")}</p>
              <ul className="ml-6 list-disc space-y-1">
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
            <h2 className="text-2xl font-bold text-gray-900">{t("hostsTitle")}</h2>
            <div className="mt-4 space-y-4 text-gray-600">
              <p>{t("hostsIntro")}</p>
              <ul className="ml-6 list-disc space-y-1">
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
            <h2 className="text-2xl font-bold text-gray-900">{t("joinTitle")}</h2>
            <p className="mt-4 text-gray-600">{t("joinP")}</p>
          </div>

          {/* CTA */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/#homestays"
              className="rounded-xl border p-6 text-center transition-shadow hover:shadow-md"
            >
              <Users className="mx-auto h-8 w-8 text-brand" />
              <h3 className="mt-3 font-semibold text-gray-900">{t("exploreTitle")}</h3>
              <p className="mt-1 text-sm text-gray-500">{t("exploreDesc")}</p>
            </Link>
            <Link
              href="/register"
              className="rounded-xl border p-6 text-center transition-shadow hover:shadow-md"
            >
              <Home className="mx-auto h-8 w-8 text-brand" />
              <h3 className="mt-3 font-semibold text-gray-900">{t("becomeHostTitle")}</h3>
              <p className="mt-1 text-sm text-gray-500">{t("becomeHostDesc")}</p>
            </Link>
          </div>
        </div>
      </section>

      <PlatformFooter />
    </div>
  );
}
