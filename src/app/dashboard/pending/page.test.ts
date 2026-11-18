// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ signOut: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/history-log-client", () => ({ logClientEvent: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: () => Promise.resolve({ data: { user: null } }), signOut: h.signOut } }),
}));

import PendingApprovalPage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("PendingApprovalPage", () => {
  it("signs out only this browser, not every device of the login", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(PendingApprovalPage)));

    await act(async () => container.querySelector("button")?.click());
    expect(h.signOut).toHaveBeenCalledWith({ scope: "local" });

    act(() => root.unmount());
    container.remove();
  });
});
