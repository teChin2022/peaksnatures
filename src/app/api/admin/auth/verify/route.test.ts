import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createSupabaseMock } from "../../../../../../test/helpers/supabase";
import { readJson } from "../../../../../../test/helpers/request";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

const admin = { id: "admin-1", name: "Root", email: "root@peaksnature.com" };

const signedIn = (adminRow: unknown, user: { id: string } | null = { id: "user-1" }) => {
  mocks.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user }));
  const sc = createSupabaseMock({ tables: { platform_admins: { data: adminRow } } });
  mocks.createServiceRoleClient.mockReturnValue(sc);
  return sc;
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  signedIn(admin);
});

describe("POST /api/admin/auth/verify", () => {
  it("identifies the signed-in platform admin", async () => {
    await expect(readJson(await POST())).resolves.toEqual({ status: 200, body: { admin } });
  });

  it("looks the admin up by their auth user id", async () => {
    const sc = signedIn(admin);
    await POST();
    expect(sc.builderFor("platform_admins").eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("refuses an anonymous caller", async () => {
    signedIn(admin, null);
    await expect(readJson(await POST())).resolves.toEqual({ status: 401, body: { error: "Unauthorized" } });
  });

  it("refuses a caller whose session errored", async () => {
    mocks.createServerSupabaseClient.mockResolvedValue(
      createSupabaseMock({ user: null, authError: { message: "expired" } }),
    );
    expect((await POST()).status).toBe(401);
  });

  it("refuses a signed-in user who is not an admin", async () => {
    signedIn(null);
    await expect(readJson(await POST())).resolves.toEqual({
      status: 403,
      body: { error: "Not a platform admin" },
    });
  });

  it("reports 500 when something unexpected throws", async () => {
    mocks.createServerSupabaseClient.mockRejectedValue(new Error("no database"));
    await expect(readJson(await POST())).resolves.toEqual({
      status: 500,
      body: { error: "Something went wrong" },
    });
  });
});
