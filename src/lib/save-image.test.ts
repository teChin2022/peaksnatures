// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveCanvasImage } from "@/lib/save-image";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
// A Mac and an iPad on iPadOS send this same desktop UA; only maxTouchPoints differs.
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

// The 8-byte PNG signature, so the shared file's bytes can be checked exactly.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const DATA_URL = "data:image/png;base64," + btoa(String.fromCharCode(...PNG_SIGNATURE));
const canvas = { toDataURL: () => DATA_URL } as unknown as HTMLCanvasElement;

let share: ReturnType<typeof vi.fn<(data: ShareData) => Promise<void>>>;
let downloads: Array<{ download: string; href: string }>;

/** Stub the browser: its UA, touch points, file-share support and how the share sheet ends. */
function useDevice(
  userAgent: string,
  { maxTouchPoints = 0, canShareFiles = true, shareError }: { maxTouchPoints?: number; canShareFiles?: boolean; shareError?: Error } = {},
) {
  share = vi.fn(() => (shareError ? Promise.reject(shareError) : Promise.resolve()));
  vi.stubGlobal("navigator", {
    userAgent,
    maxTouchPoints,
    // iOS 14 has navigator.share but no canShare, and cannot share files.
    canShare: canShareFiles ? () => true : undefined,
    share,
  });
  downloads = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ download: this.download, href: this.href });
  });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saveCanvasImage", () => {
  it("opens the share sheet on iPhone with the PNG as a file, and does not download", async () => {
    useDevice(IPHONE, { maxTouchPoints: 5 });
    saveCanvasImage(canvas, "promptpay-990.png");
    await flush();

    expect(share).toHaveBeenCalledTimes(1);
    const file = share.mock.calls[0][0].files![0];
    expect(file.name).toBe("promptpay-990.png");
    expect(file.type).toBe("image/png");
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual(PNG_SIGNATURE);
    expect(downloads).toEqual([]);
  });

  it("treats an iPad, which reports itself as a Mac, as iOS", () => {
    useDevice(MAC, { maxTouchPoints: 5 });
    saveCanvasImage(canvas, "promptpay.png");
    expect(share).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Android", ANDROID, 5],
    ["a Mac", MAC, 0],
  ])("downloads on %s", (_name, userAgent, maxTouchPoints) => {
    useDevice(userAgent, { maxTouchPoints });
    saveCanvasImage(canvas, "promptpay-990.png");

    expect(share).not.toHaveBeenCalled();
    expect(downloads).toEqual([{ download: "promptpay-990.png", href: DATA_URL }]);
  });

  it("downloads on an iPhone that cannot share files", () => {
    useDevice(IPHONE, { maxTouchPoints: 5, canShareFiles: false });
    saveCanvasImage(canvas, "promptpay-990.png");

    expect(share).not.toHaveBeenCalled();
    expect(downloads).toEqual([{ download: "promptpay-990.png", href: DATA_URL }]);
  });

  it("falls back to a download when the share sheet fails", async () => {
    useDevice(IPHONE, { maxTouchPoints: 5, shareError: new DOMException("denied", "NotAllowedError") });
    saveCanvasImage(canvas, "promptpay-990.png");
    await flush();

    expect(downloads).toEqual([{ download: "promptpay-990.png", href: DATA_URL }]);
  });

  it("does not download when the user closes the share sheet", async () => {
    useDevice(IPHONE, { maxTouchPoints: 5, shareError: new DOMException("cancelled", "AbortError") });
    saveCanvasImage(canvas, "promptpay-990.png");
    await flush();

    expect(downloads).toEqual([]);
  });
});
