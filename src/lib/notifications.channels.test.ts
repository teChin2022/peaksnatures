import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildGroupBookingMessage,
  dispatchGroupHostNotification,
  notifyAdminsNewHostRegistration,
  sendBookingConfirmationEmail,
  sendBookingStatusUpdateEmail,
  sendDateChangeEmailToGuest,
  sendDateChangeLineNotification,
  sendGroupBookingConfirmationEmail,
  sendGroupHostLineNotification,
  sendGroupHostSmsNotification,
  sendHostApprovalEmail,
  sendHostCancellationLineNotification,
  sendHostLineNotification,
  sendHostRejectionEmail,
  sendRecommenderPromoUsedNotification,
  type GroupBookingDetails,
} from "@/lib/notifications";
import {
  makeBooking,
  makeBookingGroup,
  makeHomestay,
  makeHost,
  makePromoCode,
  makeRoom,
} from "../../test/fixtures/db";
import type { Booking, Host } from "@/types/database";

const { resendSend, localizeStrings, supabaseFrom } = vi.hoisted(() => ({
  resendSend: vi.fn(),
  localizeStrings: vi.fn(),
  supabaseFrom: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));
vi.mock("@/lib/translation/localize-strings", () => ({ localizeStrings }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: supabaseFrom }) }));

const LINE_ENDPOINT = "https://api.line.me/v2/bot/message/push";
const SMS_ENDPOINT = "https://console.sms-kub.com/api/messages";

const okResponse = () =>
  ({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve("{}") }) as unknown as Response;
const lineError = () =>
  ({ ok: false, status: 401, json: () => Promise.resolve({ message: "Invalid token" }) }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

const lineHost = (over: Partial<Host> = {}) =>
  makeHost({ line_channel_access_token: "line-token", line_user_id: "U123", ...over });

const details = (booking: Partial<Booking> = {}, host: Host = lineHost()) => ({
  booking: makeBooking(booking),
  homestay: makeHomestay(),
  host,
  room: makeRoom(),
});

const groupDetails = (over: Partial<GroupBookingDetails> = {}): GroupBookingDetails => ({
  group: makeBookingGroup(),
  homestay: makeHomestay(),
  host: lineHost(),
  items: [
    { booking: makeBooking({ id: "b-1", total_price: 2000 }), room: makeRoom({ name: "Pine House" }) },
    { booking: makeBooking({ id: "b-2", total_price: 2000 }), room: makeRoom({ id: "room-2", name: "Oak House" }) },
  ],
  ...over,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("RESEND_API_KEY", "resend-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "");
  vi.stubEnv("SMS_KUB_API_KEY", "sms-key");
  fetchMock = vi.fn(() => Promise.resolve(okResponse()));
  vi.stubGlobal("fetch", fetchMock);
  resendSend.mockResolvedValue({ data: { id: "email-1" }, error: null });
  localizeStrings.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/**
 * Every Resend-backed email shares this contract, so assert it once per function.
 * `inspectsResendError` marks whether the function surfaces an error the Resend
 * API returns in its body (as opposed to only catching a thrown exception).
 */
function describeGuestEmail(
  name: string,
  send: () => Promise<unknown>,
  recipient: string,
  inspectsResendError = true,
) {
  describe(name, () => {
    it("sends through Resend to the guest", async () => {
      await expect(send()).resolves.toMatchObject({ success: true });
      expect(resendSend).toHaveBeenCalledWith(
        expect.objectContaining({ from: "Peaksnature <onboarding@resend.dev>" }),
      );
      const sent = resendSend.mock.calls[0][0] as { to: string | string[]; subject: string; html: string };
      expect(Array.isArray(sent.to) ? sent.to : [sent.to]).toContain(recipient);
      expect(sent.subject).toBeTruthy();
      expect(sent.html).toContain("<");
    });

    it("no-ops in demo mode when Resend is not configured", async () => {
      vi.stubEnv("RESEND_API_KEY", "");
      await expect(send()).resolves.toEqual({ success: true, demo: true });
      expect(resendSend).not.toHaveBeenCalled();
    });

    it(
      inspectsResendError
        ? "reports an error returned by Resend"
        : // KNOWN GAP: this sender ignores the error field Resend returns and only
          // catches thrown exceptions, so an API-level rejection reads as success.
          // Pinned deliberately and flagged for review.
          "reports success even when Resend returns an error in its body",
      async () => {
        resendSend.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
        await expect(send()).resolves.toMatchObject({ success: inspectsResendError ? false : true });
      },
    );

    it("reports an exception rather than throwing", async () => {
      resendSend.mockRejectedValue(new Error("network down"));
      await expect(send()).resolves.toMatchObject({ success: false });
    });
  });
}

describeGuestEmail(
  "sendBookingConfirmationEmail",
  () => sendBookingConfirmationEmail(details()),
  "guest@example.com",
);
describeGuestEmail(
  "sendBookingStatusUpdateEmail",
  () => sendBookingStatusUpdateEmail(details(), "confirmed"),
  "guest@example.com",
);
describeGuestEmail(
  "sendDateChangeEmailToGuest",
  () =>
    sendDateChangeEmailToGuest(details(), "approved", "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 3000),
  "guest@example.com",
);
describeGuestEmail(
  "sendHostApprovalEmail",
  () => sendHostApprovalEmail("new@host.com", "Somchai"),
  "new@host.com",
  false,
);
describeGuestEmail(
  "sendHostRejectionEmail",
  () => sendHostRejectionEmail("new@host.com", "Somchai"),
  "new@host.com",
  false,
);
describeGuestEmail(
  "sendGroupBookingConfirmationEmail",
  () => sendGroupBookingConfirmationEmail(groupDetails()),
  "guest@example.com",
);

describe("guest email content", () => {
  it("writes a Thai email by default and an English one on request", async () => {
    await sendBookingConfirmationEmail(details(), "th");
    const thai = resendSend.mock.calls[0][0] as { html: string };
    expect(thai.html).toContain("2569"); // Buddhist Era year

    resendSend.mockClear();
    await sendBookingConfirmationEmail(details(), "en");
    const english = resendSend.mock.calls[0][0] as { html: string };
    expect(english.html).toContain("2026");
  });

  it("translates homestay details for an English email", async () => {
    localizeStrings.mockResolvedValue({
      homestayName: "Doi Inthanon Retreat (EN)",
      homestayLocation: "Chiang Mai (EN)",
      roomName: "Pine House (EN)",
    });

    await sendBookingConfirmationEmail(details(), "en");

    expect(localizeStrings).toHaveBeenCalledWith("email:homestay:homestay-1", expect.any(Object), "en");
    expect((resendSend.mock.calls[0][0] as { html: string }).html).toContain("Doi Inthanon Retreat (EN)");
  });

  it("does not call the translator for a Thai email", async () => {
    await sendBookingConfirmationEmail(details(), "th");
    expect(localizeStrings).not.toHaveBeenCalled();
  });

  it("keeps the original text when a translation is missing", async () => {
    localizeStrings.mockResolvedValue({});
    await sendBookingConfirmationEmail(details(), "en");
    expect((resendSend.mock.calls[0][0] as { html: string }).html).toContain("Doi Inthanon Retreat");
  });

  it("lists the chosen extras with per-night and per-stay pricing", async () => {
    await sendBookingConfirmationEmail(
      details({
        selected_options: [
          { id: "a", name: "Breakfast", price: 500, unit_price: 250, pricing_type: "per_night" },
          { id: "b", name: "BBQ", price: 800, pricing_type: "per_time" },
          { id: "c", name: "Legacy", price: 100 },
        ],
      }),
    );

    const html = (resendSend.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain("Breakfast");
    expect(html).toContain("฿250");
    expect(html).toContain("BBQ");
    expect(html).toContain("Legacy");
  });

  it("distinguishes a pending booking from a confirmed one", async () => {
    await sendBookingConfirmationEmail(details(), "th", "pending");
    const pending = (resendSend.mock.calls[0][0] as { html: string }).html;
    expect(pending).toContain("ไม่สามารถตรวจสอบอัตโนมัติ");
  });

  it("explains a cancellation and its reason to the guest", async () => {
    await sendBookingStatusUpdateEmail(details(), "cancelled", "th", "ห้องไม่ว่างแล้ว");
    const html = (resendSend.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain("ห้องไม่ว่างแล้ว");
  });

  it("omits the reason block when the host gave none", async () => {
    await sendBookingStatusUpdateEmail(details(), "cancelled", "th");
    expect((resendSend.mock.calls[0][0] as { html: string }).html).not.toContain("เหตุผล:");
  });

  it("tells the guest their date change was rejected, with the reason", async () => {
    await sendDateChangeEmailToGuest(
      details(), "rejected", "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 3000, "th", "เต็มแล้ว",
    );
    expect((resendSend.mock.calls[0][0] as { html: string }).html).toContain("เต็มแล้ว");
  });

  it("mentions a room change and the payment breakdown when supplied", async () => {
    await sendDateChangeEmailToGuest(
      details(), "approved", "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 3500, "th",
      undefined,
      { oldRoomName: "Pine House", newRoomName: "Oak House" },
      "Oak House",
      {
        oldTotalPrice: 2000,
        priceDifference: 1500,
        amountPaid: 2000,
        additionalPayment: 1500,
        newAmountPaid: 3500,
        remainingBalance: 0,
      },
    );

    const html = (resendSend.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain("Oak House");
    expect(html).toContain("Pine House");
  });
});

describe("LINE host notifications", () => {
  const pushCases: Array<[string, () => Promise<{ success: boolean; error?: unknown }>]> = [
    ["sendHostLineNotification", () => sendHostLineNotification(details())],
    ["sendHostCancellationLineNotification", () => sendHostCancellationLineNotification(details())],
    [
      "sendDateChangeLineNotification",
      () =>
        sendDateChangeLineNotification(
          details(), "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 1000, 3000,
        ),
    ],
    ["sendGroupHostLineNotification", () => sendGroupHostLineNotification(groupDetails())],
  ];

  it.each(pushCases)("%s pushes to the host's LINE account", async (_name, send) => {
    await expect(send()).resolves.toEqual({ success: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(LINE_ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer line-token");
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe("U123");
    expect(body.messages[0].type).toBe("text");
    expect(body.messages[0].text).toBeTruthy();
  });

  it.each(pushCases)("%s reports a LINE rejection", async (_name, send) => {
    fetchMock.mockResolvedValue(lineError());
    await expect(send()).resolves.toMatchObject({ success: false });
  });

  it.each(pushCases)("%s reports a network failure rather than throwing", async (_name, send) => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(send()).resolves.toMatchObject({ success: false });
  });

  it("does not push when the host has not connected LINE", async () => {
    const noLine = makeHost({ line_channel_access_token: null, line_user_id: null });
    const expected = { success: false, error: "Host LINE credentials not configured" };

    await expect(sendHostLineNotification(details({}, noLine))).resolves.toEqual(expected);
    await expect(sendHostCancellationLineNotification(details({}, noLine))).resolves.toEqual(expected);
    await expect(
      sendGroupHostLineNotification(groupDetails({ host: noLine })),
    ).resolves.toEqual(expected);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks an unverified booking as needing review in the LINE message", async () => {
    await sendHostLineNotification(details(), "flagged");
    const text = JSON.parse(fetchMock.mock.calls[0][1].body as string).messages[0].text;
    expect(text).toContain("รอตรวจสอบ");
  });
});

describe("buildGroupBookingMessage", () => {
  it("summarises every house in the cart", () => {
    const message = buildGroupBookingMessage(groupDetails());

    expect(message).toContain("🎉 การจองใหม่ (2 หลัง) — ยืนยันแล้ว!");
    expect(message).toContain("Pine House");
    expect(message).toContain("Oak House");
    expect(message).toContain("Nok Suwan");
  });

  it("flags an unverified cart", () => {
    expect(buildGroupBookingMessage(groupDetails(), "flagged")).toContain("รอตรวจสอบ");
  });

  it("shows the outstanding balance for a deposit cart", () => {
    const message = buildGroupBookingMessage(
      groupDetails({ group: makeBookingGroup({ payment_type: "deposit", amount_paid: 1000, total_price: 4000 }) }),
    );
    expect(message).toContain("มัดจำ");
  });

  it("handles a cart line whose room is unknown", () => {
    const message = buildGroupBookingMessage(
      groupDetails({ items: [{ booking: makeBooking(), room: undefined }] }),
    );
    expect(message).toContain("Standard");
  });
});

describe("group host SMS and dispatch", () => {
  it("packs the cart into a single SMS segment", async () => {
    await expect(sendGroupHostSmsNotification(groupDetails())).resolves.toEqual({ success: true });
    const message = JSON.parse(fetchMock.mock.calls[0][1].body as string).message;
    expect(message.length).toBeLessThanOrEqual(70);
    expect(fetchMock.mock.calls[0][0]).toBe(SMS_ENDPOINT);
  });

  it("marks an unverified cart as awaiting review", async () => {
    await sendGroupHostSmsNotification(groupDetails(), "flagged");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).message).toContain("รอตรวจสอบ");
  });

  it("does not send without a host phone number", async () => {
    await expect(
      sendGroupHostSmsNotification(groupDetails({ host: lineHost({ phone: null }) })),
    ).resolves.toEqual({ success: false, error: "Host phone not set" });
  });

  it("retries the preferred channel then falls back to email", async () => {
    vi.useFakeTimers();
    const sms = vi.fn().mockResolvedValue({ success: false });

    const promise = dispatchGroupHostNotification(groupDetails(), sms, vi.fn(), "New cart", () => "body");
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(sms).toHaveBeenCalledTimes(3);
    expect(resendSend).toHaveBeenCalledWith(expect.objectContaining({ subject: "New cart" }));
  });

  it("uses LINE when the host prefers it, and skips email on success", async () => {
    const line = vi.fn().mockResolvedValue({ success: true });
    const sms = vi.fn();

    await dispatchGroupHostNotification(
      groupDetails({ host: lineHost({ notification_preference: "line" }) }),
      sms, line, "New cart", () => "body",
    );

    expect(line).toHaveBeenCalledTimes(1);
    expect(sms).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });
});

describe("sendRecommenderPromoUsedNotification", () => {
  const args = (over = {}) => ({
    promo: makePromoCode({ code: "ANN10", recommender_phone: "0899999999" }),
    bookingId: "booking-1",
    guestName: "Nok Suwan",
    discountAmount: 200,
    commissionAmount: 100,
    ...over,
  });

  it("texts the recommender what they earned", async () => {
    await expect(sendRecommenderPromoUsedNotification(args())).resolves.toEqual({ success: true });

    const message = JSON.parse(fetchMock.mock.calls[0][1].body as string).message;
    expect(message).toContain("ANN10");
    expect(message).toContain("Nok Suwan");
    expect(message).toContain("฿100");
  });

  it("writes the message in English on request", async () => {
    await sendRecommenderPromoUsedNotification(args(), "en");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).message).toContain("Code ANN10 used by");
  });

  it("skips when the recommender has no phone number", async () => {
    const promo = makePromoCode({ code: "ANN10", recommender_phone: null });
    await expect(sendRecommenderPromoUsedNotification(args({ promo }))).resolves.toEqual({
      success: true,
      skipped: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips when there is no commission to report", async () => {
    await expect(sendRecommenderPromoUsedNotification(args({ commissionAmount: 0 }))).resolves.toEqual({
      success: true,
      skipped: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("notifyAdminsNewHostRegistration", () => {
  const info = { hostName: "Somchai", hostEmail: "new@host.com" };
  const admins = (rows: unknown[]) => {
    supabaseFrom.mockReturnValue({ select: () => Promise.resolve({ data: rows, error: null }) });
  };

  it("emails and LINE-pushes every admin", async () => {
    admins([
      { email: "admin@peaksnature.com", line_user_id: "U-admin", line_channel_access_token: "admin-token" },
    ]);

    await notifyAdminsNewHostRegistration({ ...info, appUrl: "https://peaksnature.com" });

    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: "admin@peaksnature.com" }),
    );
    const linePush = fetchMock.mock.calls.find((c) => c[0] === LINE_ENDPOINT);
    expect(linePush).toBeDefined();
    const text = JSON.parse(linePush![1].body as string).messages[0].text;
    expect(text).toContain("Somchai");
    expect(text).toContain("https://peaksnature.com/admin/hosts?status=pending");
  });

  it("falls back to the configured app URL for the review link", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fallback.test");
    admins([{ email: null, line_user_id: "U-admin", line_channel_access_token: "admin-token" }]);

    await notifyAdminsNewHostRegistration(info);

    const linePush = fetchMock.mock.calls.find((c) => c[0] === LINE_ENDPOINT);
    expect(JSON.parse(linePush![1].body as string).messages[0].text).toContain("https://fallback.test");
  });

  it("omits the link when no app URL is known", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    admins([{ email: null, line_user_id: "U-admin", line_channel_access_token: "admin-token" }]);

    await notifyAdminsNewHostRegistration(info);

    const linePush = fetchMock.mock.calls.find((c) => c[0] === LINE_ENDPOINT);
    expect(JSON.parse(linePush![1].body as string).messages[0].text).not.toContain("🔗");
  });

  it("does nothing when there are no admins", async () => {
    admins([]);
    await notifyAdminsNewHostRegistration(info);
    expect(resendSend).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips email when Resend is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    admins([{ email: "admin@peaksnature.com", line_user_id: null, line_channel_access_token: null }]);

    await notifyAdminsNewHostRegistration(info);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("skips an admin who has not connected LINE", async () => {
    admins([{ email: "admin@peaksnature.com", line_user_id: null, line_channel_access_token: null }]);

    await notifyAdminsNewHostRegistration(info);
    expect(fetchMock.mock.calls.filter((c) => c[0] === LINE_ENDPOINT)).toHaveLength(0);
  });

  it("never throws when the lookup or a send fails", async () => {
    supabaseFrom.mockImplementation(() => {
      throw new Error("no database");
    });
    await expect(notifyAdminsNewHostRegistration(info)).resolves.toBeUndefined();

    admins([{ email: "admin@peaksnature.com", line_user_id: "U", line_channel_access_token: "t" }]);
    resendSend.mockRejectedValue(new Error("resend down"));
    fetchMock.mockRejectedValue(new Error("line down"));
    await expect(notifyAdminsNewHostRegistration(info)).resolves.toBeUndefined();
  });
});

/**
 * The email bodies are large templates whose every line branches on locale and
 * on the booking's shape. This sweep walks each sender through both locales and
 * every variant so a change to the Thai copy cannot silently break the English
 * one (or vice versa).
 */
describe("email template sweep across locales and variants", () => {
  const locales = ["th", "en"] as const;
  const withOptions = {
    selected_options: [
      { id: "a", name: "Breakfast", price: 500, unit_price: 250, pricing_type: "per_night" },
      { id: "b", name: "BBQ", price: 800, pricing_type: "per_time" },
      { id: "c", name: "Legacy", price: 100 },
    ],
  };

  const htmlOf = () => (resendSend.mock.calls.at(-1)![0] as { html: string }).html;

  beforeEach(() => {
    // Exercise the from-address normalisation inside each sender too.
    vi.stubEnv("RESEND_FROM_EMAIL", `"Peaks" <book @peaksnature.com>`);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://peaksnature.com");
  });

  describe.each(locales)("in %s", (locale) => {
    it.each(["confirmed", "pending"] as const)("sends a %s booking confirmation", async (type) => {
      await expect(sendBookingConfirmationEmail(details(), locale, type)).resolves.toMatchObject({ success: true });
      expect(htmlOf()).toBeTruthy();
      expect(resendSend.mock.calls.at(-1)![0]).toMatchObject({ from: "Peaks <book@peaksnature.com>" });
    });

    it.each([
      ["full payment", { payment_type: "full", amount_paid: 2000 }],
      ["deposit", { payment_type: "deposit", amount_paid: 500 }],
    ] as const)("renders a booking paid by %s, with extras", async (_label, payment) => {
      await sendBookingConfirmationEmail(details({ ...payment, ...withOptions }), locale);
      expect(htmlOf()).toContain("Breakfast");
    });

    it("renders a booking with a guest composition and a province", async () => {
      await sendBookingConfirmationEmail(
        details({ guest_province: "chiang_mai", guest_pricing_label: "ผู้ใหญ่ 4 เด็ก 2", num_guests: 6 }),
        locale,
      );
      expect(htmlOf()).toBeTruthy();
    });

    it("renders a booking whose room is unknown", async () => {
      const noRoom = { ...details(), room: undefined };
      await sendBookingConfirmationEmail(noRoom, locale);
      expect(htmlOf()).toBeTruthy();
    });

    it.each(["confirmed", "cancelled"] as const)("sends a %s status update", async (status) => {
      await expect(sendBookingStatusUpdateEmail(details(), status, locale)).resolves.toMatchObject({ success: true });
      expect(htmlOf()).toBeTruthy();
    });

    it("sends a cancellation with a reason and a deposit refund", async () => {
      await sendBookingStatusUpdateEmail(
        details({ payment_type: "deposit", amount_paid: 500, ...withOptions }),
        "cancelled",
        locale,
        "Fully booked",
      );
      expect(htmlOf()).toBeTruthy();
    });

    it.each(["approved", "rejected"] as const)("sends a %s date change", async (status) => {
      await expect(
        sendDateChangeEmailToGuest(
          details(), status, "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 3000, locale, "Not available",
        ),
      ).resolves.toMatchObject({ success: true });
      expect(htmlOf()).toBeTruthy();
    });

    it("sends an approved date change with a room swap and payment breakdown", async () => {
      await sendDateChangeEmailToGuest(
        details(), "approved", "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 3500, locale,
        undefined,
        { oldRoomName: "Pine House", newRoomName: "Oak House" },
        "Oak House",
        {
          oldTotalPrice: 2000,
          priceDifference: 1500,
          amountPaid: 2000,
          additionalPayment: 1500,
          newAmountPaid: 3500,
          remainingBalance: 500,
        },
      );
      expect(htmlOf()).toContain("Oak House");
    });

    it("sends an approved date change that costs less, with nothing outstanding", async () => {
      await sendDateChangeEmailToGuest(
        details(), "approved", "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-11", 1000, locale,
        undefined, undefined, undefined,
        {
          oldTotalPrice: 2000,
          priceDifference: -1000,
          amountPaid: 2000,
          additionalPayment: 0,
          newAmountPaid: 2000,
          remainingBalance: 0,
        },
      );
      expect(htmlOf()).toBeTruthy();
    });

    it.each(["confirmed", "pending"] as const)("sends a %s group confirmation", async (type) => {
      await expect(sendGroupBookingConfirmationEmail(groupDetails(), locale, type)).resolves.toMatchObject({
        success: true,
      });
      expect(htmlOf()).toBeTruthy();
    });

    it("sends a group confirmation paid by deposit, with extras and no room", async () => {
      await sendGroupBookingConfirmationEmail(
        groupDetails({
          group: makeBookingGroup({ payment_type: "deposit", amount_paid: 1000, discount_amount: 300 }),
          items: [
            { booking: makeBooking({ id: "b-1", ...withOptions }), room: makeRoom() },
            { booking: makeBooking({ id: "b-2" }), room: undefined },
          ],
        }),
        locale,
      );
      expect(htmlOf()).toBeTruthy();
    });
  });

  it("translates group email content only for English", async () => {
    localizeStrings.mockResolvedValue({ homestayName: "Retreat (EN)", room_0: "Pine (EN)" });

    await sendGroupBookingConfirmationEmail(groupDetails(), "en");
    expect(localizeStrings).toHaveBeenCalled();

    localizeStrings.mockClear();
    await sendGroupBookingConfirmationEmail(groupDetails(), "th");
    expect(localizeStrings).not.toHaveBeenCalled();
  });

  it.each(["", "https://peaksnature.com"])(
    "sends host approval and rejection emails with app URL %s",
    async (appUrl) => {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", appUrl);
      await expect(sendHostApprovalEmail("new@host.com", "Somchai")).resolves.toMatchObject({ success: true });
      await expect(sendHostRejectionEmail("new@host.com", "Somchai")).resolves.toMatchObject({ success: true });
    },
  );
});
