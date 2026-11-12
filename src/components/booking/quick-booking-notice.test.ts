// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostContactLinks } from "@/components/booking/host-contact-links";
import { QuickBookingNotice } from "@/components/booking/quick-booking-notice";

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
  vi.restoreAllMocks();
});

const links = () => [...container.querySelectorAll("a")];

describe("HostContactLinks", () => {
  const render = (facebookUrl: string | null, hostPhone: string | null) =>
    act(() => root.render(createElement(HostContactLinks, { facebookUrl, hostPhone })));

  it("opens Messenger in a new tab when the Facebook link is a page username", () => {
    render("https://www.facebook.com/ingkhoacamp", null);

    const [a] = links();
    expect(a.getAttribute("href")).toBe("https://m.me/ingkhoacamp");
    expect(a.textContent).toBe("hostContactMessenger");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("opens the page, labelled as the page, when Messenger cannot be derived", () => {
    render("https://www.facebook.com/pages/Ing-Khoa/123456789", null);

    const [a] = links();
    expect(a.getAttribute("href")).toBe("https://www.facebook.com/pages/Ing-Khoa/123456789");
    expect(a.textContent).toBe("hostContactPage");
  });

  it("offers the host's phone as a tel: link, stripped of spaces and dashes", () => {
    render(null, " 081-234 5678 ");

    expect(links()).toHaveLength(1);
    expect(links()[0].getAttribute("href")).toBe("tel:0812345678");
    expect(links()[0].textContent).toBe("hostContactCall:081-234 5678");
  });

  it("shows both, Facebook first, when the host has both", () => {
    render("https://www.facebook.com/ingkhoacamp", "0812345678");
    expect(links().map((a) => a.getAttribute("href"))).toEqual(["https://m.me/ingkhoacamp", "tel:0812345678"]);
  });

  it("falls back to the phone when the Facebook link is not a Facebook web link", () => {
    render("https://www.instagram.com/ingkhoacamp", "0812345678");
    expect(links().map((a) => a.getAttribute("href"))).toEqual(["tel:0812345678"]);
  });

  it("never turns a javascript: address into a link", () => {
    render("javascript:alert(1)", null);
    expect(links()).toHaveLength(0);
  });

  it("says the host will call when there is neither", () => {
    render(null, "  ");
    expect(links()).toHaveLength(0);
    expect(container.textContent).toBe("hostContactNone");
  });
});

describe("QuickBookingNotice", () => {
  const render = (over: Partial<Parameters<typeof QuickBookingNotice>[0]> = {}) =>
    act(() =>
      root.render(
        createElement(QuickBookingNotice, {
          code: "3f2a9c1e",
          amountToTransfer: 1500,
          facebookUrl: "https://www.facebook.com/ingkhoacamp",
          hostPhone: "0812345678",
          ...over,
        }),
      ),
    );

  it("shows the booking code, the amount to transfer and the next steps", () => {
    render();
    const text = container.textContent ?? "";

    expect(text).toContain("3f2a9c1e");
    expect(text).toContain("฿1,500");
    expect(text).toContain("quickNextStep1");
    expect(text).toContain("quickNextStep2");
  });

  it("carries the host's contact links", () => {
    render();
    expect(links().map((a) => a.getAttribute("href"))).toEqual(["https://m.me/ingkhoacamp", "tel:0812345678"]);
  });

  it("copies the code on request and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render();

    const button = container.querySelector("button")!;
    expect(button.textContent).toBe("quickCodeCopy");
    await act(async () => button.click());

    expect(writeText).toHaveBeenCalledWith("3f2a9c1e");
    expect(button.textContent).toBe("quickCodeCopied");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("quickCodeCopied");
  });

  it("stays quiet, with the code still readable, when the clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    render();

    const button = container.querySelector("button")!;
    await act(async () => button.click());

    expect(button.textContent).toBe("quickCodeCopy");
    expect(container.textContent).toContain("3f2a9c1e");
  });
});
