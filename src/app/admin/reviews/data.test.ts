import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type QueryResponse } from "../../../../test/helpers/supabase";

const h = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: h.createServiceRoleClient,
}));

import { getAdminReviews } from "./data";

const withReviews = (response: QueryResponse) => {
  const sc = createSupabaseMock({ tables: { reviews: response } });
  h.createServiceRoleClient.mockReturnValue(sc);
  return sc;
};
const review = (id: string, rating: number, photos: string[] | null = []) => ({
  id,
  created_at: "2026-11-18T03:00:00Z",
  guest_name: "Nok",
  rating,
  comment: "Lovely",
  would_return: "yes",
  photos,
  homestay: { name: "Cozy", host_id: "h1" },
});

beforeEach(() => h.createServiceRoleClient.mockReset());

describe("getAdminReviews", () => {
  it("reads the newest reviews first", async () => {
    const sc = withReviews({ data: [] });
    await getAdminReviews();
    expect(sc.builderFor("reviews").order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("averages ratings and counts the low ones", async () => {
    withReviews({ data: [review("a", 5), review("b", 2), review("c", 1), review("d", 4)] });
    const { average, low, reviews } = await getAdminReviews();
    expect(average).toBe(3);
    expect(low).toBe(2);
    expect(reviews).toHaveLength(4);
  });

  it("flattens the homestay and counts photos without sending their URLs", async () => {
    withReviews({ data: [review("a", 5, ["p1.jpg", "p2.jpg"]), { ...review("b", 4, null), homestay: null }] });
    const { reviews } = await getAdminReviews();
    expect(reviews[0]).toMatchObject({ photo_count: 2, homestay_name: "Cozy", host_id: "h1" });
    expect(reviews[0]).not.toHaveProperty("photos");
    expect(reviews[1]).toMatchObject({ photo_count: 0, homestay_name: null, host_id: null });
  });

  it("has no average without reviews", async () => {
    withReviews({ data: [] });
    expect(await getAdminReviews()).toEqual({ reviews: [], average: null, low: 0 });
  });
});
