// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withIntl } from "../../test/helpers/intl";

const h = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => h.pathname }));

import { CookieConsent } from "./cookie-consent";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  document.cookie = "cookie_consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (pathname: string) => {
  h.pathname = pathname;
  return act(async () => root.render(withIntl(createElement(CookieConsent))));
};

describe("CookieConsent", () => {
  it("asks guests who have not chosen yet", async () => {
    await render("/");
    expect(container.querySelector("button")).not.toBeNull();
  });

  it("stays off the admin pages, which are English-only and track nothing", async () => {
    await render("/admin/login");
    expect(container.innerHTML).toBe("");
    await render("/admin/hosts");
    expect(container.innerHTML).toBe("");
  });

  it("still shows on a guest page whose slug starts with admin", async () => {
    await render("/administrator-homestay");
    expect(container.querySelector("button")).not.toBeNull();
  });
});
