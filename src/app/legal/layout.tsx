import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { PlatformFooter } from "@/components/platform-footer";

export default async function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tc = await getTranslations("common");

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-900">{tc("brand")}</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Button variant="outline" asChild className="px-10 py-4 rounded-full font-bold text-sm tracking-widest uppercase shadow-lg hover:shadow-xl">
              <Link href="/">
                <ArrowLeft className="mr-1 h-4 w-4" />
                {tc("back")}
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <PlatformFooter />
    </div>
  );
}
