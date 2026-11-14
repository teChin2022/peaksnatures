// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: (ns: string) => (key: string) => `${ns}.${key}` }));

import { ErrorView } from "@/components/error-view";
import DashboardError from "@/app/dashboard/error";
import RootError from "@/app/error";

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

const error = Object.assign(new Error("secret db detail"), { digest: "d1" });

describe("ErrorView", () => {
  it("shows a generic message, retries, and links back", () => {
    const reset = vi.fn();
    act(() =>
      root.render(createElement(ErrorView, { title: "T", description: "D", retryLabel: "Retry", onRetry: reset, backHref: "/x", backLabel: "Back" })),
    );
    expect(container.querySelector("h1")?.textContent).toBe("T");
    act(() => (container.querySelector("button") as HTMLButtonElement).click());
    expect(reset).toHaveBeenCalledTimes(1);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/x");
  });
});

describe("error boundaries", () => {
  it("never show the error's own message", () => {
    act(() => root.render(createElement(RootError, { error, reset: () => {} })));
    expect(container.textContent).toContain("errorPage.title");
    expect(container.textContent).not.toContain("secret db detail");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/");
  });

  it("send a host back to the dashboard", () => {
    act(() => root.render(createElement(DashboardError, { error, reset: () => {} })));
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/dashboard");
    expect(container.textContent).toContain("errorPage.dashboard");
  });
});
