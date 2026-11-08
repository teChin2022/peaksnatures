// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackDemandOnce } from "@/lib/demand-track";
import { PageViewTracker } from "@/components/booking/page-view-tracker";

vi.mock("next-intl", () => ({ useLocale: () => "th" }));
vi.mock("@/lib/demand-track", () => ({ trackDemandOnce: vi.fn() }));

// Tells React this is a test renderer, so act() flushes effects without warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(PageViewTracker, { homestayId: "homestay-1" })));
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("PageViewTracker", () => {
  it("records page_view once the guest has stayed two seconds, not before", () => {
    act(() => vi.advanceTimersByTime(1999));
    expect(trackDemandOnce).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(trackDemandOnce).toHaveBeenCalledTimes(1);
    expect(trackDemandOnce).toHaveBeenCalledWith("page_view:homestay-1", {
      homestayId: "homestay-1",
      eventType: "page_view",
      locale: "th",
    });
  });

  it("records nothing when the guest leaves before the dwell", () => {
    act(() => vi.advanceTimersByTime(1000));
    act(() => root.unmount());
    act(() => vi.advanceTimersByTime(5000));
    expect(trackDemandOnce).not.toHaveBeenCalled();
    // afterEach unmounts again; give it a fresh root to do that on.
    root = createRoot(document.createElement("div"));
  });
});
