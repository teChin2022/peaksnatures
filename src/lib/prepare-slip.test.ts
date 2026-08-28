import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  prepareSlip,
  SLIP_COMPRESS_THRESHOLD_BYTES,
  SLIP_MAX_DIMENSION,
  SLIP_QUALITY,
} from "@/lib/prepare-slip";

const h = vi.hoisted(() => ({ compressImage: vi.fn() }));
vi.mock("@/lib/compress-image", () => ({ compressImage: h.compressImage }));

const slip = (bytes: number, name = "slip.png", type = "image/png") =>
  new File([new Uint8Array(bytes)], name, { type });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.compressImage.mockResolvedValue(
    new File([new Uint8Array(200)], "slip.jpg", { type: "image/jpeg" }),
  );
});

describe("prepareSlip", () => {
  describe("what it leaves alone", () => {
    it.each([0, 1024, SLIP_COMPRESS_THRESHOLD_BYTES])(
      "sends a %i-byte slip untouched",
      async (bytes) => {
        const original = slip(bytes);
        await expect(prepareSlip(original)).resolves.toBe(original);
        expect(h.compressImage).not.toHaveBeenCalled();
      },
    );

    it("compresses as soon as the slip crosses the threshold", async () => {
      await prepareSlip(slip(SLIP_COMPRESS_THRESHOLD_BYTES + 1));
      expect(h.compressImage).toHaveBeenCalled();
    });
  });

  // EasySlip is a third party that has only ever been sent JPEG/PNG. A live
  // booking is the wrong place to discover whether it decodes WebP.
  it("encodes JPEG, not WebP, and keeps the slip legible", async () => {
    await prepareSlip(slip(3_000_000));
    expect(h.compressImage).toHaveBeenCalledWith(
      expect.any(File),
      { maxDimension: SLIP_MAX_DIMENSION, quality: SLIP_QUALITY, type: "image/jpeg" },
    );
  });

  it("returns the compressed file", async () => {
    const result = await prepareSlip(slip(3_000_000));
    expect(result.type).toBe("image/jpeg");
    expect(result.size).toBe(200);
  });

  // A compression failure must never cost someone a booking.
  describe("failing open", () => {
    it("sends the original when the encoder throws", async () => {
      h.compressImage.mockRejectedValue(new Error("no HEIC decoder"));
      const original = slip(3_000_000, "slip.heic", "image/heic");
      await expect(prepareSlip(original)).resolves.toBe(original);
    });

    it("says why in the log rather than failing silently", async () => {
      h.compressImage.mockRejectedValue(new Error("canvas refused"));
      await prepareSlip(slip(3_000_000));
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("compression failed"),
        expect.any(Error),
      );
    });
  });
});
