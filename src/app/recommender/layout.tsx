import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function RecommenderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tc = await getTranslations("common");
  const t = await getTranslations("recommenderStats");

  return (
    <div className="flex min-h-screen flex-col bg-earth-50 pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-30 border-b border-earth-200 bg-earth-50/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-semibold text-earth-900 transition-colors hover:text-brand"
          >
            <span className="font-serif">{tc("brand")}</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-earth-600 transition-colors hover:bg-earth-100 hover:text-earth-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{t("backToSite")}</span>
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
