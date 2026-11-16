import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../test/helpers/supabase";

const h = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: h.createServiceRoleClient }));
vi.mock("@/lib/billing", () => ({ fetchPastDueHostIds: vi.fn(async () => new Set<string>()) }));

import sitemap from "./sitemap";

const goodStanding = { plan_type: "fixed_rate", plan_free_expires_at: null, wallet_balance: 0, wallet_credit_limit: 0, wallet_negative_since: null };

beforeEach(() => {
  h.createServiceRoleClient.mockReturnValue(
    createSupabaseMock({
      tables: {
        homestays: {
          data: [
            { slug: "approved-place", updated_at: "2026-11-01T00:00:00Z", host_id: "host-ok" },
            { slug: "pending-place", updated_at: "2026-11-01T00:00:00Z", host_id: "host-new" },
          ],
        },
        hosts: {
          data: [
            { id: "host-ok", status: "approved", ...goodStanding },
            { id: "host-new", status: "pending", ...goodStanding },
          ],
        },
      },
    }),
  );
});

describe("sitemap", () => {
  // F-14: a host nobody approved yet must not be advertised to search engines.
  it("lists an approved host's homestay and leaves out a pending host's", async () => {
    const urls = (await sitemap()).map((e) => e.url);

    expect(urls.some((u) => u.endsWith("/approved-place"))).toBe(true);
    expect(urls.some((u) => u.includes("pending-place"))).toBe(false);
  });
});
