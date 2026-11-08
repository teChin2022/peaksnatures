// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FaqSection } from "@/components/booking/faq-section";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

// Tells React this is a test renderer, so act() flushes effects without warning.
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

describe("FaqSection", () => {
  it("renders only entries with both a question and an answer, as the nav and the JSON-LD count them", () => {
    act(() =>
      root.render(
        createElement(FaqSection, {
          items: [
            { question: "Is there parking?", answer: "" },
            { question: "  ", answer: "Orphan answer" },
            { question: "Can we bring pets?", answer: "No." },
          ],
        }),
      ),
    );
    const triggers = [...container.querySelectorAll("button")].map((b) => b.textContent);
    expect(triggers).toEqual(["Can we bring pets?"]);
    expect(container.textContent).not.toContain("Orphan answer");
  });

  it("renders nothing when no entry is complete", () => {
    act(() => root.render(createElement(FaqSection, { items: [{ question: "Q?", answer: " " }] })));
    expect(container.innerHTML).toBe("");
  });
});
