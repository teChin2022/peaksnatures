import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ShieldCheck, CreditCard, Star, QrCode, Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PlatformFooter } from "@/components/platform-footer";
import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Trust & Safety — Peaksnature",
  description: "Learn about Peaksnature's commitment to platform safety and trustworthiness.",
};

export default async function TrustSafetyPage() {
  const t = await getTranslations("trustSafetyPage");
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
            <ShieldCheck className="h-7 w-7 text-brand" />
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

          <div className="mt-8 space-y-10">
            {/* Payment Verification */}
            <div className="flex gap-4">
              <div className="shrink-0 rounded-lg bg-brand-50 p-2.5 h-fit">
                <CreditCard className="h-5 w-5 text-brand" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t("paymentTitle")}</h2>
                <p className="mt-2 text-sm text-gray-600">{t("paymentIntro")}</p>
                <ul className="ml-6 mt-2 list-disc space-y-1 text-sm text-gray-600">
                  <li>{t("paymentItem1")}</li>
                  <li>{t("paymentItem2")}</li>
                  <li>{t("paymentItem3")}</li>
                </ul>
                <p className="mt-2 text-sm text-gray-500 italic">{t("paymentNote")}</p>
              </div>
            </div>

            {/* Reviews */}
            <div className="flex gap-4">
              <div className="shrink-0 rounded-lg bg-brand-50 p-2.5 h-fit">
                <Star className="h-5 w-5 text-brand" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t("reviewTitle")}</h2>
                <p className="mt-2 text-sm text-gray-600">{t("reviewIntro")}</p>
                <ul className="ml-6 mt-2 list-disc space-y-1 text-sm text-gray-600">
                  <li>{t("reviewItem1")}</li>
                  <li>{t("reviewItem2")}</li>
                </ul>
                <p className="mt-2 text-sm text-gray-500 italic">{t("reviewNote")}</p>
              </div>
            </div>

            {/* QR Code */}
            <div className="flex gap-4">
              <div className="shrink-0 rounded-lg bg-brand-50 p-2.5 h-fit">
                <QrCode className="h-5 w-5 text-brand" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t("qrTitle")}</h2>
                <p className="mt-2 text-sm text-gray-600">{t("qrIntro")}</p>
                <ul className="ml-6 mt-2 list-disc space-y-1 text-sm text-gray-600">
                  <li>{t("qrItem1")}</li>
                  <li>{t("qrItem2")}</li>
                </ul>
                <p className="mt-2 text-sm text-gray-500 italic">{t("qrNote")}</p>
              </div>
            </div>

            {/* Data Security */}
            <div className="flex gap-4">
              <div className="shrink-0 rounded-lg bg-brand-50 p-2.5 h-fit">
                <Lock className="h-5 w-5 text-brand" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t("securityTitle")}</h2>
                <p className="mt-2 text-sm text-gray-600">{t("securityIntro")}</p>
                <ul className="ml-6 mt-2 list-disc space-y-1 text-sm text-gray-600">
                  <li>{t("securityItem1")}</li>
                  <li>{t("securityItem2")}</li>
                  <li>{t("securityItem3")}</li>
                </ul>
                <p className="mt-2 text-sm text-gray-500 italic">{t("securityNote")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PlatformFooter />
    </div>
  );
}
