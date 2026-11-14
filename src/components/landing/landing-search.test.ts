// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingContent } from "@/components/landing/landing-content";
import { withIntl } from "../../../test/helpers/intl";

// Tells React this is a test renderer, so act() flushes effects without warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const base = {
  hero_image_url: null,
  gallery: [],
  min_price: 1200,
  max_guests: 4,
  review_count: 0,
  average_rating: 0,
  is_host_verified: false,
};
const homestays = [
  { ...base, slug: "ing-khoa", name: "อิงเขา แคมปิ้ง", location: "อ.แม่แตง จ.เชียงใหม่", tagline: "ทะเลหมอก" },
  { ...base, slug: "doi-view", name: "ดอยวิว", location: "อ.จอมทอง จ.เชียงใหม่", tagline: null },
  { ...base, slug: "nan-river", name: "ริมน่าน", location: "อ.เมือง จ.น่าน", tagline: "ริมแม่น้ำ" },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(withIntl(createElement(LandingContent, { homestays, stats: [] }))));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const input = () => container.querySelector<HTMLInputElement>("#landing-search")!;
const liveText = () => container.querySelector('[aria-live="polite"]')?.textContent ?? "";
const buttonByText = (text: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
// Each card renders twice (phone swipe row and desktop grid), so count distinct links.
const shownSlugs = () =>
  [...new Set([...container.querySelectorAll("#unique-homestays a[href]")].map((a) => a.getAttribute("href")))];

async function search(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => container.querySelector("form")!.requestSubmit());
}

describe("landing search", () => {
  it("is a labelled search form with a named submit button", () => {
    expect(container.querySelector('form[role="search"]')).toBeTruthy();
    expect(container.querySelector('label[for="landing-search"]')?.textContent).toBe("สถานที่");
    expect(input().getAttribute("enterkeyhint")).toBe("search");
    expect(container.querySelector('button[type="submit"]')?.getAttribute("aria-label")).toBe("ค้นหา");
  });

  it("trims the query, echoes it with a count and scrolls to the list", async () => {
    await search("  เชียงใหม่  ");
    expect(shownSlugs()).toEqual(["/ing-khoa", "/doi-view"]);
    expect(liveText()).toBe("พบ 2 แห่งสำหรับ “เชียงใหม่”");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("matches the tagline too", async () => {
    await search("ทะเลหมอก");
    expect(shownSlugs()).toEqual(["/ing-khoa"]);
  });

  it("clears from the result line: all homestays back, box emptied, focus on the list heading", async () => {
    await search("น่าน");
    expect(shownSlugs()).toEqual(["/nan-river"]);
    await act(async () => buttonByText("ล้างการค้นหา")!.click());
    expect(shownSlugs()).toHaveLength(3);
    expect(input().value).toBe("");
    expect(liveText()).toBe("");
    expect(document.activeElement?.tagName).toBe("H2");
  });

  it("offers one way back from no results, and still announces the zero count", async () => {
    await search("ภูเก็ต");
    expect(shownSlugs()).toEqual([]);
    expect(container.textContent).toContain("ไม่พบที่พักที่ตรงกับ “ภูเก็ต”");
    // One message, one action: the result line goes screen-reader-only and its clear link goes away.
    expect(liveText()).toBe("พบ 0 แห่งสำหรับ “ภูเก็ต”");
    expect(container.querySelector('[aria-live="polite"]')!.className).toContain("sr-only");
    expect(buttonByText("ล้างการค้นหา")).toBeUndefined();
    // DESIGN.md: no rounded-3xl or dashed panels on guest pages.
    expect(container.innerHTML).not.toMatch(/rounded-3xl|border-dashed/);
    await act(async () => buttonByText("ดูที่พักทั้งหมด")!.click());
    expect(shownSlugs()).toHaveLength(3);
    expect(input().value).toBe("");
  });

  it("pluralises the result line in English", async () => {
    act(() => root.render(withIntl(createElement(LandingContent, { homestays, stats: [] }), "en")));
    await search("เชียงใหม่");
    expect(liveText()).toBe("2 places for “เชียงใหม่”");
    await search("น่าน");
    expect(liveText()).toBe("1 place for “น่าน”");
  });

  it("shows everything for a blank search", async () => {
    await search("   ");
    expect(shownSlugs()).toHaveLength(3);
    expect(liveText()).toBe("");
  });
});
