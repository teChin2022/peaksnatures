import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// Titled in the visitor's language (ui-audit S18): these were English on Thai pages.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return {
    title: t("resetPasswordTitle"),
    description: t("resetPasswordDesc"),
    robots: { index: false, follow: false },
  };
}

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
