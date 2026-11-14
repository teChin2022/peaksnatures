import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "./route";
import { EventType } from "@/lib/history-log";
import { buildBookingRequest, type BookingSlipFields } from "@/lib/booking-request";
import { createSupabaseMock, type QueryResponse } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

// Scope: the slip/verification rules and the guest quick booking gate this
// route shares with POST /api/bookings. Per-room pricing is verifyRoomLineItem's
// job and is tested in lib/booking-pricing*.test.ts, so it is stubbed here.

const h = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  revalidateTag: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  logEvent: vi.fn(),
  deductCommission: vi.fn(),
  getHostBlockState: vi.fn(),
  isHostBlocked: vi.fn(),
  verifyRoomLineItem: vi.fn(),
  loadGroupBookingDetails: vi.fn(),
  deleteBookingDraft: vi.fn(),
  sendGroupBookingConfirmationEmail: vi.fn(),
  sendGroupQuickBookingEmail: vi.fn(),
  sendGroupHostSmsNotification: vi.fn(),
  sendGroupHostLineNotification: vi.fn(),
  dispatchGroupHostNotification: vi.fn(),
  buildGroupBookingMessage: vi.fn(),
  rateLimitCheck: vi.fn(),
  verifyTurnstileToken: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: h.createServiceRoleClient }));
vi.mock("next/cache", () => ({ revalidateTag: h.revalidateTag }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => {
    h.afterCallbacks.push(cb);
  },
}));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: h.logEvent,
}));
vi.mock("@/lib/billing", () => ({
  deductCommission: h.deductCommission,
  getHostBlockState: h.getHostBlockState,
}));
vi.mock("@/lib/plan-expiry", () => ({ isHostBlocked: h.isHostBlocked }));
vi.mock("@/lib/booking-pricing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/booking-pricing")>()),
  verifyRoomLineItem: h.verifyRoomLineItem,
}));
vi.mock("@/lib/booking-group-details", () => ({ loadGroupBookingDetails: h.loadGroupBookingDetails }));
vi.mock("@/lib/booking-draft-server", () => ({ deleteBookingDraft: h.deleteBookingDraft }));
vi.mock("@/lib/notifications", () => ({
  sendGroupBookingConfirmationEmail: h.sendGroupBookingConfirmationEmail,
  sendGroupQuickBookingEmail: h.sendGroupQuickBookingEmail,
  sendGroupHostLineNotification: h.sendGroupHostLineNotification,
  sendGroupHostSmsNotification: h.sendGroupHostSmsNotification,
  dispatchGroupHostNotification: h.dispatchGroupHostNotification,
  buildGroupBookingMessage: h.buildGroupBookingMessage,
  sendRecommenderPromoUsedNotification: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ createRateLimiter: () => ({ check: h.rateLimitCheck }) }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstileToken: h.verifyTurnstileToken }));

const uuid = (n: number) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;
const HOMESTAY_ID = uuid(1);
const ROOM_A = uuid(2);
const ROOM_B = uuid(3);
const GROUP_ID = "group-created";
const MEMBERS = [
  { id: "member-a", group_id: GROUP_ID, room_id: ROOM_A },
  { id: "member-b", group_id: GROUP_ID, room_id: ROOM_B },
];

const item = (room_id: string) => ({
  room_id,
  check_in: "2026-01-12",
  check_out: "2026-01-14",
  num_guests: 2,
});

const body = (over: Record<string, unknown> = {}) => ({
  homestay_id: HOMESTAY_ID,
  guest_name: "Nok Suwan",
  guest_email: "guest@example.com",
  guest_phone: "0898765432",
  payment_type: "full",
  slip_hash: "a".repeat(64),
  items: [item(ROOM_A), item(ROOM_B)],
  ...over,
});

/** A quick request carries no slip: the guest sends it to the host in chat. */
const quickBody = (over: Record<string, unknown> = {}) => body({ quick: true, slip_hash: undefined, ...over });

const homestay = (mode: string | undefined, deposit = 0) => ({
  host_id: "host-1",
  promo_codes_enabled: false,
  hosts: { deposit_amount: deposit, deposit_by_month: null, guest_booking_mode: mode },
});

/** `lookup` is the waiting-bookings check a quick request makes first. */
function mockClient(mode: string | undefined, lookup?: QueryResponse, deposit = 0) {
  const supabase = createSupabaseMock({
    tables: {
      homestays: { data: homestay(mode, deposit) },
      bookings: lookup ? [lookup, { data: MEMBERS }] : { data: MEMBERS },
      booking_groups: { data: { id: GROUP_ID } },
    },
    rpc: { create_booking_group_atomic: { data: GROUP_ID } },
  });
  h.createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

const post = (payload: unknown) => POST(makeRequest("/api/bookings/group", { body: payload }));
const runAfter = async () => {
  for (const cb of h.afterCallbacks.splice(0)) await cb();
};

const PENDING_RPC = {
  p_status: "pending",
  p_easyslip_verified: false,
  p_payment_slip_hash: null,
  p_slip_trans_ref: null,
  p_payment_slip_url: null,
  p_easyslip_response: null,
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.deductCommission.mockResolvedValue(undefined);
  h.logEvent.mockResolvedValue(undefined);
  h.deleteBookingDraft.mockResolvedValue(undefined);
  h.getHostBlockState.mockResolvedValue({ plan_type: "commission" });
  h.isHostBlocked.mockReturnValue(false);
  // The senders are stubbed; the details only need to exist for the fan-out to run.
  h.loadGroupBookingDetails.mockResolvedValue({ group: { id: GROUP_ID }, items: [{}, {}] });
  h.sendGroupBookingConfirmationEmail.mockResolvedValue(undefined);
  h.sendGroupQuickBookingEmail.mockResolvedValue(undefined);
  h.sendGroupHostSmsNotification.mockResolvedValue({ success: true });
  h.sendGroupHostLineNotification.mockResolvedValue({ success: true });
  h.buildGroupBookingMessage.mockReturnValue("message");
  // Invoke the channel callbacks the route hands over, so each closure runs.
  h.dispatchGroupHostNotification.mockImplementation(
    async (_d: unknown, sms: () => unknown, line: () => unknown, _subject: string, body: () => string) => {
      await sms();
      await line();
      body();
    },
  );
  h.rateLimitCheck.mockResolvedValue(null);
  h.verifyTurnstileToken.mockResolvedValue("pass");
  h.verifyRoomLineItem.mockImplementation(async (_s: unknown, _h: string, it: ReturnType<typeof item>) => ({
    ok: true,
    data: {
      room_id: it.room_id,
      check_in: it.check_in,
      check_out: it.check_out,
      nights: 2,
      num_guests: it.num_guests,
      base_price: 2000,
      options_total: 0,
      composition_surcharge: 0,
      gross: 2000,
      selected_options: [],
      guest_pricing_label: null,
      guest_pricing_surcharge: 0,
    },
  }));
  mockClient("normal");
});

describe("POST /api/bookings/group", () => {
  describe("a normal (slip-verified) booking", () => {
    it("creates the group confirmed and charges commission per member", async () => {
      const supabase = mockClient("normal");
      const { status } = await readJson(await post(body()));

      expect(status).toBe(201);
      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_group_atomic",
        expect.objectContaining({
          p_status: "confirmed",
          p_easyslip_verified: true,
          p_payment_slip_hash: "a".repeat(64),
          p_total_price: 4000,
          p_amount_paid: 4000,
          p_booking_source: "guest",
        }),
      );
      expect(h.deductCommission.mock.calls.map((c) => c[0])).toEqual(["member-a", "member-b"]);
      expect(h.revalidateTag).toHaveBeenCalledWith("admin-stats", "max");
    });

    it("keeps an unverified slip pending and charges nothing", async () => {
      const supabase = mockClient("normal");
      await post(body({ easyslip_verified: false }));

      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_group_atomic",
        expect.objectContaining({ p_status: "pending", p_easyslip_verified: false, p_payment_slip_hash: "a".repeat(64) }),
      );
      expect(h.deductCommission).not.toHaveBeenCalled();
    });

    it.each([
      ["an empty slip hash", { slip_hash: "" }],
      ["no slip hash on a normal booking", { slip_hash: undefined }],
      ["no rooms", { items: [] }],
    ])("refuses %s", async (_label, over) => {
      const supabase = mockClient("normal");
      const { status, body: result } = await readJson(await post(body(over)));
      expect(status).toBe(400);
      expect(result).toMatchObject({ error: "Invalid booking data" });
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("refuses a host who is soft-blocked", async () => {
      h.isHostBlocked.mockReturnValue(true);
      const supabase = mockClient("normal");
      await expect(readJson(await post(body()))).resolves.toEqual({
        status: 403,
        body: { error: "This homestay is temporarily unavailable for new bookings" },
      });
      expect(supabase.rpc).not.toHaveBeenCalled();
    });
  });

  describe("which flow the host has opened", () => {
    it("refuses a quick booking for a host on the normal flow", async () => {
      const supabase = mockClient("normal", { data: [] });
      await expect(readJson(await post(quickBody()))).resolves.toEqual({
        status: 403,
        body: { error: "Quick booking is not available for this homestay", code: "QUICK_NOT_ENABLED" },
      });
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("treats a host row without the column as normal", async () => {
      const supabase = mockClient(undefined, { data: [] });
      const { status, body: result } = await readJson(await post(quickBody()));
      expect(status).toBe(403);
      expect(result).toMatchObject({ code: "QUICK_NOT_ENABLED" });
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("refuses a normal booking for a host on quick only, even by direct POST", async () => {
      const supabase = mockClient("quick");
      await expect(readJson(await post(body()))).resolves.toEqual({
        status: 403,
        body: { error: "This homestay takes quick bookings only", code: "NORMAL_NOT_ENABLED" },
      });
      expect(supabase.rpc).not.toHaveBeenCalled();
      expect(h.deductCommission).not.toHaveBeenCalled();
    });

    it("still takes a normal booking from a host on both", async () => {
      const supabase = mockClient("both");
      expect((await post(body())).status).toBe(201);
      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_group_atomic",
        expect.objectContaining({ p_status: "confirmed" }),
      );
    });

    it("reads the mode in the same homestay query", async () => {
      const supabase = mockClient("quick", { data: [] });
      await post(quickBody());
      expect(supabase.builderFor("homestays").select).toHaveBeenCalledWith(
        expect.stringContaining("guest_booking_mode"),
      );
    });
  });

  describe("a quick booking", () => {
    it("is created pending with no slip on file and no commission", async () => {
      const supabase = mockClient("quick", { data: [] });
      const { status, body: result } = await readJson(await post(quickBody()));

      expect(status).toBe(201);
      expect(result).toMatchObject({ group: { id: GROUP_ID }, bookings: [{ id: "member-a" }, { id: "member-b" }] });
      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_group_atomic",
        expect.objectContaining({
          ...PENDING_RPC,
          p_total_price: 4000,
          p_amount_paid: 4000,
          p_booking_source: "guest",
          p_items: [
            expect.objectContaining({ room_id: ROOM_A }),
            expect.objectContaining({ room_id: ROOM_B }),
          ],
        }),
      );
      expect(h.deductCommission).not.toHaveBeenCalled();
    });

    it("works for a host on both", async () => {
      const supabase = mockClient("both", { data: [] });
      expect((await post(quickBody())).status).toBe(201);
      expect(supabase.rpc).toHaveBeenCalledWith("create_booking_group_atomic", expect.objectContaining(PENDING_RPC));
    });

    it("ignores any verification or slip the client sends with it", async () => {
      const supabase = mockClient("quick", { data: [] });
      await post(
        quickBody({
          easyslip_verified: true,
          slip_hash: "a".repeat(64),
          slip_trans_ref: "T123",
          payment_slip_url: "pending/x/slip.jpg",
          easyslip_response: { ok: true },
        }),
      );
      expect(supabase.rpc).toHaveBeenCalledWith("create_booking_group_atomic", expect.objectContaining(PENDING_RPC));
      expect(h.deductCommission).not.toHaveBeenCalled();
    });

    it("charges the host's deposit across the rooms when the guest chose one", async () => {
      const supabase = mockClient("quick", { data: [] }, 500);
      await post(quickBody({ payment_type: "deposit" }));
      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_group_atomic",
        expect.objectContaining({ ...PENDING_RPC, p_payment_type: "deposit", p_amount_paid: 1000 }),
      );
    });

    it("busts the availability cache but not the stats cache", async () => {
      mockClient("quick", { data: [] });
      await post(quickBody());
      expect(h.revalidateTag).toHaveBeenCalledWith(`booking-availability:${HOMESTAY_ID}`, "max");
      expect(h.revalidateTag).not.toHaveBeenCalledWith("admin-stats", "max");
    });

    it("is logged as created and flagged quick", async () => {
      mockClient("quick", { data: [] });
      await post(quickBody());
      await runAfter();
      expect(h.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EventType.BOOKING_CREATED,
          data: expect.objectContaining({ quick: true, room_count: 2 }),
        }),
      );
    });
  });

  describe("the request the booking form builds", () => {
    /** The form's own payload builder, through JSON like the real fetch. */
    const fromForm = (slip: BookingSlipFields) => {
      const request = buildBookingRequest({
        homestayId: HOMESTAY_ID,
        guest: { name: "Nok Suwan", email: "guest@example.com", phone: "0898765432", province: "", note: "" },
        checkIn: "2026-01-12",
        checkOut: "2026-01-14",
        lines: [
          { roomId: ROOM_A, numGuests: 2, tierIds: [], optionIds: [] },
          { roomId: ROOM_B, numGuests: 2, tierIds: [], optionIds: [] },
        ],
        lineGross: () => 2000,
        optionsForLine: () => [],
        totalPrice: 4000,
        paymentType: "full",
        paymentAmount: 4000,
        sessionId: "session-1",
        locale: "th",
        slip,
      });
      expect(request.url).toBe("/api/bookings/group");
      return JSON.parse(JSON.stringify(request.body));
    };

    it("is accepted as a quick booking: pending, no slip, no commission", async () => {
      const supabase = mockClient("quick", { data: [] });
      const res = await post(fromForm({ easyslip_verified: false, quick: true, turnstile_token: "tok" }));

      expect(res.status).toBe(201);
      expect(h.verifyTurnstileToken).toHaveBeenCalledWith("tok");
      expect(supabase.rpc).toHaveBeenCalledWith("create_booking_group_atomic", expect.objectContaining(PENDING_RPC));
      expect(h.deductCommission).not.toHaveBeenCalled();
    });

    it("is accepted as a quick booking when Turnstile could not run (no token sent)", async () => {
      h.verifyTurnstileToken.mockResolvedValue("skip");
      mockClient("both", { data: [] });
      expect((await post(fromForm({ easyslip_verified: false, quick: true }))).status).toBe(201);
    });

    it("is accepted as a verified normal booking, unchanged", async () => {
      const supabase = mockClient("normal");
      const res = await post(
        fromForm({ slip_hash: "a".repeat(64), slip_trans_ref: "TR1", payment_slip_url: null, easyslip_response: null, easyslip_verified: true }),
      );

      expect(res.status).toBe(201);
      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_group_atomic",
        expect.objectContaining({ p_status: "confirmed", p_easyslip_verified: true, p_payment_slip_hash: "a".repeat(64) }),
      );
    });
  });

  describe("who is told, and what", () => {
    it("sends the guest the quick-booking email, not the pending one", async () => {
      mockClient("quick", { data: [] });
      await post(quickBody());
      await runAfter();

      expect(h.sendGroupQuickBookingEmail).toHaveBeenCalledTimes(1);
      expect(h.sendGroupQuickBookingEmail).toHaveBeenCalledWith(expect.anything(), "th");
      expect(h.sendGroupBookingConfirmationEmail).not.toHaveBeenCalled();
    });

    it("tells the host in quick wording over their chosen channel, with a quick subject", async () => {
      mockClient("quick", { data: [] });
      await post(quickBody());
      await runAfter();

      expect(h.sendGroupHostSmsNotification).toHaveBeenCalledWith(expect.anything(), "quick");
      expect(h.sendGroupHostLineNotification).toHaveBeenCalledWith(expect.anything(), "quick");
      expect(h.buildGroupBookingMessage).toHaveBeenCalledWith(expect.anything(), "quick");
      expect(h.dispatchGroupHostNotification).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Function),
        expect.any(Function),
        expect.stringContaining("จองด่วน"),
        expect.any(Function),
      );
    });

    it("keeps the confirmation email and wording for a verified normal booking", async () => {
      mockClient("normal");
      await post(body());
      await runAfter();

      expect(h.sendGroupBookingConfirmationEmail).toHaveBeenCalledWith(expect.anything(), "th", "confirmed");
      expect(h.sendGroupQuickBookingEmail).not.toHaveBeenCalled();
      expect(h.sendGroupHostSmsNotification).toHaveBeenCalledWith(expect.anything(), "confirmed");
    });

    it("keeps the pending email and flagged wording for a slip that failed verification", async () => {
      mockClient("normal");
      await post(body({ easyslip_verified: false }));
      await runAfter();

      expect(h.sendGroupBookingConfirmationEmail).toHaveBeenCalledWith(expect.anything(), "th", "pending");
      expect(h.sendGroupQuickBookingEmail).not.toHaveBeenCalled();
      expect(h.sendGroupHostSmsNotification).toHaveBeenCalledWith(expect.anything(), "flagged");
    });
  });

  describe("abuse limits", () => {
    it("answers 429 from the rate limiter before touching the database", async () => {
      h.rateLimitCheck.mockResolvedValue(NextResponse.json({ error: "Too many requests." }, { status: 429 }));
      const supabase = mockClient("quick", { data: [] });

      expect((await post(quickBody())).status).toBe(429);
      expect(supabase.from).not.toHaveBeenCalled();
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("does not meter normal bookings", async () => {
      await post(body());
      expect(h.rateLimitCheck).not.toHaveBeenCalled();
    });

    it("refuses a token Cloudflare rejects, and fails open when it cannot be checked", async () => {
      h.verifyTurnstileToken.mockResolvedValue("fail");
      const supabase = mockClient("quick", { data: [] });
      await expect(readJson(await post(quickBody({ turnstile_token: "tok" })))).resolves.toEqual({
        status: 403,
        body: { error: "Verification failed", code: "TURNSTILE_FAILED" },
      });
      expect(h.verifyTurnstileToken).toHaveBeenCalledWith("tok");
      expect(supabase.rpc).not.toHaveBeenCalled();

      h.verifyTurnstileToken.mockResolvedValue("skip");
      mockClient("quick", { data: [] });
      expect((await post(quickBody())).status).toBe(201);
    });

    it("refuses a phone that already has two quick bookings waiting", async () => {
      const supabase = mockClient("quick", {
        data: [
          { id: "x1", group_id: null },
          { id: "x2", group_id: null },
        ],
      });
      await expect(readJson(await post(quickBody()))).resolves.toEqual({
        status: 429,
        body: {
          error: "You already have quick bookings waiting for the host to confirm",
          code: "TOO_MANY_PENDING",
        },
      });
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("counts a cart as one booking, however many houses it holds", async () => {
      mockClient("quick", {
        data: [
          { id: "m1", group_id: "g1" },
          { id: "m2", group_id: "g1" },
          { id: "m3", group_id: "g1" },
        ],
      });
      expect((await post(quickBody())).status).toBe(201);
    });

    it("counts only this phone's unpaid, slip-less guest bookings at this homestay", async () => {
      const supabase = mockClient("quick", { data: [] });
      await post(quickBody());

      const lookup = supabase.builderFor("bookings", 0);
      expect(lookup.eq).toHaveBeenCalledWith("homestay_id", HOMESTAY_ID);
      expect(lookup.eq).toHaveBeenCalledWith("guest_phone", "0898765432");
      expect(lookup.eq).toHaveBeenCalledWith("status", "pending");
      expect(lookup.eq).toHaveBeenCalledWith("easyslip_verified", false);
      expect(lookup.eq).toHaveBeenCalledWith("booking_source", "guest");
      expect(lookup.is).toHaveBeenCalledWith("payment_slip_hash", null);
    });

    it("fails open when the waiting-bookings lookup errors", async () => {
      mockClient("quick", { error: { message: "boom" } });
      expect((await post(quickBody())).status).toBe(201);
    });
  });
});
