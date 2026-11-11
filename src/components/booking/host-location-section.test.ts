// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostLocationSection } from "@/components/booking/host-location-section";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }));

// Tells React this is a test renderer, so act() flushes effects without warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // Mocks Date only; no fake timers.
  vi.setSystemTime(new Date("2026-11-05T05:00:00Z"));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const render = (props: Partial<ComponentProps<typeof HostLocationSection>>) =>
  act(() =>
    root.render(
      createElement(HostLocationSection, {
        hostName: "Somchai Jaidee",
        hostPhone: null,
        lineId: null,
        hostAvatarUrl: null,
        isVerified: true,
        hostCreatedAt: "2024-01-01T00:00:00Z",
        totalBookings: 12,
        lastBookingDate: null,
        location: "Chiang Mai",
        mapEmbedUrl: null,
        ...props,
      }),
    ),
  );

describe("HostLocationSection trust signals", () => {
  it("offers the host's LINE beside the phone, opening outside the page", () => {
    render({ hostPhone: "0812345678", lineId: "@baan" });
    const line = container.querySelector<HTMLAnchorElement>('a[href="https://line.me/R/ti/p/%40baan"]');
    expect(line?.textContent).toContain("chatOnLine");
    expect(line?.target).toBe("_blank");
    expect(line?.rel).toBe("noopener noreferrer");
  });

  it("shows no LINE link when the host has no LINE ID", () => {
    render({ hostPhone: "0812345678" });
    expect(container.querySelector('a[href^="https://line.me"]')).toBeNull();
  });

  it("shows the verified badge for a verified host", () => {
    render({ isVerified: true });
    expect(container.textContent).toContain("verifiedHost");
  });

  it("shows no badge at all for an unverified host, as the hero does", () => {
    render({ isVerified: false });
    expect(container.textContent).not.toContain("verifiedHost");
    expect(container.textContent).not.toContain("unverifiedHost");
  });

  it("shows a last booking from the past 30 days", () => {
    render({ lastBookingDate: "2026-10-26T03:00:00Z" });
    expect(container.textContent).toContain("lastBooking");
  });

  it("hides a last booking older than 30 days: a stale date reads as a quiet listing", () => {
    render({ lastBookingDate: "2026-09-26T03:00:00Z" });
    expect(container.textContent).not.toContain("lastBooking");
  });
});
