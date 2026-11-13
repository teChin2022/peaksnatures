import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import { useTranslations } from "next-intl";

interface HeroSectionProps {
  name: string;
  tagline: string | null;
  heroImageUrl: string | null;
  location?: string;
  isVerified?: boolean;
  averageRating?: number;
  reviewCount?: number;
  /** Host's guest-cancellation window; 0 means guests cannot cancel. */
  cancellationDays?: number;
  /** The homestay's landing page, linked as "view property details". */
  detailsHref?: string;
  /** The host takes quick bookings only: they confirm by hand, so no "instant confirmation". */
  quickOnly?: boolean;
}

/** Separates two hero facts on one line (also /[slug]); hidden on phones, where the facts wrap and a line would end on it. */
export function HeroDot() {
  return (
    <span aria-hidden="true" className="hidden sm:inline text-white/50">
      ·
    </span>
  );
}

/** Photo header of /[slug]/book: still, so nothing moves while the guest picks dates. */
export function HeroSection({
  name,
  tagline,
  heroImageUrl,
  location,
  isVerified,
  averageRating = 0,
  reviewCount = 0,
  cancellationDays = 0,
  detailsHref,
  quickOnly = false,
}: HeroSectionProps) {
  const t = useTranslations("hero");
  const tb = useTranslations("booking");
  const tl = useTranslations("landing");
  const hasRating = averageRating > 0;

  return (
    <section className="relative h-[42svh] min-h-[320px] w-full overflow-hidden bg-earth-900 md:h-[50vh] md:min-h-[400px]">
      {heroImageUrl && (
        <Image src={heroImageUrl} alt={name} fill sizes="100vw" priority quality={85} className="object-cover object-center" />
      )}
      {/* Darkest under the text, which sits at the bottom, so white stays readable over bright cloud. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 via-55% to-black/10" />

      {/* md:pb-16 clears the date search that overlaps the hero's bottom edge on desktop. */}
      <div className="absolute inset-x-0 bottom-0 pb-5 md:pb-16">
        {/* The calendar's and houses' column, so the left edges line up. */}
        <div className="mx-auto max-w-4xl px-6 text-white text-shadow-lg text-shadow-black/40">
          <h1 className="font-serif text-3xl leading-tight text-balance sm:text-4xl md:text-5xl">{name}</h1>
          {tagline && <p className="mt-1.5 font-serif text-base text-white/90 sm:text-lg">{tagline}</p>}

          <div className="mt-3 space-y-1 text-sm text-white/90">
            {location && <p>{location}</p>}
            {(hasRating || isVerified) && (
              <p className="flex flex-wrap items-center gap-x-3 sm:gap-x-2">
                {hasRating && (
                  <span className="inline-flex items-center gap-1.5">
                    <Star size={14} className="fill-amber-300 text-amber-300" />
                    {averageRating.toFixed(1)}
                    {reviewCount > 0 && <span className="text-white/80">({reviewCount})</span>}
                  </span>
                )}
                {hasRating && isVerified && <HeroDot />}
                {isVerified && <span>{t("verifiedHost")}</span>}
              </p>
            )}
            <p className="flex flex-wrap items-center gap-x-3 sm:gap-x-2">
              <span>{t(quickOnly ? "hostConfirms" : "instantConfirm")}</span>
              {cancellationDays > 0 && (
                <>
                  <HeroDot />
                  <span>{tb("cancellationPolicyNote", { days: cancellationDays })}</span>
                </>
              )}
            </p>
          </div>

          {detailsHref && (
            // py-3 makes a 44px target; -mb-3 keeps the visual gap to the hero's edge.
            <Link
              href={detailsHref}
              className="-mb-3 mt-1 inline-flex items-center gap-1 rounded-sm py-3 text-sm font-medium text-white underline decoration-white/50 underline-offset-4 outline-none hover:decoration-white focus-visible:ring-2 focus-visible:ring-white"
            >
              {tl("viewDetails")}
              <ArrowRight size={14} />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
