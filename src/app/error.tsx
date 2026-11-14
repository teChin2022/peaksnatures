"use client";

import { useTranslations } from "next-intl";
import { ErrorView } from "@/components/error-view";

export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPage");
  return (
    <ErrorView
      title={t("title")}
      description={t("description")}
      retryLabel={t("retry")}
      onRetry={reset}
      backHref="/"
      backLabel={t("home")}
    />
  );
}
