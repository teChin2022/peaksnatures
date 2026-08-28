// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DemandModule = typeof import("@/lib/demand-track");

/** Module-level queue, timer and dedupe state, so each case needs a fresh copy. */
async function loadTracker(): Promise<DemandModule> {
  vi.resetModules();
  return import("@/lib/demand-track");
}

const event = (over: Record<string, unknown> = {}) => ({
  homestayId: "homestay-1",
  eventType: "page_view" as const,
  ...over,
});

let sendBeacon: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

/** The batch handed to the last sendBeacon call. */
const beaconBody = async (): Promise<unknown> =>
  JSON.parse(await (sendBeacon.mock.calls.at(-1)![1] as Blob).text());

beforeEach(() => {
  vi.useFakeTimers();
  sendBeacon = vi.fn(() => true);
  fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true, writable: true });
  Object.defineProperty(navigator, "webdriver", { value: false, configurable: true, writable: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
  document.cookie = "cookie_consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  sessionStorage.clear();
});

afterEach(() => {
  // Each loadTracker() binds fresh unload listeners to the same document and
  // window, and they outlive the module that registered them. Drain them here
  // so a queue left behind by one case cannot flush during the next one.
  window.dispatchEvent(new Event("pagehide"));
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("getDemandSessionId", () => {
  it("mints an id and remembers it in sessionStorage", async () => {
    const { getDemandSessionId } = await loadTracker();

    const id = getDemandSessionId();
    expect(id).toBeTruthy();
    expect(sessionStorage.getItem("pn_did")).toBe(id);
    expect(getDemandSessionId()).toBe(id);
  });

  it("reuses an id already stored for the tab", async () => {
    sessionStorage.setItem("pn_did", "existing-id");
    const { getDemandSessionId } = await loadTracker();
    expect(getDemandSessionId()).toBe("existing-id");
  });

  it("falls back to an in-memory id when storage is unavailable", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("private mode");
    });
    const { getDemandSessionId } = await loadTracker();

    const id = getDemandSessionId();
    expect(id).toBeTruthy();
    expect(getDemandSessionId()).toBe(id);
    getItem.mockRestore();
  });

  it("still mints an id when randomUUID is unavailable", async () => {
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      throw new Error("insecure context");
    });
    const { getDemandSessionId } = await loadTracker();
    expect(getDemandSessionId()).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });
});

describe("trackDemand", () => {
  it("sends the queued event after the debounce, as a beacon", async () => {
    const { trackDemand } = await loadTracker();

    trackDemand(event({ checkIn: "2026-06-01", checkOut: "2026-06-03", nights: 2, step: "dates", locale: "th" }));
    expect(sendBeacon).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe("/api/demand");
    await expect(beaconBody()).resolves.toEqual([
      expect.objectContaining({
        homestay_id: "homestay-1",
        event_type: "page_view",
        check_in: "2026-06-01",
        check_out: "2026-06-03",
        nights: 2,
        step: "dates",
        locale: "th",
        device: "desktop",
        data: {},
        session_id: expect.any(String),
      }),
    ]);
  });

  it("defaults every optional field to null rather than omitting it", async () => {
    const { trackDemand } = await loadTracker();
    trackDemand(event());
    vi.advanceTimersByTime(1000);

    await expect(beaconBody()).resolves.toEqual([
      expect.objectContaining({ check_in: null, check_out: null, nights: null, step: null, locale: null }),
    ]);
  });

  it("batches events queued inside the debounce window into one request", async () => {
    const { trackDemand } = await loadTracker();

    trackDemand(event());
    vi.advanceTimersByTime(500);
    trackDemand(event({ eventType: "calendar_view" }));
    vi.advanceTimersByTime(1000);

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(await beaconBody()).toHaveLength(2);
  });

  it("flushes immediately once the batch limit is reached", async () => {
    const { trackDemand } = await loadTracker();

    for (let i = 0; i < 20; i++) trackDemand(event());

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(await beaconBody()).toHaveLength(20);
  });

  it("reports the device as mobile on a narrow viewport", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    const { trackDemand } = await loadTracker();

    trackDemand(event());
    vi.advanceTimersByTime(1000);

    await expect(beaconBody()).resolves.toEqual([expect.objectContaining({ device: "mobile" })]);
  });

  it("assumes mobile when the viewport cannot be measured", async () => {
    window.matchMedia = vi.fn(() => {
      throw new Error("unsupported");
    }) as unknown as typeof window.matchMedia;
    const { trackDemand } = await loadTracker();

    trackDemand(event());
    vi.advanceTimersByTime(1000);

    await expect(beaconBody()).resolves.toEqual([expect.objectContaining({ device: "mobile" })]);
  });

  describe("who is not tracked", () => {
    it("skips a guest who declined cookies", async () => {
      document.cookie = "cookie_consent=declined; path=/";
      const { trackDemand } = await loadTracker();

      trackDemand(event());
      vi.advanceTimersByTime(1000);

      expect(sendBeacon).not.toHaveBeenCalled();
    });

    it("still tracks when consent was accepted or never answered", async () => {
      document.cookie = "cookie_consent=accepted; path=/";
      const { trackDemand } = await loadTracker();

      trackDemand(event());
      vi.advanceTimersByTime(1000);

      expect(sendBeacon).toHaveBeenCalled();
    });

    it("skips headless crawlers so they cannot inflate the funnel", async () => {
      Object.defineProperty(navigator, "webdriver", { value: true, configurable: true });
      const { trackDemand } = await loadTracker();

      trackDemand(event());
      vi.advanceTimersByTime(1000);

      expect(sendBeacon).not.toHaveBeenCalled();
    });
  });

  describe("delivery", () => {
    it("falls back to fetch when the beacon is refused", async () => {
      sendBeacon.mockReturnValue(false);
      const { trackDemand } = await loadTracker();

      trackDemand(event());
      vi.advanceTimersByTime(1000);

      expect(fetchMock).toHaveBeenCalledWith("/api/demand", expect.objectContaining({ keepalive: true }));
    });

    it("falls back to fetch when the beacon throws", async () => {
      sendBeacon.mockImplementation(() => {
        throw new Error("blocked");
      });
      const { trackDemand } = await loadTracker();

      trackDemand(event());
      vi.advanceTimersByTime(1000);

      expect(fetchMock).toHaveBeenCalled();
    });

    it("uses fetch when the browser has no beacon API", async () => {
      Object.defineProperty(navigator, "sendBeacon", { value: undefined, configurable: true });
      const { trackDemand } = await loadTracker();

      trackDemand(event());
      vi.advanceTimersByTime(1000);

      expect(fetchMock).toHaveBeenCalled();
    });

    it("stays silent when fetch itself throws", async () => {
      sendBeacon.mockReturnValue(false);
      vi.stubGlobal("fetch", () => {
        throw new Error("no network");
      });
      const { trackDemand } = await loadTracker();

      trackDemand(event());
      expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    });

    it("flushes what is queued when the tab is hidden", async () => {
      const { trackDemand } = await loadTracker();
      trackDemand(event());

      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(sendBeacon).toHaveBeenCalledTimes(1);
    });

    it("keeps queuing while the tab is merely re-shown", async () => {
      const { trackDemand } = await loadTracker();
      trackDemand(event());

      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(sendBeacon).not.toHaveBeenCalled();
    });

    it("flushes when the page is being unloaded", async () => {
      const { trackDemand } = await loadTracker();
      trackDemand(event());

      window.dispatchEvent(new Event("pagehide"));

      expect(sendBeacon).toHaveBeenCalledTimes(1);
    });

    it("sends nothing when the queue is already empty", async () => {
      await loadTracker();
      window.dispatchEvent(new Event("pagehide"));
      expect(sendBeacon).not.toHaveBeenCalled();
    });
  });
});

describe("trackDemandOnce", () => {
  it("queues the first call and ignores the rest", async () => {
    const { trackDemandOnce } = await loadTracker();

    trackDemandOnce("page_view", event());
    trackDemandOnce("page_view", event());
    trackDemandOnce("page_view", event());
    vi.advanceTimersByTime(1000);

    expect(await beaconBody()).toHaveLength(1);
  });

  it("tracks each key independently", async () => {
    const { trackDemandOnce } = await loadTracker();

    trackDemandOnce("page_view", event());
    trackDemandOnce("calendar_view", event({ eventType: "calendar_view" }));
    vi.advanceTimersByTime(1000);

    expect(await beaconBody()).toHaveLength(2);
  });
});
