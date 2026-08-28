import { describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../test/helpers/supabase";

const { createServiceRoleClient } = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient }));

const { resolveSlugRedirect } = await import("@/lib/slug-redirect");

describe("resolveSlugRedirect", () => {
  it("returns the homestay's current slug for a retired one", async () => {
    createServiceRoleClient.mockReturnValue(
      createSupabaseMock({
        tables: {
          homestay_slug_redirects: { data: { homestay_id: "h-1" } },
          homestays: { data: { slug: "doi-inthanon-retreat" } },
        },
      }),
    );

    await expect(resolveSlugRedirect("old-slug")).resolves.toBe("doi-inthanon-retreat");
  });

  it("returns null when the slug was never redirected", async () => {
    const supabase = createSupabaseMock({ tables: { homestay_slug_redirects: { data: null } } });
    createServiceRoleClient.mockReturnValue(supabase);

    await expect(resolveSlugRedirect("unknown-slug")).resolves.toBeNull();
    // Should not go looking for a homestay it has no id for.
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("returns null when the target homestay is gone or deactivated", async () => {
    createServiceRoleClient.mockReturnValue(
      createSupabaseMock({
        tables: {
          homestay_slug_redirects: { data: { homestay_id: "h-1" } },
          homestays: { data: null },
        },
      }),
    );

    await expect(resolveSlugRedirect("old-slug")).resolves.toBeNull();
  });

  it("looks the redirect up by old_slug and filters the homestay to active ones", async () => {
    const supabase = createSupabaseMock({
      tables: {
        homestay_slug_redirects: { data: { homestay_id: "h-1" } },
        homestays: { data: { slug: "current" } },
      },
    });
    createServiceRoleClient.mockReturnValue(supabase);

    await resolveSlugRedirect("old-slug");

    expect(supabase.builderFor("homestay_slug_redirects").eq).toHaveBeenCalledWith("old_slug", "old-slug");
    expect(supabase.builderFor("homestays").eq).toHaveBeenCalledWith("id", "h-1");
    expect(supabase.builderFor("homestays").eq).toHaveBeenCalledWith("is_active", true);
  });
});
