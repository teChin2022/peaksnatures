// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewsDisplay } from "@/components/reviews/reviews-display";
import type { Review } from "@/types/database";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }));
// "View all" pages through the browser client; these tests never open it.
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

// Tells React this is a test renderer, so act() flushes effects without warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ReviewWithProvince = Review & { bookings: { guest_province: string | null } | null };

const review = (over: Partial<ReviewWithProvince> = {}): ReviewWithProvince => ({
  id: "review-1",
  homestay_id: "homestay-1",
  booking_id: "booking-1",
  guest_name: "Somchai Jaidee",
  rating: 5,
  comment: "Woke up to a sea of mist. ".repeat(10),
  topic: null,
  rating_environment: null,
  rating_cleanliness: null,
  rating_service: null,
  rating_value: null,
  photos: [],
  impression_tags: [],
  would_return: null,
  stay_highlight: null,
  created_at: "2026-10-01T10:00:00Z",
  created_by: "guest",
  updated_at: "2026-10-01T10:00:00Z",
  updated_by: "guest",
  bookings: { guest_province: null },
  ...over,
});

// happy-dom does no layout: a test sets the comment's sizes and fires the observer itself.
let fireResize = () => {};
class FakeResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {
    fireResize = () => this.callback([], this as unknown as ResizeObserver);
  }
  disconnect() {
    fireResize = () => {};
  }
}

function layout(scrollHeight: number, clientHeight: number) {
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockReturnValue(scrollHeight);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(clientHeight);
  act(() => fireResize());
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const render = (reviews: ReviewWithProvince[]) =>
  act(() =>
    root.render(
      createElement(ReviewsDisplay, {
        reviews,
        averageRating: 4.5,
        totalCount: reviews.length,
        categoryAverages: {},
        homestayId: "homestay-1",
      }),
    ),
  );
const readMoreButton = () => [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("readMore"));
const dialogs = () => [...document.querySelectorAll('[role="dialog"]')];
const press = (key: string) =>
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });

describe("ReviewsDisplay photo viewer", () => {
  it("layers over the review it was opened from, and Escape closes only the viewer", () => {
    render([review({ photos: ["/p1.jpg", "/p2.jpg"] })]);
    layout(91, 68);
    act(() => readMoreButton()!.click());
    act(() => dialogs()[0].querySelector("button img")!.closest("button")!.click());

    expect(dialogs()).toHaveLength(2);

    press("Escape");
    expect(dialogs()).toHaveLength(1);
    expect(dialogs()[0].textContent).toContain("Somchai Jaidee");
  });
});

describe("ReviewsDisplay cards", () => {
  // "Read more" once needed over 150 characters, but three lines hold about 100 Thai characters on a phone
  // card: a 120-character review was cut with no way to read the rest.
  it("offer read more whenever the comment is cut, however short", () => {
    render([review({ comment: "ตื่นมาเจอทะเลหมอก อากาศเย็นสบาย ".repeat(4) })]);
    layout(91, 68);
    expect(readMoreButton()).toBeDefined();
  });

  it("offer no read more when the whole comment fits", () => {
    render([review()]);
    layout(68, 68);
    expect(readMoreButton()).toBeUndefined();
  });

  it("leave out the rating bars and the would-return line when the guest left them blank", () => {
    render([review()]);
    expect(container.textContent).not.toContain("categoryEnvironment");
    expect(container.textContent).not.toContain("wouldReturn");
  });

  it("show only the categories the guest rated, and their would-return answer", () => {
    render([review({ rating_environment: 4, would_return: "yes" })]);
    expect(container.textContent).toContain("categoryEnvironment");
    expect(container.textContent).not.toContain("categoryCleanliness");
    expect(container.textContent).toContain("wouldReturnDisplay");
    expect(container.textContent).toContain("wouldReturnYes");
  });
});
