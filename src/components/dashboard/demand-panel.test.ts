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
