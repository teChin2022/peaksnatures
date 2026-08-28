/**
 * Client-side image compression using native Canvas API.
 * Resizes to max dimension and converts to WebP.
 * No external dependencies required.
 */

interface CompressOptions {
  /** Maximum width or height in pixels (default: 1920) */
  maxDimension?: number;
  /** Encoder quality 0-1 (default: 0.8) */
  quality?: number;
  /**
   * Output MIME type (default: "image/webp"). Callers whose consumer is a
   * third party rather than our own storage should pick "image/jpeg" — see
   * the payment-slip path in booking-section.tsx.
   */
  type?: "image/webp" | "image/jpeg";
}

/**
 * Compress an image file on the client before uploading.
 * Returns a new File in the requested format with the given max dimension.
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<File> {
  const { maxDimension = 1920, quality = 0.8, type = "image/webp" } = options;

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
    blob = await canvas.convertToBlob({ type, quality });
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
        type,
        quality
      );
    });
  }

  bitmap.close();

  // Re-encoding is not guaranteed to shrink an already-optimised image, and
  // shipping a bigger file would defeat the point.
  if (blob.size >= file.size) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "");
  const ext = type === "image/jpeg" ? "jpg" : "webp";
  return new File([blob], `${baseName}.${ext}`, { type });
}
