// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compressImage } from "@/lib/compress-image";

const imageFile = (name = "photo.jpg", type = "image/jpeg", bytes = 4096) =>
  new File([new Uint8Array(bytes)], name, { type });

let close: ReturnType<typeof vi.fn>;
let drawImage: ReturnType<typeof vi.fn>;
let convertToBlob: ReturnType<typeof vi.fn>;
let offscreenSizes: Array<{ width: number; height: number }>;

/** Stub createImageBitmap to report a source image of the given size. */
function sourceImage(width: number, height: number) {
  vi.stubGlobal("createImageBitmap", vi.fn(() => Promise.resolve({ width, height, close })));
}

/** Install an OffscreenCanvas whose 2d context and encoder are observable. */
function useOffscreenCanvas(context: unknown = { drawImage }) {
  offscreenSizes = [];
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(width: number, height: number) {
        offscreenSizes.push({ width, height });
      }
      getContext() {
        return context;
      }
      convertToBlob = convertToBlob;
    },
  );
}

/** Remove OffscreenCanvas so the document-canvas fallback runs instead. */
function useDocumentCanvas(context: unknown = { drawImage }, blob: Blob | null = new Blob(["webp"])) {
  vi.stubGlobal("OffscreenCanvas", undefined);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb: BlobCallback) => cb(blob));
}

beforeEach(() => {
  close = vi.fn();
  drawImage = vi.fn();
  convertToBlob = vi.fn(() => Promise.resolve(new Blob(["webp"], { type: "image/webp" })));
  sourceImage(800, 600);
  useOffscreenCanvas();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("compressImage", () => {
  it("returns a WebP file named after the original", async () => {
    const result = await compressImage(imageFile("holiday.jpg"));

    expect(result.name).toBe("holiday.webp");
    expect(result.type).toBe("image/webp");
  });

  it("renames a file that has no extension", async () => {
    expect((await compressImage(imageFile("holiday", "image/jpeg"))).name).toBe("holiday.webp");
  });

  it("encodes JPEG when asked, for consumers that cannot take WebP", async () => {
    convertToBlob = vi.fn(() => Promise.resolve(new Blob(["jpeg"], { type: "image/jpeg" })));
    useOffscreenCanvas();
    const result = await compressImage(imageFile("slip.png", "image/png"), { type: "image/jpeg" });

    expect(convertToBlob).toHaveBeenCalledWith(expect.objectContaining({ type: "image/jpeg" }));
    expect(result.name).toBe("slip.jpg");
    expect(result.type).toBe("image/jpeg");
  });

  // Re-encoding an already-small image can grow it; sending the bigger one
  // would defeat the point of compressing at all.
  it("keeps the original when re-encoding would not shrink it", async () => {
    const original = imageFile("tiny.jpg", "image/jpeg", 8);
    convertToBlob = vi.fn(() => Promise.resolve(new Blob([new Uint8Array(64)], { type: "image/webp" })));
    useOffscreenCanvas();

    await expect(compressImage(original)).resolves.toBe(original);
  });

  it("leaves a non-image file untouched", async () => {
    const pdf = new File(["x"], "invoice.pdf", { type: "application/pdf" });
    await expect(compressImage(pdf)).resolves.toBe(pdf);
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  });

  it("keeps an image that already fits inside the limit", async () => {
    sourceImage(800, 600);
    await compressImage(imageFile());
    expect(offscreenSizes[0]).toEqual({ width: 800, height: 600 });
  });

  it("scales a landscape image down by its width", async () => {
    sourceImage(4000, 3000);
    await compressImage(imageFile());
    expect(offscreenSizes[0]).toEqual({ width: 1920, height: 1440 });
  });

  it("scales a portrait image down by its height", async () => {
    sourceImage(3000, 4000);
    await compressImage(imageFile());
    expect(offscreenSizes[0]).toEqual({ width: 1440, height: 1920 });
  });

  it("scales a square image down on both sides", async () => {
    sourceImage(4000, 4000);
    await compressImage(imageFile());
    expect(offscreenSizes[0]).toEqual({ width: 1920, height: 1920 });
  });

  it("honours a custom maximum dimension and quality", async () => {
    sourceImage(4000, 2000);
    await compressImage(imageFile(), { maxDimension: 600, quality: 0.5 });

    expect(offscreenSizes[0]).toEqual({ width: 600, height: 300 });
    expect(convertToBlob).toHaveBeenCalledWith({ type: "image/webp", quality: 0.5 });
  });

  it("defaults to 1920px at quality 0.8", async () => {
    await compressImage(imageFile());
    expect(convertToBlob).toHaveBeenCalledWith({ type: "image/webp", quality: 0.8 });
  });

  it("releases the decoded bitmap", async () => {
    await compressImage(imageFile());
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("gives up and returns the original when no drawing context is available", async () => {
    useOffscreenCanvas(null);
    const file = imageFile();
    await expect(compressImage(file)).resolves.toBe(file);
  });

  describe("without OffscreenCanvas", () => {
    it("falls back to a document canvas", async () => {
      useDocumentCanvas();
      sourceImage(4000, 3000);

      const result = await compressImage(imageFile("holiday.png", "image/png"));

      expect(result.name).toBe("holiday.webp");
      expect(result.type).toBe("image/webp");
      expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1920, 1440);
    });

    it("gives up and returns the original when no drawing context is available", async () => {
      useDocumentCanvas(null);
      const file = imageFile();
      await expect(compressImage(file)).resolves.toBe(file);
    });

    it("still produces a file when the canvas yields no blob", async () => {
      useDocumentCanvas({ drawImage }, null);
      await expect(compressImage(imageFile())).resolves.toMatchObject({ type: "image/webp" });
    });
  });
});
