// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "th",
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/bookings", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: h.createClient }));
vi.mock("@/lib/history-log-client", () => ({ logClientEvent: vi.fn() }));

import BookingsPage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Call = [method: string, args: unknown[]];
type Result = { data?: unknown; count?: number };

const booking = (id: string, guest: string, status: string, createdAt: string) => ({
  id, homestay_id: "hs-1", room_id: null, group_id: null,
  guest_name: guest, guest_email: `${id}@example.com`, guest_phone: "0800000000",
  check_in: "2026-12-20", check_out: "2026-12-21", num_guests: 2,
  total_price: 1500, discount_amount: null, amount_paid: 1500, payment_type: "full",
  status, easyslip_verified: false, payment_slip_url: null, payment_slip_hash: null,
  guest_province: null, checked_in_at: null, checked_out_at: null, cancelled_by: null,
  cancel_reason: null, created_at: createdAt, selected_options: null, booking_source: null,
  guest_pricing_label: null,
});

// The 20 newest bookings are all confirmed; the ones a host must act on are older.
const RECENT = Array.from({ length: 20 }, (_, i) =>
  booking(`c-${i}`, `Recent ${i}`, "confirmed", `2026-11-${String(30 - i).padStart(2, "0")}T00:00:00Z`));
const OLD_PENDING = booking("p-old", "Old Pending Guest", "pending", "2026-10-01T00:00:00Z");
const OLD_WITH_DATE_CHANGE = booking("d-old", "Date Change Guest", "confirmed", "2026-09-01T00:00:00Z");
const ALL = [...RECENT, OLD_PENDING, OLD_WITH_DATE_CHANGE];

const DATE_CHANGE = {
  id: "dcr-1", booking_id: "d-old", old_check_in: "2026-12-20", old_check_out: "2026-12-21",
  new_check_in: "2026-12-27", new_check_out: "2026-12-28", old_total_price: 1500, new_total_price: 1500,
  price_difference: 0, status: "pending", requested_by: "guest", easyslip_verified: false,
  payment_slip_url: null, old_room_id: null, new_room_id: null,
  bookings: { homestay_id: "hs-1", status: "confirmed" },
};

const arg = (calls: Call[], method: string, column: string) =>
  calls.find(([m, a]) => m === method && a[0] === column)?.[1][1];

/** Answers a bookings query from the filters it was built with, like PostgREST would. */
function answerBookings(calls: Call[]): Result {
  const head = (calls.find(([m]) => m === "select")?.[1][1] as { head?: boolean } | undefined)?.head;
  const statusIn = arg(calls, "in", "status") as string[] | undefined;
  const statusEq = arg(calls, "eq", "status") as string | undefined;
  const ids = (arg(calls, "in", "id") ?? arg(calls, "in", "group_id")) as string[] | undefined;
  const range = calls.find(([m]) => m === "range")?.[1] as [number, number] | undefined;

  let rows = ALL;
  if (statusIn) rows = rows.filter((b) => statusIn.includes(b.status));
  if (statusEq) rows = rows.filter((b) => b.status === statusEq);
  if (ids) rows = rows.filter((b) => ids.includes(b.id) || ids.includes(String(b.group_id)));
  if (head) return { count: rows.length };
  if (range) rows = rows.slice(range[0], range[1] + 1);
  return { data: rows, count: rows.length };
}

function builder(answer: (calls: Call[]) => Result) {
  const calls: Call[] = [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "in", "eq", "neq", "or", "not", "is", "order", "range", "limit"]) {
    b[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return b;
    };
  }
  const settle = () => {
    const r = answer(calls);
    return { data: r.data ?? null, error: null, count: r.count ?? null };
  };
  b.single = () => Promise.resolve({ ...settle(), data: (settle().data as unknown[] | null)?.[0] ?? settle().data });
  b.maybeSingle = b.single;
  b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(settle()).then(ok, bad);
  return b;
}

const TABLES: Record<string, (calls: Call[]) => Result> = {
  hosts: () => ({ data: [{ id: "host-1", name: "Doi", plan_type: "commission" }] }),
  homestays: () => ({ data: [{ id: "hs-1", name: "Doi Homestay" }] }),
  rooms: () => ({ data: [] }),
  booking_attachments: () => ({ data: [] }),
  date_change_requests: () => ({ data: [DATE_CHANGE] }),
  bookings: answerBookings,
};

let container: HTMLDivElement;
let root: Root;

async function render() {
  h.createClient.mockReturnValue({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "owner-1" } }, error: null }) },
    from: (table: string) => builder(TABLES[table] ?? (() => ({ data: [] }))),
  });
  await act(async () => root.render(createElement(BookingsPage)));
  await act(async () => {});
}

// Radix Tabs switch on mousedown, not click.
async function openTab(name: string) {
  const trigger = [...container.querySelectorAll<HTMLButtonElement>("[role=tab]")].find((el) => el.textContent?.startsWith(name));
  if (!trigger) throw new Error(`no tab ${name}`);
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
  });
  await act(async () => {});
}

const panelText = () => container.querySelector("[role=tabpanel][data-state=active]")?.textContent ?? "";

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ urls: {} }) }));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("BookingsPage tabs", () => {
  it("shows a pending booking older than the newest 20 in the pending tab", async () => {
    await render();
    await openTab("allBookings");
    expect(panelText()).not.toContain("Old Pending Guest"); // all tab: newest 20 only

    await openTab("pending");
    expect(panelText()).toContain("Old Pending Guest");
  });

  it("shows an older booking with a date-change request in the pending tab", async () => {
    await render();
    await openTab("pending");
    expect(panelText()).toContain("Date Change Guest");
  });

  it("opens on the pending tab when something needs the host", async () => {
    await render();
    expect(container.querySelector("[role=tab][aria-selected=true]")?.textContent).toMatch(/^pending/);
    expect(panelText()).toContain("Old Pending Guest");
  });

  it("counts the date-change request in the pending tab's total", async () => {
    await render();
    const pendingTab = [...container.querySelectorAll("[role=tab]")].find((el) => el.textContent?.startsWith("pending"));
    expect(pendingTab?.textContent).toContain("(2)"); // 1 pending + 1 date change on a confirmed booking
  });

  it("lists confirmed bookings from the server in the confirmed tab, with load more", async () => {
    await render();
    await openTab("confirmedTab");
    expect(panelText()).toContain("Recent 0");
    const loadMore = [...container.querySelectorAll("[role=tabpanel][data-state=active] button")].find((el) => el.textContent === "loadMore");
    expect(loadMore).toBeTruthy(); // 21 confirmed, 20 per page
  });
});

describe("BookingsPage ?tab=", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("opens the pending tab from the home page's link", async () => {
    window.history.replaceState(null, "", "/dashboard/bookings?tab=pending");
    await render();
    await act(async () => {});
    const selected = container.querySelector("[role=tab][aria-selected=true]");
    expect(selected?.textContent).toMatch(/^pending/);
    expect(panelText()).toContain("Old Pending Guest");
  });
});
