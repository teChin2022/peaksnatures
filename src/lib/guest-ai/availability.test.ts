import { describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../../test/helpers/supabase";

const h = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: h.createServiceRoleClient,
}));

import { isGuestAiAvailable } from "./availability";

const wire = (platform: unknown, host: unknown) =>
  h.createServiceRoleClient.mockReturnValue(
    createSupabaseMock({ tables: { platform_guest_ai_config: { data: platform }, host_ai_settings: { data: host } } }),
  );

describe("isGuestAiAvailable", () => {
  it("is true only with the platform on and the host approved and on", async () => {
    wire({ enabled: true }, { status: "approved", enabled: true });
    await expect(isGuestAiAvailable("h1")).resolves.toBe(true);
  });

  it.each([
    ["platform off", { enabled: false }, { status: "approved", enabled: true }],
    ["host switch off", { enabled: true }, { status: "approved", enabled: false }],
    ["host suspended", { enabled: true }, { status: "suspended", enabled: true }],
    ["never asked", { enabled: true }, null],
    ["before migration 085", null, { status: "approved", enabled: true }],
  ])("is false when %s", async (_, platform, host) => {
    wire(platform, host);
    await expect(isGuestAiAvailable("h1")).resolves.toBe(false);
  });

  it("is false when the read throws", async () => {
    h.createServiceRoleClient.mockImplementation(() => {
      throw new Error("down");
    });
    await expect(isGuestAiAvailable("h1")).resolves.toBe(false);
  });
});
