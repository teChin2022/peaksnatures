import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

/**
 * The landing's closing dark band: one button on to the booking page, or, while
 * the host can't take bookings, the notice the booking page shows.
 */
export async function LandingCta({ bookHref, bookingDisabled = false }: { bookHref: string; bookingDisabled?: boolean }) {
  const t = await getTranslations("finalCta");
  const tb = await getTranslations("booking");
  const tt = await getTranslations("bookingTutorial");

  return (
    <section className="bg-earth-900 py-24 text-center md:py-32">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="font-serif text-3xl leading-snug text-earth-50 md:text-5xl">
          {bookingDisabled ? tb("unavailableTitle") : t("title")}
        </h2>
        {/* How booking works, as /book's tutorial puts it: the reassurance a guest wants before the click. */}
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-balance text-earth-200">
          {bookingDisabled ? tb("unavailableDesc") : tt("intro")}
        </p>
        {!bookingDisabled && (
          <Link
            href={bookHref}
            className="mt-10 inline-flex h-12 items-center gap-2 rounded-full bg-brand px-8 text-base font-semibold text-white transition-colors hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
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
 * The landing's sticky Book bar on mobile, styled like the booking page's own
 * bar. A plain link: dates and the cart live on /book. The page renders it
 * right after the header, so screen readers meet it early, and puts its
 * spacer (`h-[calc(5rem+env(safe-area-inset-bottom))]`) after the footer.
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
  // Spaced capitals for Latin only: letter-spacing breaks Thai vowel and tone marks.
  const latin = (await getLocale()) === "en";

  const pill = "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl bg-brand px-4 py-2 text-white";
  const label = <span className={`text-sm font-bold ${latin ? "uppercase tracking-widest" : ""}`}>{tb("bookHouse")}</span>;
  const subLine = "text-xs font-medium leading-tight text-white/85";

  return (
    <div data-bottom-bar className="fixed inset-x-0 bottom-0 z-40 border-t border-earth-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="px-3 py-2.5">
        {bookingDisabled ? (
          // Dimmed, not a link, as the booking page's bar is while bookings are off.
          <div className={`${pill} opacity-40`}>
            {label}
            <span className={subLine}>{tb("unavailableTitle")}</span>
          </div>
        ) : (
          <Link href={bookHref} className={`${pill} outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2`}>
            {label}
            {fromPrice !== null && (
              <span className={subLine}>
                {tc("from")} ฿{fromPrice.toLocaleString()}
                {tc("perNight")}
              </span>
            )}
          </Link>
        )}
      </div>
    </div>
  );
}
