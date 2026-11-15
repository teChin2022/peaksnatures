import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

import { navKeyFor } from "@/components/dashboard/sidebar";

describe("navKeyFor (the phone top bar's page title)", () => {
  it("names the overview only on its own path", () => {
    expect(navKeyFor("/dashboard")).toBe("overview");
  });

  it("names a section and its sub-pages", () => {
    expect(navKeyFor("/dashboard/bookings")).toBe("bookings");
    expect(navKeyFor("/dashboard/rooms/123")).toBe("rooms");
    expect(navKeyFor("/dashboard/promo-codes")).toBe("promoCodes");
  });

  it("names nothing off the menu, so the bar falls back to the brand", () => {
    expect(navKeyFor("/dashboard/pending")).toBeNull();
    expect(navKeyFor("/dashboard/guide")).toBeNull();
  });
});
