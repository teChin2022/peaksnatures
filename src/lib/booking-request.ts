/**
 * The request the booking form sends to create a booking: one house goes to
 * /api/bookings, several to /api/bookings/group. Pure and import-free, so the
 * form, the route tests and a payload contract test share one definition — the
 * routes' schemas live in the routes, and this is the only place that has to
 * agree with them.
 */

/**
 * What the routes are told about payment: an EasySlip result (verified or not),
 * or `quick` for a guest quick booking, which sends no slip and lets the server
 * decide the status (lib/quick-booking.ts).
 */
export interface BookingSlipFields {
  slip_hash?: string;
  slip_trans_ref?: string | null;
  payment_slip_url?: string | null;
  easyslip_response?: unknown;
  easyslip_verified: boolean;
  quick?: boolean;
  turnstile_token?: string;
}

export interface BookingRequestLine {
  roomId: string;
  numGuests: number;
  tierIds: string[];
  optionIds: string[];
}

export interface BookingRequestInput<L extends BookingRequestLine = BookingRequestLine> {
  homestayId: string;
  guest: { name: string; email: string; phone: string; province: string; note: string };
  checkIn: string;
  checkOut: string;
  lines: L[];
  /** A house's price before any cart-level discount: the cart route re-verifies it. */
  lineGross: (line: L) => number;
  optionsForLine: (optionIds: string[]) => { id: string; name: string; price: number }[];
  totalPrice: number;
  paymentType: "full" | "deposit";
  paymentAmount: number;
  promoCodeId?: string;
  sessionId: string;
  locale: string;
  slip: BookingSlipFields;
}

export type BookingRequest =
  | { url: "/api/bookings"; body: Record<string, unknown> }
  | { url: "/api/bookings/group"; body: Record<string, unknown> };

export function buildBookingRequest<L extends BookingRequestLine>(i: BookingRequestInput<L>): BookingRequest {
  const guest = {
    guest_name: i.guest.name,
    guest_email: i.guest.email,
    guest_phone: i.guest.phone,
    guest_province: i.guest.province || undefined,
    notes: i.guest.note || undefined,
  };

  if (i.lines.length === 1) {
    const line = i.lines[0];
    return {
      url: "/api/bookings",
      body: {
        homestay_id: i.homestayId,
        room_id: line.roomId,
        ...guest,
        check_in: i.checkIn,
        check_out: i.checkOut,
        num_guests: line.numGuests,
        guest_pricing_ids: line.tierIds.length > 0 ? line.tierIds : undefined,
        total_price: i.totalPrice,
        payment_type: i.paymentType,
        amount_paid: i.paymentAmount,
        ...i.slip,
        session_id: i.sessionId,
        locale: i.locale,
        selected_options: i.optionsForLine(line.optionIds),
        promo_code_id: i.promoCodeId || undefined,
      },
    };
  }

  return {
    url: "/api/bookings/group",
    body: {
      homestay_id: i.homestayId,
      ...guest,
      locale: i.locale,
      payment_type: i.paymentType,
      promo_code_id: i.promoCodeId || undefined,
      session_id: i.sessionId,
      ...i.slip,
      items: i.lines.map((line) => ({
        room_id: line.roomId,
        check_in: i.checkIn,
        check_out: i.checkOut,
        num_guests: line.numGuests,
        guest_pricing_ids: line.tierIds.length > 0 ? line.tierIds : undefined,
        selected_options: i.optionsForLine(line.optionIds),
        total_price: i.lineGross(line),
      })),
    },
  };
}
