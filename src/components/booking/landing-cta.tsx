import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * The landing's closing band, over the homestay's own hero photo (solid Pine
 * Deep without one): one button on to the booking page, or, while the host
 * can't take bookings, the notice the booking page shows.
 */
export async function LandingCta({
  bookHref,
  bookingDisabled = false,
  imageUrl = null,
}: {
  bookHref: string;
  bookingDisabled?: boolean;
  imageUrl?: string | null;
}) {
  const t = await getTranslations("finalCta");
  const tb = await getTranslations("booking");
  const tt = await getTranslations("bookingTutorial");

  return (
    <section className="relative overflow-hidden bg-pine-deep text-center text-white">
      {imageUrl && (
        <>
          {/* Eases to rest as the band scrolls in (RevealScope). */}
          <div data-reveal-kind="settle" className="absolute inset-0">
            <Image src={imageUrl} alt="" fill sizes="100vw" className="object-cover" />
          </div>
          {/* Flat, as on the hero: white text keeps its contrast over the brightest part of the photo. */}
          <div className="absolute inset-0 bg-black/60" />
        </>
      )}
      <div className="relative mx-auto max-w-3xl px-6 py-24 lg:py-36">
        <h2 className="font-serif text-4xl leading-tight text-balance md:text-5xl lg:text-6xl">
          {bookingDisabled ? tb("unavailableTitle") : t("title")}
        </h2>
        {/* How booking works, as /book's tutorial puts it: the reassurance a guest wants before the click. */}
        <p className="mx-auto mt-4 max-w-[40ch] text-lg leading-relaxed text-balance text-white/95">
          {bookingDisabled ? tb("unavailableDesc") : tt("intro")}
        </p>
        {!bookingDisabled && (
          <Link
            href={bookHref}
            className="mt-8 inline-flex min-h-14 items-center gap-2 rounded-full bg-white px-9 text-[17px] font-medium text-pine-deep transition-colors hover:bg-pine-mist outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-pine-deep"
          >
            {/* The header and the sticky bar say the same. */}
            {tb("bookHouse")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </section>
  );
}

/**
 * The landing's sticky Book bar on phones: the "from" price on the left, the
 * Book button on the right. A plain link: dates and the cart live on /book.
 * The page renders it right after the header, so screen readers meet it
 * early, and puts its spacer (`h-[calc(5rem+env(safe-area-inset-bottom))]`)
 * after the footer.
 */
export async function LandingBookBar({
  bookHref,
  fromPrice,
  bookingDisabled = false,
}: {
  bookHref: string;
  fromPrice: number | null;
  bookingDisabled?: boolean;
}) {
  const tb = await getTranslations("booking");
  const tc = await getTranslations("common");
  const tr = await getTranslations("rooms");

  const button = "inline-flex min-h-[52px] shrink-0 items-center justify-center rounded-full bg-pine px-7 text-base font-medium text-white";

  return (
    <div
      data-bottom-bar
      className="fixed inset-x-0 bottom-0 z-40 rounded-t-[20px] border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        {bookingDisabled ? (
          // Dimmed, not a link, as the booking page's bar is while bookings are off.
          <div className={`${button} w-full opacity-40`}>{tb("unavailableTitle")}</div>
        ) : (
          <>
            {fromPrice !== null && (
              <p className="min-w-0">
                <span className="block text-[13px] text-ink-2">{tr("ratePrice")}</span>
                <span className="font-serif text-2xl leading-tight text-ink lining-nums">฿{fromPrice.toLocaleString()}</span>
                <span className="ml-1 text-sm text-ink-2">{tc("perNight")}</span>
              </p>
            )}
            <Link
              href={bookHref}
              className={`${button} ${fromPrice === null ? "w-full" : ""} transition-colors hover:bg-pine-hover outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2`}
            >
              {tb("bookHouse")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
