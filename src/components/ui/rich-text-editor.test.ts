// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RichTextEditor } from "./rich-text-editor";

/**
 * Smoke test for the tiptap editor hosts write descriptions in. Added with the
 * tiptap 3.26 -> 3.34 upgrade (audit: @tiptap/core and prosemirror-view
 * advisories), which nothing else covered: the dashboard has no E2E spec.
 */

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

async function render(value: string, onChange = vi.fn()) {
  await act(async () => {
    root.render(createElement(RichTextEditor, { value, onChange }));
  });
  // immediatelyRender: false mounts the editor after the first effect.
  await act(async () => {});
  return onChange;
}

const button = (title: string) => container.querySelector<HTMLButtonElement>(`button[title="${title}"]`)!;

describe("RichTextEditor", () => {
  it("shows the saved description in an editable area", async () => {
    await render("<p>Mountain view</p>");

    const editable = container.querySelector('[contenteditable="true"]');
    expect(editable).not.toBeNull();
    expect(editable!.innerHTML).toContain("Mountain view");
  });

  it("renders the formatting toolbar", async () => {
    await render("<p>Mountain view</p>");
    expect(["Bold", "Italic", "Bullet List"].map((t) => !!button(t))).toEqual([true, true, true]);
  });

  it("swaps in a new value from outside without echoing it back", async () => {
    const onChange = vi.fn();
    await render("<p>One</p>", onChange);

    await act(async () => {
      root.render(createElement(RichTextEditor, { value: "<p>Two</p>", onChange }));
    });

    expect(container.querySelector('[contenteditable="true"]')!.innerHTML).toContain("Two");
    expect(onChange).not.toHaveBeenCalled();
  });
});
