// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
  useLocale: () => "th",
}));
vi.mock("sonner", () => ({ toast: { success: h.toastSuccess, error: h.toastError } }));

import { ChangeQuickBookingDialog } from "./change-quick-booking-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Far enough ahead that no day is disabled as past.
const BOOKING = {
  id: "bk-1",
  room_id: "room-a",
  check_in: "2027-03-01",
  check_out: "2027-03-03",
  total_price: 3000,
  amount_paid: 3000,
};
const ROOMS = [
  { id: "room-a", name: "บ้านริมน้ำ", price_per_night: 1500 },
  { id: "room-b", name: "บ้านบนเขา", price_per_night: 2000 },
];

let container: HTMLDivElement;
let root: Root;
const onOpenChange = vi.fn();
const onSuccess = vi.fn();

const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!;
const save = () => button("changeBookingSave");
const priceInput = () => document.getElementById("cb-price") as HTMLInputElement;
const hint = () => document.getElementById("cb-price-hint")!.textContent;

function typePrice(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(priceInput(), value);
    priceInput().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function pickCheckOut(iso: string) {
  await act(async () => (document.getElementById("cb-checkout") as HTMLButtonElement).click());
  const day = document.querySelector(`td[data-day="${iso}"] button`) as HTMLButtonElement;
  await act(async () => day.click());
}

async function render() {
  await act(async () =>
    root.render(
      createElement(ChangeQuickBookingDialog, { booking: BOOKING, rooms: ROOMS, open: true, onOpenChange, onSuccess }),
    ),
  );
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
  onOpenChange.mockReset();
  onSuccess.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("ChangeQuickBookingDialog", () => {
  it("starts from the booking and saves nothing until the house or dates change", async () => {
    await render();
    expect(priceInput().value).toBe("3000");
    expect(document.body.textContent).toContain("nightsCount:2");
    expect(hint()).toContain("paymentFull");
    expect(save().disabled).toBe(true);

    // A new price alone is not a house/date change.
    typePrice("4500");
    expect(save().disabled).toBe(true);
  });

  it("shows what the guest still owes at a higher price, and posts the change", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal("fetch", fetchMock);
    await render();

    await pickCheckOut("2027-03-05");
    expect(document.body.textContent).toContain("nightsCount:4");
    typePrice("6000");
    expect(hint()).toContain("balanceDue:3,000");
    expect(save().disabled).toBe(false);

    await act(async () => save().click());
    expect(fetchMock).toHaveBeenCalledWith("/api/bookings/change-dates/host", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      booking_id: "bk-1",
      new_room_id: "room-a",
      new_check_in: "2027-03-01",
      new_check_out: "2027-03-05",
      total_price: 6000,
    });
    expect(h.toastSuccess).toHaveBeenCalledWith("changeBookingSuccess");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalled();
  });

  it.each([
    ["DATES_HELD", "datesHeld"],
    ["PENDING_EXISTS", "changeBookingPendingExists"],
    ["HOST_BLOCKED", "blocked"],
    ["Failed to change booking", "changeBookingFailed"],
  ])("says why a %s refusal failed and stays open", async (error, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error }) }));
    await render();
    await pickCheckOut("2027-03-04");
    await act(async () => save().click());

    expect(h.toastError).toHaveBeenCalledWith(message);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(save().disabled).toBe(false);
  });

  it("refuses a blank price", async () => {
    await render();
    await pickCheckOut("2027-03-04");
    typePrice("");
    expect(save().disabled).toBe(true);
  });
});
