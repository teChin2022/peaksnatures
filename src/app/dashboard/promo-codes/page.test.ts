// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "../../../../test/helpers/supabase";

const h = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "th" }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/promo-codes", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: h.createClient }));
vi.mock("@/lib/history-log-client", () => ({ logClientEvent: vi.fn() }));

import PromoCodesPage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let supabase: SupabaseMock;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  supabase = createSupabaseMock({
    user: { id: "owner-1" },
    tables: {
      hosts: { data: { id: "host-1", name: "Doi" } },
      homestays: { data: { id: "hs-1", promo_codes_enabled: true } },
      promo_codes: { data: [] },
      promo_redemptions: { data: [] },
    },
  });
  h.createClient.mockReturnValue(supabase);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
const homestayWrites = () => supabase.calls.filter((c) => c.table === "homestays" && (c.builder.update as ReturnType<typeof vi.fn>).mock.calls.length > 0);

// One tap on the master switch used to turn every code off at once.
describe("PromoCodesPage: the master switch", () => {
  it("asks before turning all codes off, and writes nothing on cancel", async () => {
    await act(async () => root.render(createElement(PromoCodesPage)));
    await act(async () => {});

    await act(async () => button("masterStatusOn")!.click());
    expect(document.body.textContent).toContain("confirmOffTitle");
    expect(homestayWrites()).toHaveLength(0);

    await act(async () => button("confirmOffCancel")!.click());
    expect(homestayWrites()).toHaveLength(0);
  });

  it("turns them off once confirmed", async () => {
    await act(async () => root.render(createElement(PromoCodesPage)));
    await act(async () => {});

    await act(async () => button("masterStatusOn")!.click());
    await act(async () => button("confirmOffAction")!.click());
    const [write] = homestayWrites();
    expect((write.builder.update as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ promo_codes_enabled: false });
  });
});
