// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../../../test/helpers/supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

// Keys and their values stand in for the copy: this tests what is shown, not its wording.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
  useLocale: () => "th",
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: unknown; href: string }) => createElement("a", { href }, children as never),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: h.createClient }));
vi.mock("sonner", () => ({ toast: { success: h.toastSuccess, error: h.toastError } }));

import CheckinsPage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOOKING_ID = "33333333-3333-4333-8333-333333333333";

const arrival = (over: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  guest_name: "Nok Suwan",
  guest_email: "guest@example.com",
  guest_phone: "0898765432",
  guest_province: null,
  check_in: "2026-11-15",
  check_out: "2026-11-17",
  num_guests: 2,
  total_price: 3000,
  amount_paid: 1000,
  payment_type: "deposit",
  status: "confirmed",
  checked_in_at: null,
  selected_options: null,
  notes: null,
  room_id: null,
  ...over,
});

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

async function render(booking = arrival()) {
  h.createClient.mockReturnValue(
    createSupabaseMock({
      user: { id: "user-1" },
      tables: {
        hosts: { data: { id: "host-1" } },
        homestays: { data: [{ id: "homestay-1" }] },
        bookings: { data: [booking] },
        rooms: { data: [] },
        booking_attachments: { data: [] },
      },
    }),
  );
  await act(async () => root.render(createElement(CheckinsPage)));
  // Let the mount effect's queries settle.
  await act(async () => {});
}

const button = (text: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) ?? null;

const click = async (el: HTMLElement | null) => {
  if (!el) throw new Error("button not found");
  await act(async () => el.click());
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, amount_paid: 3000 }) });
  vi.stubGlobal("fetch", fetchMock);
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("CheckinsPage: recording a cash balance", () => {
  it("offers it only for an arrival with a balance due", async () => {
    await render(arrival({ amount_paid: 3000, payment_type: "full" }));
    expect(button("recordCash")).toBeNull();
  });

  it("asks once more before recording, because the record has no undo", async () => {
    await render();

    await click(button("recordCash"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(button("recordCashConfirm:2,000")).not.toBeNull();
  });

  it("records the cash on the second tap and shows the booking paid in full", async () => {
    await render();

    await click(button("recordCash"));
    await click(button("recordCashConfirm:2,000"));

    expect(fetchMock).toHaveBeenCalledWith("/api/bookings/host-cash-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ booking_id: BOOKING_ID }),
    });
    expect(h.toastSuccess).toHaveBeenCalledWith("recordCashSuccess");
    expect(container.textContent).toContain("fullPaid");
    expect(button("recordCash")).toBeNull();
  });

  it("can be called off before anything is sent", async () => {
    await render();

    await click(button("recordCash"));
    await click(button("recordCashCancel"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(button("recordCashConfirm")).toBeNull();
    expect(button("recordCash")).not.toBeNull();
  });

  it("says so and keeps the balance when the server refuses", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Forbidden" }) });
    await render();

    await click(button("recordCash"));
    await click(button("recordCashConfirm:2,000"));

    expect(h.toastError).toHaveBeenCalledWith("recordCashError");
    expect(container.textContent).toContain("balanceDue:2,000");
  });
});
