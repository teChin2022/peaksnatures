import Link from "next/link";
import { Scale, Shield, FileText, Cookie, AlertTriangle, Handshake, MessageSquare, ScrollText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Legal & Policies — Peaksnature",
  description: "Important policies and agreements governing the use of Peaksnature.",
};

const policies = [
  { href: "/legal/privacy", icon: Shield, key: "privacyPolicy" as const },
  { href: "/legal/terms", icon: FileText, key: "termsOfService" as const },
  { href: "/legal/cancellation", icon: ScrollText, key: "cancellationPolicy" as const },
  { href: "/legal/cookies", icon: Cookie, key: "cookiePolicy" as const },
  { href: "/legal/fraud-prevention", icon: AlertTriangle, key: "fraudPrevention" as const },
  { href: "/legal/dispute-resolution", icon: Handshake, key: "disputeResolution" as const },
  { href: "/legal/content-review", icon: MessageSquare, key: "contentReview" as const },
  { href: "/legal/host-agreement", icon: ScrollText, key: "hostAgreement" as const },
];

export default async function LegalPage() {
  const t = await getTranslations("legalPage");

  return (
    <section className="py-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <Scale className="h-7 w-7 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">{t("title")}</h1>
          <p className="mt-2 text-gray-600">{t("subtitle")}</p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {policies.map((p) => {
            const Icon = p.icon;
            return (
              <Link
                key={p.href}
                href={p.href}
                className="flex items-center gap-4 rounded-lg border p-4 transition-shadow hover:shadow-md"
              >
                <div className="shrink-0 rounded-lg bg-green-100 p-2.5">
                  <Icon className="h-5 w-5 text-green-600" />
                </div>
                <span className="font-medium text-gray-900">{t(p.key)}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
