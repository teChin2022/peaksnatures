import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";

export default async function TermsPage() {
  const t = await getTranslations("home");
  const tc = await getTranslations("common");

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Peaksnature" width={32} height={32} className="h-8 w-8 rounded" />
            <span className="text-xl font-bold text-green-800">
              {tc("brand")}
            </span>
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

      {/* Content */}
      <section className="flex-1 py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
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

      {/* Footer */}
      <footer className="border-t bg-gray-50 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 text-center text-sm text-gray-500 sm:flex-row sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="Peaksnature" width={20} height={20} className="h-5 w-5 rounded" />
            <span>{`Copyright \u00A9 ${new Date().getFullYear()} All rights reserved.`}</span>
          </div>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-green-700">
              {tc("privacy")}
            </Link>
            <Link href="/terms" className="font-medium text-green-700">
              {tc("terms")}
            </Link>
            <Link href="/#contact" className="hover:text-green-700">
              {tc("contact")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
