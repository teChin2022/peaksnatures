import { describe, expect, it } from "vitest";
import { buildBookingRequest, type BookingRequestInput, type BookingSlipFields } from "@/lib/booking-request";

const line = (roomId: string, over: Partial<{ numGuests: number; tierIds: string[]; optionIds: string[] }> = {}) => ({
  roomId,
  numGuests: 2,
  tierIds: [],
  optionIds: [],
  ...over,
});

const verified: BookingSlipFields = {
  slip_hash: "a".repeat(64),
  slip_trans_ref: "TR123",
  payment_slip_url: "pending/x/slip.jpg",
  easyslip_response: { ok: true },
  easyslip_verified: true,
};

const input = (over: Partial<BookingRequestInput> = {}): BookingRequestInput => ({
  homestayId: "homestay-1",
  guest: { name: "Nok Suwan", email: "guest@example.com", phone: "0898765432", province: "", note: "" },
  checkIn: "2026-01-12",
  checkOut: "2026-01-14",
  lines: [line("room-a")],
  lineGross: () => 2000,
  optionsForLine: (ids) => ids.map((id) => ({ id, name: `Option ${id}`, price: 100 })),
  totalPrice: 2000,
  paymentType: "full",
  paymentAmount: 2000,
  sessionId: "session-1",
  locale: "th",
  slip: verified,
  ...over,
});

/** What actually crosses the wire: JSON drops every `undefined`. */
const wire = (r: { body: Record<string, unknown> }) => JSON.parse(JSON.stringify(r.body));

describe("buildBookingRequest", () => {
  describe("one house", () => {
    it("goes to /api/bookings with the stay, the guest and the verified slip", () => {
      const r = buildBookingRequest(input());

      expect(r.url).toBe("/api/bookings");
      expect(wire(r)).toEqual({
        homestay_id: "homestay-1",
        room_id: "room-a",
        guest_name: "Nok Suwan",
        guest_email: "guest@example.com",
        guest_phone: "0898765432",
        check_in: "2026-01-12",
        check_out: "2026-01-14",
        num_guests: 2,
        total_price: 2000,
        payment_type: "full",
        amount_paid: 2000,
        slip_hash: "a".repeat(64),
        slip_trans_ref: "TR123",
        payment_slip_url: "pending/x/slip.jpg",
        easyslip_response: { ok: true },
        easyslip_verified: true,
        session_id: "session-1",
        locale: "th",
        selected_options: [],
      });
    });

    it("carries province, note, tiers, options and a promo only when there are some", () => {
      const r = buildBookingRequest(
        input({
          guest: { name: "Nok", email: "n@example.com", phone: "0898765432", province: "chiang-mai", note: "late arrival" },
          lines: [line("room-a", { tierIds: ["t1"], optionIds: ["o1"] })],
          promoCodeId: "promo-1",
        }),
      );
      expect(wire(r)).toMatchObject({
        guest_province: "chiang-mai",
        notes: "late arrival",
        guest_pricing_ids: ["t1"],
        selected_options: [{ id: "o1", name: "Option o1", price: 100 }],
        promo_code_id: "promo-1",
      });
    });

    it("leaves out province, note, tiers and promo when empty", () => {
      const body = wire(buildBookingRequest(input()));
      for (const key of ["guest_province", "notes", "guest_pricing_ids", "promo_code_id"]) {
        expect(body).not.toHaveProperty(key);
      }
    });
  });

  describe("several houses", () => {
    const cart = input({ lines: [line("room-a"), line("room-b", { optionIds: ["o1"] })], lineGross: (l) => (l.roomId === "room-a" ? 2000 : 2500) });

    it("goes to /api/bookings/group with one item per house and the shared slip", () => {
      const r = buildBookingRequest(cart);

      expect(r.url).toBe("/api/bookings/group");
      expect(wire(r)).toEqual({
        homestay_id: "homestay-1",
        guest_name: "Nok Suwan",
        guest_email: "guest@example.com",
        guest_phone: "0898765432",
        locale: "th",
        payment_type: "full",
        session_id: "session-1",
        slip_hash: "a".repeat(64),
        slip_trans_ref: "TR123",
        payment_slip_url: "pending/x/slip.jpg",
        easyslip_response: { ok: true },
        easyslip_verified: true,
        items: [
          { room_id: "room-a", check_in: "2026-01-12", check_out: "2026-01-14", num_guests: 2, selected_options: [], total_price: 2000 },
          { room_id: "room-b", check_in: "2026-01-12", check_out: "2026-01-14", num_guests: 2, selected_options: [{ id: "o1", name: "Option o1", price: 100 }], total_price: 2500 },
        ],
      });
    });

    it("sends no cart total or amount: the route computes both", () => {
      const body = wire(buildBookingRequest(cart));
      expect(body).not.toHaveProperty("total_price");
      expect(body).not.toHaveProperty("amount_paid");
    });
  });

  describe("a guest quick booking", () => {
    const quick: BookingSlipFields = { easyslip_verified: false, quick: true, turnstile_token: "tok" };

    it.each([
      ["one house", input({ slip: quick })],
      ["several houses", input({ slip: quick, lines: [line("room-a"), line("room-b")] })],
    ])("sends no slip at all for %s, only the quick flag and the Turnstile token", (_label, i) => {
      const body = wire(buildBookingRequest(i));

      expect(body).toMatchObject({ quick: true, easyslip_verified: false, turnstile_token: "tok" });
      for (const key of ["slip_hash", "slip_trans_ref", "payment_slip_url", "easyslip_response"]) {
        expect(body).not.toHaveProperty(key);
      }
    });

    it("omits the token when Turnstile could not run", () => {
      const body = wire(buildBookingRequest(input({ slip: { easyslip_verified: false, quick: true } })));
      expect(body).not.toHaveProperty("turnstile_token");
    });

    it("asks for the deposit when the guest chose one", () => {
      const body = wire(buildBookingRequest(input({ slip: quick, paymentType: "deposit", paymentAmount: 500 })));
      expect(body).toMatchObject({ payment_type: "deposit", amount_paid: 500 });
    });
  });

  it("never marks a normal booking as quick", () => {
    expect(wire(buildBookingRequest(input()))).not.toHaveProperty("quick");
  });
});
