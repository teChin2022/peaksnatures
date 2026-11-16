import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./route";
import { signIn, signOut } from "../../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));

function mockClient(hostUserId: string, staffRow: unknown = null) {
  return signIn(h, {
    tables: {
      // First call is the ownership read, second is the delete.
      promo_codes: [
        { data: { id: "pc-1", code: "SUMMER", homestay: { host: { id: "host-1", user_id: hostUserId, name: "Peaks" } } } },
        {},
      ],
      promo_redemptions: { data: [] },
      host_staff: { data: staffRow },
    },
  });
}

const del = async () =>
  readJson(
    await DELETE(makeRequest("/api/host/promo-codes/pc-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "pc-1" }),
    }),
  );

const deleted = (supabase: ReturnType<typeof mockClient>) =>
  supabase.calls
    .filter((c) => c.table === "promo_codes")
    .some((c) => (c.builder.delete as ReturnType<typeof vi.fn>).mock.calls.length > 0);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("DELETE /api/host/promo-codes/[id]", () => {
  it("lets the owner delete a code", async () => {
    const supabase = mockClient("user-1");
    expect((await del()).status).toBe(200);
    expect(deleted(supabase)).toBe(true);
  });

  // Staff logins (migration 081): user-1 is not the owner here, only a staff row can let it in.
  it("lets staff of the host delete a code", async () => {
    const supabase = mockClient("owner-9", { id: "staff-row" });
    expect((await del()).status).toBe(200);
    expect(supabase.builderFor("host_staff").eq).toHaveBeenCalledWith("host_id", "host-1");
    expect(deleted(supabase)).toBe(true);
  });

  it("refuses a login that is neither owner nor staff of this host", async () => {
    const supabase = mockClient("owner-9");
    expect((await del()).status).toBe(403);
    expect(deleted(supabase)).toBe(false);
  });

  it("turns away a signed-out caller", async () => {
    signOut(h);
    expect((await del()).status).toBe(401);
  });
});
