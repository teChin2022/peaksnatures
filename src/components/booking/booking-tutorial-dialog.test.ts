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
    // The four steps of the /book flow; the last is the payment with the slip upload.
    for (const n of [1, 2, 3, 4]) expect(text).toContain(`step${n}Title`);
    expect(text).toContain("step4Desc");
    expect(text).not.toContain("Quick");
  });

  it("swaps the intro and the payment step for a quick-only host, and leaves steps 1 to 3 alone", () => {
    const text = render(true);
    expect(text).toContain("introQuick");
    expect(text).toContain("step4TitleQuick");
    expect(text).toContain("step4DescQuick");
    for (const n of [1, 2, 3]) expect(text).toContain(`step${n}Desc`);
    expect(text.replaceAll("step4TitleQuick", "").replaceAll("step4DescQuick", "")).not.toMatch(/step4(Title|Desc)/);
  });
});
