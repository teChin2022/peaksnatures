// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemandPanel, type DemandPanelLabels } from "./demand-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const labels = new Proxy({}, { get: (_t, key) => (key === "stages" ? new Proxy({}, { get: (_s, k) => String(k) }) : key === "ranges" ? { d7: "7", d30: "30", d90: "90" } : String(key)) }) as DemandPanelLabels;

let container: HTMLDivElement;
let root: Root;

async function render(response: { ok: boolean; json?: () => Promise<unknown> }) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  await act(async () => root.render(createElement(DemandPanel, { endpoint: "/api/host/demand", labels, locale: "th" })));
  await act(async () => {});
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

// A failed request used to read "no demand yet", the same as a quiet month.
describe("DemandPanel", () => {
  it("says the data did not load when the request fails", async () => {
    await render({ ok: false });
    expect(container.querySelector("[role=alert]")?.textContent).toBe("error");
    expect(container.textContent).not.toContain("empty");
  });

  it("says there is no demand yet when the request works but is empty", async () => {
    await render({ ok: true, json: async () => ({ funnel: [], topDates: [] }) });
    expect(container.textContent).toContain("empty");
    expect(container.querySelector("[role=alert]")).toBeNull();
  });
});

describe("DemandPanel: range buttons", () => {
  it("expose which range is chosen", async () => {
    await render({ ok: true, json: async () => ({ funnel: [], topDates: [] }) });
    const pressed = [...container.querySelectorAll("button[aria-pressed=true]")].map((b) => b.textContent);
    expect(pressed).toEqual(["30"]);
  });
});

// Quick booking uploads no slip on the page, so the slip row is not a step every booking passes.
describe("DemandPanel: slip and quick bookings", () => {
  const funnel = (quickConversions: number | null) => ({
    funnel: [
      ["page_view", 100], ["calendar_view", 80], ["dates_selected", 60], ["step_dates", 40],
      ["step_details", 20], ["step_payment", 20], ["slip_uploaded", 5], ["booking_submitted", 15],
    ].map(([stage, sessions]) => ({ stage, sessions })),
    topDates: [],
    totals: { sessions: 100, conversions: 15, lostDemand: 0, conversionPct: 15, quickConversions },
  });
  const row = (label: string) =>
    [...container.querySelectorAll("span")].find((s) => s.textContent === label)?.parentElement?.textContent;

  it("compares bookings with the payment page, and gives the slip row no drop-off", async () => {
    await render({ ok: true, json: async () => funnel(10) });
    expect(row("booking_submitted")).toBe("booking_submitted15-25%");
    expect(row("slip_uploaded")).toBe("slip_uploaded5");
  });

  it("splits bookings into standard and quick", async () => {
    await render({ ok: true, json: async () => funnel(10) });
    expect(row("bookedStandard")).toBe("bookedStandard5");
    expect(row("bookedQuick")).toBe("bookedQuick10");
  });

  it("shows no split when there were no quick bookings, or the count is unknown", async () => {
    for (const quick of [0, null]) {
      await render({ ok: true, json: async () => funnel(quick) });
      expect(row("bookedQuick")).toBeUndefined();
      expect(row("bookedStandard")).toBeUndefined();
    }
  });
});
