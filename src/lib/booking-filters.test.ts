import { describe, expect, it } from "vitest";
import { createQueryBuilder } from "../../test/helpers/supabase";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  applyBookingFilters,
  searchOrFilter,
  stayRange,
  type BookingFilters,
  type FilterableQuery,
} from "./booking-filters";

const f = (over: Partial<BookingFilters> = {}): BookingFilters => ({ ...DEFAULT_FILTERS, ...over });

function run(filters: BookingFilters, tab: "all" | "pending" | "confirmed" = "all", dcr: string[] = []) {
  const q = createQueryBuilder();
  applyBookingFilters(q as unknown as FilterableQuery<never>, filters, tab, "2026-11-18", dcr);
  const calls: [string, unknown[]][] = [];
  for (const m of ["eq", "neq", "in", "is", "gte", "lte", "or"]) {
    for (const args of (q[m] as { mock: { calls: unknown[][] } }).mock.calls) calls.push([m, args]);
  }
  return calls;
}

describe("searchOrFilter", () => {
  it("does not run below 3 characters", () => {
    expect(searchOrFilter("  ab ")).toBeNull();
  });

  it("matches name, email and phone", () => {
    expect(searchOrFilter("สมชาย")).toBe(
      "guest_name.ilike.%สมชาย%,guest_email.ilike.%สมชาย%,guest_phone.ilike.%สมชาย%",
    );
  });

  it("strips characters that would break the or=(…) syntax", () => {
    expect(searchOrFilter("สมชาย (ต้น), 100%")).toBe(
      "guest_name.ilike.%สมชาย ต้น 100%,guest_email.ilike.%สมชาย ต้น 100%,guest_phone.ilike.%สมชาย ต้น 100%",
    );
  });

  it("searches a dashed or +66 phone as stored digits", () => {
    expect(searchOrFilter("081-234-5678")).toContain("guest_phone.ilike.%0812345678%");
    expect(searchOrFilter("+66 81 234 5678")).toContain("guest_phone.ilike.%0812345678%");
  });

  it("matches a booking or cart code by uuid prefix", () => {
    const s = searchOrFilter("A1B2C3D4")!;
    expect(s).toContain("and(id.gte.a1b2c3d4-0000-0000-0000-000000000000,id.lte.a1b2c3d4-ffff-ffff-ffff-ffffffffffff)");
    expect(s).toContain("and(group_id.gte.a1b2c3d4-0000-0000-0000-000000000000,group_id.lte.a1b2c3d4-ffff-ffff-ffff-ffffffffffff)");
  });

  it("reads the code as copied off a card", () => {
    expect(searchOrFilter("ID: a1b2c3d4…")).toContain("id.gte.a1b2c3d4-0000-0000-0000-000000000000");
  });

  it("matches a whole uuid exactly", () => {
    const id = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    expect(searchOrFilter(id)).toContain(`and(id.gte.${id},id.lte.${id})`);
  });

  it("adds no code range for a name", () => {
    expect(searchOrFilter("Somchai")).not.toContain("id.gte");
  });
});

describe("stayRange", () => {
  const today = "2026-11-18";
  it("covers today, the next 7 days and this month", () => {
    expect(stayRange(f({ stay: "today" }), today)).toEqual({ from: today, to: today });
    expect(stayRange(f({ stay: "next7" }), today)).toEqual({ from: today, to: "2026-11-24" });
    expect(stayRange(f({ stay: "this_month" }), today)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });

  it("ends February and year-end on the right day", () => {
    expect(stayRange(f({ stay: "this_month" }), "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(stayRange(f({ stay: "next7" }), "2026-12-28")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
  });

  it("takes a custom range with either end open", () => {
    expect(stayRange(f({ stay: "custom", stayFrom: "2026-12-01" }), today)).toEqual({ from: "2026-12-01", to: undefined });
  });
});

describe("applyBookingFilters", () => {
  it("adds nothing for the defaults on All", () => {
    expect(run(f())).toEqual([]);
  });

  it("filters every quick booking, or one source", () => {
    expect(run(f({ source: "quick" }))).toEqual([["neq", ["booking_source", "guest"]]]);
    expect(run(f({ source: "agoda" }))).toEqual([["eq", ["booking_source", "agoda"]]]);
    expect(run(f({ source: "web" }))).toEqual([["eq", ["booking_source", "guest"]]]);
  });

  it("maps needs-action and quick-pending statuses", () => {
    expect(run(f({ status: "needs_action" }))).toEqual([["in", ["status", ["pending", "verified"]]]]);
    expect(run(f({ status: "quick_pending" }))).toEqual([
      ["eq", ["status", "pending"]],
      ["eq", ["booking_source", "guest"]],
      ["eq", ["easyslip_verified", false]],
      ["is", ["payment_slip_hash", null]],
    ]);
  });

  it("lets the tab own status on Pending and Confirmed", () => {
    expect(run(f({ status: "cancelled" }), "confirmed")).toEqual([["eq", ["status", "confirmed"]]]);
    expect(run(f({ status: "cancelled" }), "pending")).toEqual([["in", ["status", ["pending", "verified"]]]]);
  });

  it("keeps date-change bookings in the Pending tab", () => {
    expect(run(f(), "pending", ["b-1", "b-2"])).toEqual([["or", ["status.in.(pending,verified),id.in.(b-1,b-2)"]]]);
  });

  it("filters check-in dates, house and search together", () => {
    expect(run(f({ stay: "next7", roomId: "room-1", search: "Somchai" }))).toEqual([
      ["eq", ["room_id", "room-1"]],
      ["gte", ["check_in", "2026-11-18"]],
      ["lte", ["check_in", "2026-11-24"]],
      ["or", [searchOrFilter("Somchai")]],
    ]);
  });
});

describe("activeFilterCount", () => {
  it("counts narrowing filters, not sort, and status only on All", () => {
    expect(activeFilterCount(f({ sort: "check_in" }), "all")).toBe(0);
    expect(activeFilterCount(f({ status: "cancelled", source: "agoda" }), "all")).toBe(2);
    expect(activeFilterCount(f({ status: "cancelled", source: "agoda" }), "pending")).toBe(1);
    expect(activeFilterCount(f({ stay: "custom" }), "all")).toBe(0);
    expect(activeFilterCount(f({ search: "ab" }), "all")).toBe(0);
  });
});
