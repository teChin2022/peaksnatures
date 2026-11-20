// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../../../test/helpers/supabase";

const h = vi.hoisted(() => ({ createClient: vi.fn() }));
// Thai copy for the one word under test; every other key renders as itself.
vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => (key === "deleteConfirmWord" ? "ลบบัญชี" : key), { rich: (key: string) => key }),
  useLocale: () => "th",
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/profile", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: h.createClient }));
vi.mock("@/lib/history-log-client", () => ({ logClientEvent: vi.fn() }));

import ProfilePage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const PROFILE = {
  id: "host-1", name: "Doi", hasPinSet: false /* no PIN: the confirm step opens straight away */, masked: { email: "d***@x.com", phone: "08****5678", promptpay_id: "08****5678" },
  notification_preference: "sms", payment_display: "qr", require_otp: true,
};

beforeEach(async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  h.createClient.mockReturnValue(createSupabaseMock({ user: { id: "owner-1" } }));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => PROFILE }));
  await act(async () => root.render(createElement(ProfilePage)));
  await act(async () => {});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!;

async function type(value: string) {
  const input = container.querySelector<HTMLInputElement>("input[aria-labelledby=delete-confirm-instructions]")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

// Typing Latin "DELETE" on a Thai keyboard was the hurdle; the word is now in the host's language.
describe("ProfilePage: deleting the account", () => {
  it("unlocks only for the confirm word in the host's language", async () => {
    await act(async () => button("deleteAccount").click());
    const confirm = () => button("confirmDeleteAccount");

    await type("DELETE");
    expect(confirm().disabled).toBe(true);
    await type("ลบบัญชี");
    expect(confirm().disabled).toBe(false);
  });
});

// The profile route checks the session itself, so it does not wait for getUser().
describe("ProfilePage: loading", () => {
  it("asks for the profile without waiting for getUser()", async () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const client = createSupabaseMock({ user: { id: "owner-1" } });
    client.auth.getUser.mockReturnValue(new Promise(() => {}));
    h.createClient.mockReturnValue(client);
    // beforeEach already rendered the page with a signed-in user: start over.
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(createElement(ProfilePage)));
    expect(fetchMock).toHaveBeenCalledWith("/api/host/profile", expect.anything());
  });
});
