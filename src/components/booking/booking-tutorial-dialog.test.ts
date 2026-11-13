// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingTutorialDialog } from "@/components/booking/booking-tutorial-dialog";

// Keys stand in for the copy: this tests which text is shown, not its wording.
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

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

const render = (quickOnly?: boolean) => {
  act(() => root.render(createElement(BookingTutorialDialog, { open: true, onOpenChange: () => {}, quickOnly })));
  return document.body.textContent ?? "";
};

describe("BookingTutorialDialog", () => {
  it("promises the automatic slip check on the normal flow", () => {
    const text = render();
    expect(text).toContain("intro");
    expect(text).toContain("step3Title");
    expect(text).toContain("step3Desc");
    expect(text).not.toContain("Quick");
  });

  it("swaps the intro and step 3 for a quick-only host, and leaves steps 1 and 2 alone", () => {
    const text = render(true);
    expect(text).toContain("introQuick");
    expect(text).toContain("step3TitleQuick");
    expect(text).toContain("step3DescQuick");
    expect(text).toContain("step1Desc");
    expect(text).toContain("step2Desc");
    expect(text.replaceAll("step3TitleQuick", "").replaceAll("step3DescQuick", "")).not.toMatch(/step3(Title|Desc)/);
  });
});
