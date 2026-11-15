import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../test/helpers/supabase";

const { createServiceRoleClient } = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient }));

async function loadIsAdmin() {
  return (await import("@/lib/admin")).isAdmin;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isAdmin", () => {
  it("is true when the user has a platform_admins row", async () => {
    createServiceRoleClient.mockReturnValue(
      createSupabaseMock({ tables: { platform_admins: { data: { id: "admin-row" } } } }),
    );
    await expect((await loadIsAdmin())("user-yes")).resolves.toBe(true);
  });

  it("is false when the user has no platform_admins row", async () => {
    createServiceRoleClient.mockReturnValue(
      createSupabaseMock({ tables: { platform_admins: { data: null } } }),
    );
    await expect((await loadIsAdmin())("user-no")).resolves.toBe(false);
  });

  it("is false when the lookup errors, rather than granting access", async () => {
    createServiceRoleClient.mockReturnValue(
      createSupabaseMock({ tables: { platform_admins: { data: null, error: { message: "boom" } } } }),
    );
    await expect((await loadIsAdmin())("user-error")).resolves.toBe(false);
  });

  it("queries platform_admins by user_id", async () => {
    const supabase = createSupabaseMock({ tables: { platform_admins: { data: { id: "a" } } } });
    createServiceRoleClient.mockReturnValue(supabase);

    await (await loadIsAdmin())("user-query");

    expect(supabase.from).toHaveBeenCalledWith("platform_admins");
    expect(supabase.builderFor("platform_admins").eq).toHaveBeenCalledWith("user_id", "user-query");
  });

  // L-03: a 60-second cache let a removed admin keep their access for up to a
  // minute per server instance. Every check now reads the table.
  it("refuses an admin on the very next check after their row is removed", async () => {
    const supabase = createSupabaseMock({
      tables: { platform_admins: [{ data: { id: "a" } }, { data: null }] },
    });
    createServiceRoleClient.mockReturnValue(supabase);
    const isAdmin = await loadIsAdmin();

    await expect(isAdmin("user-revoked")).resolves.toBe(true);
    await expect(isAdmin("user-revoked")).resolves.toBe(false);
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });
});
