/**
 * Column spans for a bento photo grid. The pattern repeats tile by tile, and
 * the last tile stretches over whatever its row has left, so no row ends
 * ragged. A pattern must fill whole rows (its spans sum to a multiple of
 * `columns`).
 */
export function bentoSpans(count: number, columns: number, pattern: readonly number[]): number[] {
  const spans = Array.from({ length: count }, (_, i) => pattern[i % pattern.length]);
  const used = spans.reduce((sum, span) => sum + span, 0) % columns;
  if (used > 0) spans[spans.length - 1] += columns - used;
  return spans;
}

/**
 * The landing gallery's photos: the host's gallery woven with each house's
 * first photo, so both kinds fill the first tiles, then the houses' other
 * photos. A photo used in both places appears once.
 */
export function galleryPhotos(gallery: readonly string[], roomImages: readonly (readonly string[])[]): string[] {
  const covers = roomImages.map((images) => images[0]).filter(Boolean);
  const woven = Array.from({ length: Math.max(gallery.length, covers.length) }, (_, i) => [gallery[i], covers[i]]).flat();
  const rest = roomImages.flatMap((images) => images.slice(1));
  return [...new Set([...woven, ...rest].filter(Boolean))];
}
