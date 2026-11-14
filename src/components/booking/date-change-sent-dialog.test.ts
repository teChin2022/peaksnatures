// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DateChangeSentDialog, type DateChangeSent } from "@/components/booking/date-change-sent-dialog";

// Keys stand in for the copy; interpolation values are appended so they can be asserted.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const dialog = () => document.querySelector('[role="dialog"]');
const render = (sent: DateChangeSent | null, onClose = () => {}) =>
  act(() =>
    root.render(
      createElement(DateChangeSentDialog, {
        sent,
        onClose,
        facebookUrl: "https://www.facebook.com/ingkhoacamp",
        hostPhone: "081-234-5678",
      }),
    ),
  );

describe("DateChangeSentDialog", () => {
  it("stays closed until a request has been sent", () => {
    render(null);
    expect(dialog()).toBeNull();
  });

  it("asks the guest to message or call the host, with chat-worded Messenger", () => {
    render({ checkIn: "1 Dec 2026", checkOut: "3 Dec 2026", roomName: null });

    const d = dialog()!;
    expect(d.textContent).toContain("dcSentTitle");
    expect(d.textContent).toContain("dcSentDates:1 Dec 2026,3 Dec 2026");
    expect(d.textContent).not.toContain("dcSentRoom");
    const links = [...d.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://m.me/ingkhoacamp", "tel:0812345678"]);
    expect(links[0].textContent).toBe("dcSentChat");
  });

  it("names the new house when the guest changed it", () => {
    render({ checkIn: "1 Dec 2026", checkOut: "3 Dec 2026", roomName: "บ้านริมธาร" });
    expect(dialog()!.textContent).toContain("dcSentRoom:บ้านริมธาร");
  });

  it("closes from its button", () => {
    const onClose = vi.fn();
    render({ checkIn: "1 Dec 2026", checkOut: "3 Dec 2026", roomName: null }, onClose);

    const close = [...dialog()!.querySelectorAll("button")].find((b) => b.textContent === "dcSentClose")!;
    act(() => close.click());
    expect(onClose).toHaveBeenCalledOnce();
  });
});
