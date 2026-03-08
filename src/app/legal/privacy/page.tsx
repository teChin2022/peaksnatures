import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Peaksnature",
  description: "Peaksnature privacy policy — how we handle your data.",
};

export default async function PrivacyPolicyPage() {
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
            <Shield className="h-5 w-5 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{t("policyTitle")}</h1>
        </div>
        <p className="mt-4 text-gray-600">{t("policyIntro")}</p>
        <ul className="mt-4 space-y-3">
          {[t("policy1"), t("policy2"), t("policy3"), t("policy4"), t("policy5"), t("policy6")].map((item, i) => (
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
