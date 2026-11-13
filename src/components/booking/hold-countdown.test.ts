import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HoldCountdownView, holdTone } from "@/components/booking/hold-countdown";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const view = (timeLeft: number) => renderToStaticMarkup(createElement(HoldCountdownView, { timeLeft }));

describe("holdTone", () => {
  it("warns from 2:00 and turns urgent from 1:00", () => {
    expect(holdTone(600)).toBe("normal");
    expect(holdTone(121)).toBe("normal");
    expect(holdTone(120)).toBe("warning");
    expect(holdTone(61)).toBe("warning");
    expect(holdTone(60)).toBe("urgent");
    expect(holdTone(1)).toBe("urgent");
  });
});

describe("HoldCountdownView", () => {
  it("says what the clock is for, not only the time", () => {
    const html = view(599);
    expect(html).toContain("holdTimer");
    expect(html).toContain("9:59");
    expect(html).toContain('role="timer"');
  });

  it("pads the seconds", () => {
    expect(view(65)).toContain("1:05");
  });

  it("renders nothing once the hold has run out", () => {
    expect(view(0)).toBe("");
  });

  it("colours the chip by tone with design-system classes, not inline hex", () => {
    expect(view(300)).toContain("bg-mist-2");
    expect(view(90)).toContain("bg-amber-50");
    expect(view(30)).toContain("bg-red-50");
    expect(view(30)).not.toContain("#");
  });

  // A live region that changed every second would be unusable with a screen reader.
  it("announces only when the clock crosses 2:00 and 1:00", () => {
    const live = (s: number) => /aria-live="polite"[^>]*>([^<]*)</.exec(view(s))?.[1];
    expect(live(300)).toBe("");
    expect(live(119)).toBe("");
    expect(live(120)).toContain("2:00");
    expect(live(60)).toContain("1:00");
    expect(live(59)).toBe("");
  });
});
