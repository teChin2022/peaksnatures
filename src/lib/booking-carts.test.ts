import { describe, expect, it } from "vitest";
import {
  cartActionTargets,
  cartMoney,
  groupIntoCarts,
  housesDiffer,
  mergeById,
} from "@/lib/booking-carts";

interface Row {
  id: string;
  group_id: string | null;
  room_name: string;
  status: string;
  cancelled_by: string | null;
  check_in: string;
  check_out: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  easyslip_verified: boolean;
  total_price: number;
  discount_amount: number | null;
  amount_paid: number;
  payment_type: string;
}

const row = (over: Partial<Row> = {}): Row => ({
  id: "b-1",
  group_id: null,
  room_name: "House A",
  status: "confirmed",
  cancelled_by: null,
  check_in: "2026-11-12",
  check_out: "2026-11-14",
  checked_in_at: null,
  checked_out_at: null,
  easyslip_verified: true,
  total_price: 2000,
  discount_amount: 0,
  amount_paid: 2000,
  payment_type: "full",
  ...over,
});

const ids = (carts: Row[][]) => carts.map((cart) => cart.map((b) => b.id));

describe("groupIntoCarts", () => {
  it("leaves single bookings alone, in order", () => {
    const carts = groupIntoCarts([row({ id: "s-1" }), row({ id: "s-2" }), row({ id: "s-3" })]);
    expect(ids(carts)).toEqual([["s-1"], ["s-2"], ["s-3"]]);
  });

  it("puts a cart's houses on one card at its first row's position, whatever order they arrive in", () => {
    const carts = groupIntoCarts([
      row({ id: "s-1" }),
      row({ id: "g-b", group_id: "g", room_name: "House B" }),
      row({ id: "s-2" }),
      row({ id: "g-a", group_id: "g", room_name: "House A" }),
    ]);
    expect(ids(carts)).toEqual([["s-1"], ["g-a", "g-b"], ["s-2"]]);
  });

  it("orders the same house booked twice by id, so the order never flips", () => {
    const carts = groupIntoCarts([
      row({ id: "g-2", group_id: "g", room_name: "House A" }),
      row({ id: "g-1", group_id: "g", room_name: "House A" }),
    ]);
    expect(ids(carts)).toEqual([["g-1", "g-2"]]);
  });
});

describe("cartMoney", () => {
  it("is the row's own money for a single booking", () => {
    expect(cartMoney([row({ total_price: 3000, discount_amount: 200, amount_paid: 500, payment_type: "deposit" })]))
      .toEqual({ total: 3000, discount: 200, paid: 500, deposit: true });
  });

  // /api/bookings/group splits one ฿1,000 deposit by price: ฿667 and ฿333.
  it("adds a split deposit back up to what the guest paid", () => {
    const money = cartMoney([
      row({ total_price: 6000, amount_paid: 667, payment_type: "deposit" }),
      row({ total_price: 3000, amount_paid: 333, payment_type: "deposit" }),
    ]);
    expect(money).toEqual({ total: 9000, discount: 0, paid: 1000, deposit: true });
  });

  it("still reads as a deposit after one house's balance is paid", () => {
    const money = cartMoney([
      row({ total_price: 6000, amount_paid: 6000, payment_type: "full" }),
      row({ total_price: 3000, amount_paid: 333, payment_type: "deposit" }),
    ]);
    expect(money).toEqual({ total: 9000, discount: 0, paid: 6333, deposit: true });
  });

  it("is no longer a deposit once every house is paid", () => {
    const money = cartMoney([
      row({ total_price: 6000, amount_paid: 6000, payment_type: "full" }),
      row({ total_price: 3000, amount_paid: 3000, payment_type: "full" }),
    ]);
    expect(money.deposit).toBe(false);
    expect(money.paid).toBe(money.total);
  });

  it("adds up each house's share of a promo", () => {
    const money = cartMoney([
      row({ total_price: 5800, discount_amount: 200 }),
      row({ total_price: 2900, discount_amount: null }),
      row({ total_price: 0, discount_amount: 100 }),
    ]);
    expect(money.total).toBe(8700);
    expect(money.discount).toBe(300);
  });
});

describe("housesDiffer", () => {
  it("is false for a single booking and for a cart whose houses match", () => {
    expect(housesDiffer([row()])).toBe(false);
    expect(housesDiffer([row({ id: "a" }), row({ id: "b", room_name: "House B", total_price: 900 })])).toBe(false);
  });

  it("is true when the guest cancelled one house", () => {
    expect(housesDiffer([row(), row({ status: "cancelled", cancelled_by: "Nok" })])).toBe(true);
  });

  it("is true when one house's dates were changed", () => {
    expect(housesDiffer([row(), row({ check_out: "2026-11-15" })])).toBe(true);
  });

  it("is true when one house has checked in and the other has not", () => {
    expect(housesDiffer([row({ checked_in_at: "2026-11-12T08:00:00Z" }), row()])).toBe(true);
  });

  it("ignores when each house checked in, only whether it did", () => {
    expect(
      housesDiffer([row({ checked_in_at: "2026-11-12T08:00:00Z" }), row({ checked_in_at: "2026-11-12T08:05:00Z" })]),
    ).toBe(false);
  });
});

describe("cartActionTargets", () => {
  const now = new Date("2026-11-14T12:00:00Z");

  it("confirms an unverified pending cart through its first house", () => {
    const cart = [
      row({ id: "a", status: "pending", easyslip_verified: false }),
      row({ id: "b", status: "pending", easyslip_verified: false }),
    ];
    const { pending, confirmed, completable } = cartActionTargets(cart, now);
    expect(pending?.id).toBe("a");
    expect(confirmed).toBeNull();
    expect(completable).toEqual([]);
  });

  it("offers nothing on a pending cart whose slip was verified", () => {
    expect(cartActionTargets([row({ status: "verified", easyslip_verified: true })], now)).toEqual({
      pending: null,
      confirmed: null,
      completable: [],
    });
  });

  it("completes every confirmed house past check-out, leaving one that stays longer", () => {
    const cart = [
      row({ id: "a", check_out: "2026-11-14" }),
      row({ id: "b", check_out: "2026-11-16" }),
      row({ id: "c", check_out: "2026-11-13" }),
    ];
    const { pending, confirmed, completable } = cartActionTargets(cart, now);
    expect(pending).toBeNull();
    expect(confirmed?.id).toBe("a");
    expect(completable.map((b) => b.id)).toEqual(["a", "c"]);
  });

  it("offers no Mark completed before check-out", () => {
    expect(cartActionTargets([row({ check_out: "2026-11-15" })], now).completable).toEqual([]);
  });

  it("lets pending win over confirmed, so there is only one Cancel", () => {
    const { pending, confirmed } = cartActionTargets(
      [row({ id: "a" }), row({ id: "b", status: "pending", easyslip_verified: false })],
      now,
    );
    expect(pending?.id).toBe("b");
    expect(confirmed).toBeNull();
  });

  it("offers nothing on a cancelled or completed cart", () => {
    expect(cartActionTargets([row({ status: "cancelled" }), row({ status: "completed" })], now)).toEqual({
      pending: null,
      confirmed: null,
      completable: [],
    });
  });
});

describe("mergeById", () => {
  it("appends only the rows it does not hold, keeping the first copy", () => {
    const first = row({ id: "a", status: "confirmed" });
    const merged = mergeById([first], [row({ id: "a", status: "cancelled" }), row({ id: "b" }), row({ id: "b" })]);
    expect(merged.map((b) => b.id)).toEqual(["a", "b"]);
    expect(merged[0]).toBe(first);
  });
});
