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
    <div className="flex min-h-screen flex-col bg-earth-50 pb-[env(safe-area-inset-bottom)]">
      <Breadcrumbs
        items={[
          { label: SITE_NAME, href: "/" },
          { label: homestay.name, href: `/${homestay.slug}` },
          { label: "Reviews" },
        ]}
        visuallyHidden
      />

      <header className="sticky top-0 z-30 border-b border-earth-200 bg-earth-50/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <Link
            href={`/${homestay.slug}`}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-earth-600 transition-colors hover:bg-earth-100 hover:text-earth-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{tp("backToHomestay")}</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 py-10 md:py-14">
        <div className="mx-auto max-w-3xl space-y-10">
          <header className="text-center">
            <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
              {tp("pill")}
            </span>
            <h1 className="mt-4 font-serif text-4xl font-normal leading-tight text-earth-900 md:text-5xl">
              {tp("title")}
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-earth-500">
              {tp("subtitle", { name: homestay.name })}
            </p>
          </header>

          <ReviewSubmission
            homestayId={homestay.id}
            homestayName={homestay.name}
            homestaySlug={homestay.slug}
          />
        </div>
      </main>
    </div>
  );
}
