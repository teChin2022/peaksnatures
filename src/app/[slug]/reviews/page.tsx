import { cache } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveSlugRedirect } from "@/lib/slug-redirect";
import { ReviewSubmission } from "@/components/reviews/review-submission";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import type { Homestay } from "@/types/database";
import { SITE_NAME, buildAlternates } from "@/lib/seo";

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

  if (!homestay) return { title: "Not Found", robots: { index: false, follow: false } };

  const title = `Write a Review — ${homestay.name} | ${SITE_NAME}`;
  const description = `Share your experience at ${homestay.name}. Rate your stay and help future guests.`;
  const image = homestay.hero_image_url;

  return {
    title: { absolute: title },
    description,
    alternates: buildAlternates(`/${slug}/reviews`),
    openGraph: {
      title: `Review ${homestay.name}`,
      description,
      url: `/${slug}/reviews`,
      type: "website",
      siteName: SITE_NAME,
      images: image ? [{ url: image, alt: homestay.name }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `Review ${homestay.name}`,
      description,
      images: image ? [image] : undefined,
    },
    robots: { index: true, follow: true },
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
        <Breadcrumbs
          items={[
            { label: SITE_NAME, href: "/" },
            { label: homestay.name, href: `/${homestay.slug}` },
            { label: "Reviews" },
          ]}
          className="mb-6 text-sm text-gray-500"
        />
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
