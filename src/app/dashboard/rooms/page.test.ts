// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../../../test/helpers/supabase";

const h = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "th" }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/rooms", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: h.createClient }));
vi.mock("@/lib/history-log-client", () => ({ logClientEvent: vi.fn() }));

import Page from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function render(tables: Record<string, { data?: unknown; error?: unknown }>) {
  h.createClient.mockReturnValue(createSupabaseMock({ user: { id: "owner-1" }, tables: { hosts: { data: { id: "host-1", name: "Doi" } }, ...tables } }));
  await act(async () => root.render(createElement(Page)));
  await act(async () => {});
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// A failed load used to show "no houses yet, add your first one".
describe("RoomsPage: when loading fails", () => {
  it("says the page did not load, not that there are no houses", async () => {
    await render({ homestays: { data: { id: "hs-1" } }, rooms: { error: { message: "boom" } } });
    expect(container.querySelector("[role=alert]")).not.toBeNull();
    expect(container.textContent).not.toContain("noRooms");
  });

  it("still shows the empty state when there really are no houses", async () => {
    await render({ homestays: { data: { id: "hs-1" } }, rooms: { data: [] } });
    expect(container.querySelector("[role=alert]")).toBeNull();
  });
});
