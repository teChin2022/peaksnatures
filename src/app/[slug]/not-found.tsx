import Link from "next/link";
import { Mountain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <Mountain className="h-12 w-12 text-gray-300" />
      <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
      <p className="text-gray-500">
        {t("description")}
      </p>
      <Button asChild className="mt-2 bg-green-600 hover:bg-green-700">
        <Link href="/">{t("browseAll")}</Link>
      </Button>
    </div>
  );
}
