// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingNavbar } from "@/components/landing/navbar";
import { LandingFooter } from "@/components/landing/footer";
import { withIntl } from "../../../test/helpers/intl";

// LanguageSwitcherIcon refreshes through the App Router, which a test renderer has no instance of.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// Tells React this is a test renderer, so act() flushes effects without warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(withIntl(createElement(LandingNavbar))));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const hostButton = () => container.querySelector<HTMLButtonElement>('button[aria-controls="landing-host-menu"]')!;

describe("LandingNavbar", () => {
  it("links the logo home and has no glass bar", () => {
    expect(container.querySelector('a[href="/"]')?.textContent).toBe("Peaksnature");
    expect(container.innerHTML).not.toContain("glass-nav");
    expect(container.innerHTML).not.toContain("backdrop-blur");
  });

  it("offers a language switch, like every other public page", () => {
    expect(container.querySelector('button[aria-label="เปลี่ยนภาษา"]')).toBeTruthy();
  });

  it("labels the host menu in visible words and reports whether it is open", async () => {
    expect(hostButton().textContent).toBe("สำหรับเจ้าของที่พัก");
    expect(hostButton().getAttribute("aria-expanded")).toBe("false");
    await act(async () => hostButton().click());
    expect(hostButton().getAttribute("aria-expanded")).toBe("true");
    const register = container.querySelector('#landing-host-menu a[href="/register"]');
    expect(register).toBeTruthy();
    // A background tint alone was ~1.1:1; the links need a real ring.
    expect(register!.className).toContain("focus-visible:ring-2");
  });

  it("closes the host menu on Escape and returns focus to its button", async () => {
    await act(async () => hostButton().click());
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(hostButton().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(hostButton());
  });
});

describe("LandingFooter", () => {
  it("sends help to /trust-safety instead of a second contact-form button", () => {
    const html = renderToStaticMarkup(withIntl(createElement(LandingFooter)));
    expect(html).toContain('href="/trust-safety"');
    expect(html).toContain("ความปลอดภัย &amp; ความน่าเชื่อถือ");
    expect(html).not.toContain("คำถามที่พบบ่อย");
    expect(html).not.toContain("<h4");
    // The wordmark is not a heading; the two link columns are the footer's sections.
    expect(html).toContain('<p class="text-3xl font-serif mb-2 text-earth-50">Peaksnature</p>');
    expect(html.match(/<h2 /g)).toHaveLength(2);
  });
});
