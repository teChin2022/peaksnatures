"use client";

import Link from "next/link";

/**
 * The body of every error boundary (DESIGN.md: earth surface, serif heading,
 * a Forest pill). It shows a generic message only, never the error itself.
 * Strings come from the caller: `global-error` renders outside the intl
 * provider, and admin is English-only.
 */
export function ErrorView({
  title,
  description,
  retryLabel,
  onRetry,
  backHref,
  backLabel,
}: {
  title: string;
  description: string;
  retryLabel: string;
  onRetry: () => void;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div role="alert" className="flex min-h-[70vh] flex-col items-center justify-center bg-earth-50 px-4 py-16 text-center">
      <h1 className="font-serif text-3xl leading-tight text-earth-900">{title}</h1>
      <p className="mt-3 max-w-md text-base leading-relaxed text-earth-700">{description}</p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:w-auto sm:flex-row">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-12 items-center justify-center rounded-full bg-brand px-8 text-sm font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          {retryLabel}
        </button>
        <Link
          href={backHref}
          className="inline-flex h-12 items-center justify-center rounded-full border border-earth-200 bg-white px-8 text-sm font-semibold text-earth-800 transition-colors hover:bg-earth-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
