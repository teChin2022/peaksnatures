import Link from "next/link";
import { Mountain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import Image from "next/image";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      {/* <Mountain className="h-12 w-12 text-gray-300" /> */}
      <Image src="/logo.png" alt="Peaksnature" width={32} height={32} className="h-8 w-8 rounded" />
      <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
      <p className="text-gray-500">
        {t("description")}
      </p>
      <Button asChild className="mt-2 bg-brand hover:bg-brand-hover">
        <Link href="/">{t("browseAll")}</Link>
      </Button>
    </div>
  );
}
