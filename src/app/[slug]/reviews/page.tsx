import { cache } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveSlugRedirect } from "@/lib/slug-redirect";
import { ReviewSubmission } from "@/components/reviews/review-submission";
import type { Homestay } from "@/types/database";

export const revalidate = 30;

interface PageProps {
  params: Promise<{ slug: string }>;
}

const getHomestayBasic = cache(async function getHomestayBasic(slug: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("homestays")
    .select("id, name, slug, hero_image_url")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  return data as unknown as Pick<Homestay, "id" | "name" | "slug" | "hero_image_url"> | null;
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const homestay = await getHomestayBasic(slug);

  if (!homestay) return { title: "Not Found — Peaksnature" };

  return {
    title: `Write a Review — ${homestay.name} | Peaksnature`,
    description: `Share your experience at ${homestay.name}. Rate your stay and help future guests.`,
    openGraph: {
      title: `Review ${homestay.name}`,
      images: homestay.hero_image_url ? [{ url: homestay.hero_image_url }] : [],
    },
  };
}

export default async function ReviewsPage({ params }: PageProps) {
  const { slug } = await params;
  const homestay = await getHomestayBasic(slug);

  if (!homestay) {
    const newSlug = await resolveSlugRedirect(slug);
    if (newSlug) permanentRedirect(`/${newSlug}/reviews`);
    notFound();
  }

  const tp = await getTranslations("reviewsPage");

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4 sm:px-6">
          <Link
            href={`/${homestay.slug}`}
            className="flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{tp("backToHomestay", { name: homestay.name })}</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {/* Title */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">{tp("title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{tp("subtitle", { name: homestay.name })}</p>
        </div>

        <ReviewSubmission
          homestayId={homestay.id}
          homestayName={homestay.name}
          homestaySlug={homestay.slug}
        />
      </main>
    </div>
  );
}
