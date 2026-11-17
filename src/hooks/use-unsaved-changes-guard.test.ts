// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));

import { BACK, useUnsavedChangesGuard } from "./use-unsaved-changes-guard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
type Guard = ReturnType<typeof useUnsavedChangesGuard>;
const report = vi.fn<(g: Guard) => void>();
// Called when the link's own (React-side) handler saw the click.
const onLink = vi.fn();
const latest = () => report.mock.calls.at(-1)![0];

function Probe({ dirty }: { dirty: boolean }) {
  report(useUnsavedChangesGuard(dirty));
  const follow = (e: { preventDefault: () => void }) => { e.preventDefault(); onLink(); };
  return createElement(
    "div",
    null,
    createElement("a", { id: "other", href: "/dashboard/bookings", onClick: follow }, "bookings"),
    createElement("a", { id: "same", href: window.location.pathname + "#faq", onClick: follow }, "faq"),
    createElement("a", { id: "external", href: "https://example.com/x", onClick: follow }, "ext"),
  );
}

const render = (dirty: boolean) => act(() => root.render(createElement(Probe, { dirty })));
const click = (id: string) => act(() => { container.querySelector<HTMLAnchorElement>(`#${id}`)!.click(); });
const unload = () => {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

beforeEach(() => {
  h.push.mockReset();
  report.mockReset();
  onLink.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useUnsavedChangesGuard", () => {
  it("lets everything through while nothing changed", () => {
    render(false);
    click("other");
    expect(onLink).toHaveBeenCalled();
    expect(latest().pendingHref).toBeNull();
    expect(unload()).toBe(false);
  });

  it("holds an in-app link to another page and asks, with unsaved edits", () => {
    render(true);
    click("other");
    expect(onLink).not.toHaveBeenCalled();
    expect(latest().pendingHref).toBe("/dashboard/bookings");
    expect(unload()).toBe(true);
  });

  it("leave() goes where the host clicked; stay() keeps them on the page", () => {
    render(true);
    click("other");
    act(() => latest().stay());
    expect(latest().pendingHref).toBeNull();
    expect(h.push).not.toHaveBeenCalled();

    click("other");
    act(() => latest().leave());
    expect(h.push).toHaveBeenCalledWith("/dashboard/bookings");
    expect(latest().pendingHref).toBeNull();
  });

  it("ignores in-page anchors and other sites", () => {
    render(true);
    click("same");
    expect(onLink).toHaveBeenCalled();
    onLink.mockReset();
    click("external");
    expect(onLink).toHaveBeenCalled();
    expect(latest().pendingHref).toBeNull();
  });

  it("stops guarding once the edits are saved", () => {
    render(true);
    render(false);
    click("other");
    expect(onLink).toHaveBeenCalled();
    expect(unload()).toBe(false);
  });
});

describe("useUnsavedChangesGuard: browser Back", () => {
  it("arms one guard entry while edits are unsaved, and none before", () => {
    const push = vi.spyOn(window.history, "pushState");
    render(false);
    expect(push).not.toHaveBeenCalled();
    render(true);
    render(true);
    expect(push).toHaveBeenCalledTimes(1);
    push.mockRestore();
  });

  it("asks on Back; Stay re-arms, Leave goes back for real", () => {
    const push = vi.spyOn(window.history, "pushState");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(true);

    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(latest().pendingHref).toBe(BACK);
    expect(push).toHaveBeenCalledTimes(1); // never re-pushed inside popstate

    act(() => latest().stay());
    expect(latest().pendingHref).toBeNull();
    expect(push).toHaveBeenCalledTimes(2);

    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    act(() => latest().leave());
    expect(back).toHaveBeenCalledTimes(1);
    expect(h.push).not.toHaveBeenCalled();
    push.mockRestore();
    back.mockRestore();
  });

  it("ignores Back once nothing is unsaved", () => {
    render(true);
    render(false);
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(latest().pendingHref).toBeNull();
  });
});
