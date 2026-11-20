// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AdminBillingPage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();

const invoice = {
  id: "inv-1",
  host_id: "host-1",
  amount: 1500,
  period_start: "2026-09-01",
  period_end: "2026-11-30",
  status: "pending",
  due_date: "2026-09-05",
  paid_at: null,
  created_at: "2026-09-01T03:00:00Z",
  host: { id: "host-1", name: "Wang", email: "wang@example.com" },
};

const listUrls = () => fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/api/admin/invoices?"));
const button = (text: string, scope: ParentNode = document.body) =>
  [...scope.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

const render = async () => {
  await act(async () => {
    root.render(createElement(AdminBillingPage));
  });
};

beforeEach(() => {
  nav.search = "";
  nav.replace.mockReset();
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ invoices: [invoice], total: 1 }) });
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Admin billing: the status filter lives in the URL", () => {
  it("opens filtered when the link carries ?status", async () => {
    nav.search = "status=paid";
    await render();
    expect(listUrls()[0]).toContain("status=paid");
    expect(button("Paid")!.getAttribute("aria-pressed")).toBe("true");
  });

  // The Overview's "Overdue invoices" links here: same set (overdue, or pending past due).
  it("asks for every invoice that blocks bookings when Overdue is chosen", async () => {
    nav.search = "status=overdue";
    await render();
    expect(listUrls()[0]).toContain("status=blocking");
    expect(button("Overdue")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("ignores a status it does not know", async () => {
    nav.search = "status=refunded";
    await render();
    expect(listUrls()[0]).not.toContain("status=");
  });

  it("writes the chosen filter to the URL, and All clears it", async () => {
    await render();
    await act(async () => button("Paid")!.click());
    expect(nav.replace).toHaveBeenLastCalledWith("/admin/billing?status=paid", { scroll: false });
    expect(listUrls().at(-1)).toContain("status=paid");

    await act(async () => button("All")!.click());
    expect(nav.replace).toHaveBeenLastCalledWith("/admin/billing", { scroll: false });
  });
});

describe("Admin billing: status shown", () => {
  afterEach(() => vi.useRealTimers());

  it("shows a pending invoice past its due date as overdue, and still offers both actions", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-06T03:00:00Z")); // Sep 6 in Bangkok, the day after it was due
    await render();
    const row = container.querySelector("tbody tr")!;
    expect(row.textContent).toContain("Overdue");
    expect(row.textContent).not.toContain("Pending");
    expect(button("Mark Paid")).toBeTruthy();
    expect(button("Overdue", row)).toBeTruthy();
  });

  it("keeps it pending on its due date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-05T03:00:00Z"));
    await render();
    expect(container.querySelector("tbody tr")!.textContent).toContain("Pending");
  });
});

describe("Admin billing: Mark Paid", () => {
  it("restates the amount, period and due date before anything is sent", async () => {
    await render();
    await act(async () => button("Mark Paid")!.click());

    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Wang");
    expect(dialog.textContent).toContain("฿1,500");
    expect(dialog.textContent).toContain("Sep 1 → Nov 30, 2026");
    expect(dialog.textContent).toContain("Sep 5, 2026");
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")).toBe(false);
  });
});
