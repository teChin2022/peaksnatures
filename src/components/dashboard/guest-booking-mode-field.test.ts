// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuestBookingModeField } from "@/components/dashboard/guest-booking-mode-field";

// Keys stand in for the copy: this tests which text is shown, not its wording.
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

// Tells React this is a test renderer, so act() flushes events without warning.
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

const render = (props: Partial<ComponentProps<typeof GuestBookingModeField>> = {}) => {
  const onChange = vi.fn();
  act(() =>
    root.render(createElement(GuestBookingModeField, { value: "normal", onChange, facebookUrl: "", ...props })),
  );
  return onChange;
};

const radios = () => [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
const notes = () => container.querySelector('[data-testid="quick-mode-notes"]');

describe("GuestBookingModeField", () => {
  it("offers the three modes as one radio group, with the saved one checked", () => {
    render({ value: "both" });

    expect(radios().map((r) => r.value)).toEqual(["normal", "quick", "both"]);
    expect(new Set(radios().map((r) => r.name)).size).toBe(1);
    expect(radios().map((r) => r.checked)).toEqual([false, false, true]);
  });

  it("names the group, and gives every radio its own label and description", () => {
    render();

    expect(container.querySelector("fieldset legend")?.textContent).toBe("guestBookingMode");
    const labels = radios().map((r) => r.closest("label")?.textContent);
    expect(labels).toEqual([
      "guestBookingModeNormalguestBookingModeNormalDesc",
      "guestBookingModeQuickguestBookingModeQuickDesc",
      "guestBookingModeBothguestBookingModeBothDesc",
    ]);
  });

  it("reports the chosen mode", () => {
    const onChange = render({ value: "normal" });

    act(() => radios()[1].click());
    expect(onChange).toHaveBeenCalledWith("quick");

    act(() => radios()[2].click());
    expect(onChange).toHaveBeenLastCalledWith("both");
  });

  it("is keyboard-reachable: native radios, none removed from the tab order", () => {
    render();
    for (const r of radios()) expect(r.tabIndex).toBeGreaterThanOrEqual(0);
  });

  describe("the notes under the choice", () => {
    it("say nothing for the standard flow", () => {
      render({ value: "normal" });
      expect(notes()).toBeNull();
    });

    it.each(["quick", "both"] as const)("warn that the host confirms and the dates are held, for %s", (value) => {
      render({ value });
      expect(notes()?.textContent).toContain("guestBookingModeQuickNote");
    });

    it("promise Messenger when the Facebook field holds a page username", () => {
      render({ value: "quick", facebookUrl: "https://www.facebook.com/ingkhoacamp" });
      expect(notes()?.textContent).toContain("guestBookingModeContactMessenger");
    });

    it("explain that a page link opens the page, not Messenger", () => {
      render({ value: "quick", facebookUrl: "https://www.facebook.com/pages/Ing-Khoa/123456789" });
      expect(notes()?.textContent).toContain("guestBookingModeContactPage");
    });

    it.each([
      ["empty", ""],
      ["another site", "https://www.instagram.com/ingkhoacamp"],
      ["not a link", "not a url at all"],
    ])("warn that guests will see the host's phone instead, when the Facebook field is %s", (_label, url) => {
      render({ value: "quick", facebookUrl: url });
      expect(notes()?.textContent).toContain("guestBookingModeContactNone");
    });

    it("follow the Facebook field as the host edits it", () => {
      render({ value: "quick", facebookUrl: "" });
      expect(notes()?.textContent).toContain("guestBookingModeContactNone");

      render({ value: "quick", facebookUrl: "facebook.com/ingkhoacamp" });
      expect(notes()?.textContent).toContain("guestBookingModeContactMessenger");
    });
  });
});
