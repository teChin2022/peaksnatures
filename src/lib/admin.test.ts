import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../test/helpers/supabase";

const { createServiceRoleClient } = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient }));

/** The 60s cache lives at module scope, so each case uses its own user id. */
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

  it("serves a repeat check from cache instead of hitting the database again", async () => {
    const supabase = createSupabaseMock({ tables: { platform_admins: { data: { id: "a" } } } });
    createServiceRoleClient.mockReturnValue(supabase);
    const isAdmin = await loadIsAdmin();

    await isAdmin("user-cached");
    await isAdmin("user-cached");
    await isAdmin("user-cached");

    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("caches a negative answer too", async () => {
    const supabase = createSupabaseMock({ tables: { platform_admins: { data: null } } });
    createServiceRoleClient.mockReturnValue(supabase);
    const isAdmin = await loadIsAdmin();

    await expect(isAdmin("user-neg-cached")).resolves.toBe(false);
    await expect(isAdmin("user-neg-cached")).resolves.toBe(false);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("caches per user, not globally", async () => {
    const supabase = createSupabaseMock({
      tables: { platform_admins: [{ data: { id: "a" } }, { data: null }] },
    });
    createServiceRoleClient.mockReturnValue(supabase);
    const isAdmin = await loadIsAdmin();

    await expect(isAdmin("user-a")).resolves.toBe(true);
    await expect(isAdmin("user-b")).resolves.toBe(false);
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  it("re-checks once the 60 second cache entry expires", async () => {
    const supabase = createSupabaseMock({
      tables: { platform_admins: [{ data: { id: "a" } }, { data: null }] },
    });
    createServiceRoleClient.mockReturnValue(supabase);
    const isAdmin = await loadIsAdmin();

    await expect(isAdmin("user-ttl")).resolves.toBe(true);
    vi.advanceTimersByTime(59_000);
    await expect(isAdmin("user-ttl")).resolves.toBe(true); // still cached
    expect(supabase.from).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2_000); // past the 60s TTL
    await expect(isAdmin("user-ttl")).resolves.toBe(false); // revoked in the DB
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });
});
