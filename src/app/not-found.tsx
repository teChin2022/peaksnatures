import type { Metadata } from "next";
import Link from "next/link";
import { Mountain, ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "The page you are looking for doesn't exist. Browse our nature homestays in Thailand instead.",
  robots: { index: false, follow: true },
  alternates: buildAlternates("/404"),
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-white px-4 text-center">
      <Mountain className="h-16 w-16 text-brand" />
      <h1 className="mt-6 text-4xl font-bold text-gray-900">404</h1>
      <p className="mt-2 text-lg text-gray-600">
        This page doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button asChild className="bg-brand hover:bg-brand-hover">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/#homestays">
            <Compass className="mr-2 h-4 w-4" />
            Browse homestays
          </Link>
        </Button>
      </div>
    </div>
  );
}
