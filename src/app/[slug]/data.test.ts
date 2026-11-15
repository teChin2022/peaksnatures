import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../../test/helpers/supabase";

const h = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: h.createServiceRoleClient }));
vi.mock("@/lib/billing", () => ({ hasPastDueInvoice: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/translation/translate-homestay", () => ({
  localizeHomestay: vi.fn(async (input: unknown) => input),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));

import { getHomestayData } from "./data";

const homestay = {
  id: "homestay-1",
  host_id: "host-1",
  slug: "retreat",
  name: "Retreat",
  description: "<p>Hi</p>",
  check_in_info: null,
  policies: null,
  is_active: true,
};

const host = (status: string) => ({
  id: "host-1",
  name: "Somchai",
  status,
  plan_type: "free",
  plan_free_expires_at: null,
  wallet_balance: 0,
  wallet_credit_limit: 0,
  wallet_negative_since: null,
});

function mockClient(status: string) {
  h.createServiceRoleClient.mockReturnValue(
    createSupabaseMock({
      tables: {
        homestays: { data: homestay },
        hosts: { data: host(status) },
        rooms: { data: [] },
        blocked_dates: { data: [] },
        bookings: { data: [] },
        reviews: { data: [] },
        promo_codes: { data: null },
      },
    }),
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getHomestayData: who is public", () => {
  it("serves the page of an approved host", async () => {
    mockClient("approved");
    expect(await getHomestayData("retreat", "th")).not.toBeNull();
  });

  // F-14: a newly registered host (pending) could publish a page that took
  // bookings and showed their PromptPay, before any admin approved them.
  it.each(["pending", "rejected", "suspended"])("treats a %s host's page as not found", async (status) => {
    mockClient(status);
    expect(await getHomestayData(`retreat-${status}`, "th")).toBeNull();
  });
});
