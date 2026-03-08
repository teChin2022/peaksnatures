import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Peaksnature",
  description: "Peaksnature terms and conditions of use.",
};

export default async function TermsPage() {
  const t = await getTranslations("home");

  return (
    <section className="py-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/legal">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Legal & Policies
            </Link>
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-green-100 p-2.5">
            <FileText className="h-5 w-5 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{t("termsTitle")}</h1>
        </div>
        <p className="mt-4 text-gray-600">{t("termsIntro")}</p>
        <ul className="mt-4 space-y-3">
          {[t("terms1"), t("terms2"), t("terms3"), t("terms4"), t("terms5"), t("terms6"), t("terms7")].map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">{i + 1}</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
