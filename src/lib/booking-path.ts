/**
 * The booking page of a homestay. A promo code from a shared link rides along,
 * so `/{slug}?promo=X` keeps its discount when it is sent on to `/book`.
 * A repeated `?promo=` param arrives as an array: the first value wins.
 */
export function bookingPath(slug: string, promo?: string | string[]): string {
  const code = (Array.isArray(promo) ? promo[0] : promo)?.trim();
  return code ? `/${slug}/book?promo=${encodeURIComponent(code)}` : `/${slug}/book`;
}
