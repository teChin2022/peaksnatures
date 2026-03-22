/**
 * Client-side image compression using native Canvas API.
 * Resizes to max dimension and converts to WebP.
 * No external dependencies required.
 */

interface CompressOptions {
  /** Maximum width or height in pixels (default: 1920) */
  maxDimension?: number;
  /** WebP quality 0-1 (default: 0.8) */
  quality?: number;
}

/**
 * Compress an image file on the client before uploading.
 * Returns a new File in WebP format with the given max dimension.
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<File> {
  const { maxDimension = 1920, quality = 0.8 } = options;

  // Skip non-image files
  if (!file.type.startsWith("image/")) return file;

  // Load the image into an HTMLImageElement
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // Calculate new dimensions preserving aspect ratio
  let newWidth = width;
  let newHeight = height;

  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      newWidth = maxDimension;
      newHeight = Math.round((height / width) * maxDimension);
    } else {
      newHeight = maxDimension;
      newWidth = Math.round((width / height) * maxDimension);
    }
  }

  // Use OffscreenCanvas if available, otherwise fall back to regular Canvas
  let blob: Blob;

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
    blob = await canvas.convertToBlob({ type: "image/webp", quality });
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = newWidth;
    canvas.height = newHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
    blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(
        (b) => resolve(b || new Blob()),
        "image/webp",
        quality
      );
    });
  }

  bitmap.close();

  // Build a new filename with .webp extension
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.webp`, { type: "image/webp" });
}
