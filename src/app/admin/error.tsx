"use client";

import { ErrorView } from "@/components/error-view";

// Admin is English-only (no next-intl).
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorView
      title="This page couldn't load"
      description="Something went wrong. Try again, or go back to the admin home."
      retryLabel="Try again"
      onRetry={reset}
      backHref="/admin"
      backLabel="Back to admin"
    />
  );
}
