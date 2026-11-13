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
