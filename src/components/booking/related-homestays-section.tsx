import { getTranslations } from "next-intl/server";
import { HomestayCard } from "@/components/landing/homestay-card";

export type RelatedHomestay = {
  slug: string;
  name: string;
  location: string;
  heroImageUrl: string | null;
  gallery: string[];
  tagline: string | null;
  minPrice: number | null;
  reviewCount: number;
  averageRating: number;
  isHostVerified: boolean;
};

interface RelatedHomestaysSectionProps {
  items: RelatedHomestay[];
}

export async function RelatedHomestaysSection({ items }: RelatedHomestaysSectionProps) {
  if (!items.length) return null;
  const t = await getTranslations("relatedHomestays");

  return (
    <section className="py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8 md:mb-10">
          <h2 className="text-2xl font-serif font-semibold text-earth-900 md:text-3xl">
            {t("title")}
          </h2>
          <p className="mt-2 text-sm text-earth-500 md:text-base">{t("subtitle")}</p>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <HomestayCard
              key={item.slug}
              slug={item.slug}
              name={item.name}
              location={item.location}
              heroImageUrl={item.heroImageUrl}
              gallery={item.gallery}
              minPrice={item.minPrice}
              maxGuests={0}
              tagline={item.tagline}
              reviewCount={item.reviewCount}
              averageRating={item.averageRating}
              isHostVerified={item.isHostVerified}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
