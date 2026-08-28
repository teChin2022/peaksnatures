import { describe, expect, it } from "vitest";
import {
  buildCancellationMessage,
  buildDateChangeMessage,
  buildNewBookingMessage,
  truncateForSms,
} from "@/lib/notifications";
import { makeBooking, makeHomestay, makeHost, makeRoom } from "../../test/fixtures/db";
import type { Booking, Room } from "@/types/database";

const details = (booking: Partial<Booking> = {}, room: Partial<Room> | null = {}) => ({
  booking: makeBooking(booking),
  homestay: makeHomestay(),
  host: makeHost(),
  room: room === null ? undefined : makeRoom(room),
});

describe("truncateForSms", () => {
  it("leaves a message that fits one segment alone", () => {
    expect(truncateForSms("สั้น")).toBe("สั้น");
    expect(truncateForSms("x".repeat(70))).toHaveLength(70);
  });

  it("cuts an oversized message down to the segment limit", () => {
    expect(truncateForSms("x".repeat(200))).toHaveLength(70);
  });

  it("honours a caller-supplied limit", () => {
    expect(truncateForSms("x".repeat(200), 134)).toHaveLength(134);
    expect(truncateForSms("short", 2)).toBe("sh");
  });

  it("handles an empty message", () => {
    expect(truncateForSms("")).toBe("");
  });
});

describe("buildNewBookingMessage", () => {
  it("announces a confirmed booking with the guest and stay details", () => {
    const message = buildNewBookingMessage(details());

    expect(message).toContain("🎉 การจองใหม่ — ยืนยันแล้ว!");
    expect(message).toContain("✅ ชำระเงินแล้ว (ยืนยันอัตโนมัติ)");
    expect(message).toContain("🏠 โฮมสเตย์: Doi Inthanon Retreat");
    expect(message).toContain("ชื่อ: Nok Suwan");
    expect(message).toContain("อีเมล: guest@example.com");
    expect(message).toContain("โทร: 0898765432");
    expect(message).toContain("🛏️ บ้านพัก: Pine House");
    expect(message).toContain("🌙 จำนวน: 2 คืน");
    expect(message).toContain("👥 ผู้เข้าพัก: 2 ท่าน");
    expect(message).toContain("ยอดรวม: ฿2,000");
    expect(message).toContain("📍 Chiang Mai");
  });

  it("shows only the first eight characters of the booking id", () => {
    expect(buildNewBookingMessage(details())).toContain("🔖 Booking ID: booking-...");
  });

  it("formats the stay dates in Thai with a Buddhist Era year", () => {
    const message = buildNewBookingMessage(details());
    expect(message).toContain("📅 เช็คอิน: 12 ม.ค. 2569");
    expect(message).toContain("📅 เช็คเอาท์: 14 ม.ค. 2569");
  });

  it("flags a booking whose slip could not be verified", () => {
    const message = buildNewBookingMessage(details(), "flagged");
    expect(message).toContain("⚠️ การจองใหม่ — รอตรวจสอบ");
    expect(message).toContain("❌ ยืนยันสลิปไม่สำเร็จ");
  });

  it("names the guest's province when they gave one", () => {
    expect(buildNewBookingMessage(details({ guest_province: "chiang_mai" }))).toContain("จังหวัด: เชียงใหม่");
    expect(buildNewBookingMessage(details())).not.toContain("จังหวัด:");
  });

  it("appends the guest composition to the headcount", () => {
    const message = buildNewBookingMessage(details({ num_guests: 6, guest_pricing_label: "ผู้ใหญ่ 4 เด็ก 2" }));
    expect(message).toContain("👥 ผู้เข้าพัก: 6 ท่าน (ผู้ใหญ่ 4 เด็ก 2)");
  });

  it("lists the chosen extras with their prices", () => {
    const message = buildNewBookingMessage(
      details({ selected_options: [{ name: "อาหารเช้า", price: 500 }, { name: "BBQ", price: 1200 }] }),
    );
    expect(message).toContain("🔧 บริการเพิ่มเติม: อาหารเช้า (+฿500), BBQ (+฿1,200)");
  });

  it("omits the extras line when there are none", () => {
    expect(buildNewBookingMessage(details({ selected_options: [] }))).not.toContain("บริการเพิ่มเติม");
    expect(buildNewBookingMessage(details({ selected_options: null }))).not.toContain("บริการเพิ่มเติม");
  });

  it("falls back to a generic room name when the room is unknown", () => {
    expect(buildNewBookingMessage(details({}, null))).toContain("🛏️ บ้านพัก: Standard");
  });

  describe("the nightly-rate parenthetical", () => {
    it("explains the total when the base rate is the whole story", () => {
      const message = buildNewBookingMessage(details({ total_price: 2000 }, { price_per_night: 1000 }));
      expect(message).toContain("(฿1,000 × 2 คืน)");
    });

    it("is suppressed when surcharges or discounts break the equality", () => {
      const message = buildNewBookingMessage(details({ total_price: 6500 }, { price_per_night: 1800 }));
      expect(message).toContain("ยอดรวม: ฿6,500");
      expect(message).not.toContain("× 2 คืน)");
    });

    it("is suppressed when there is no room to quote a rate from", () => {
      expect(buildNewBookingMessage(details({ total_price: 2000 }, null))).not.toContain("คืน)");
    });
  });

  describe("deposit bookings", () => {
    it("shows what was paid and what is still owed", () => {
      const message = buildNewBookingMessage(
        details({ payment_type: "deposit", amount_paid: 500, total_price: 2000 }),
      );
      expect(message).toContain("💳 ยอดที่ชำระ: ฿500 (มัดจำ)");
      expect(message).toContain("⏳ ยอดค้าง: ฿1,500 (ชำระเมื่อเข้าพัก)");
    });

    it("treats a missing paid amount as nothing paid", () => {
      const message = buildNewBookingMessage(
        details({ payment_type: "deposit", amount_paid: 0, total_price: 2000 }),
      );
      expect(message).toContain("💳 ยอดที่ชำระ: ฿0 (มัดจำ)");
      expect(message).toContain("⏳ ยอดค้าง: ฿2,000");
    });

    it("shows no deposit block for a fully paid booking", () => {
      expect(buildNewBookingMessage(details())).not.toContain("ยอดค้าง");
    });
  });
});

describe("buildCancellationMessage", () => {
  it("reports the cancellation with the refund due", () => {
    const message = buildCancellationMessage(details({ amount_paid: 2000 }));

    expect(message).toContain("❌ แขกยกเลิกการจอง");
    expect(message).toContain("ยอดที่ชำระแล้ว: ฿2,000");
    expect(message).toContain("💰 ยอดคืน: ฿2,000");
    expect(message).toContain("ชำระแบบ: เต็มจำนวน");
    expect(message).toContain("วันที่ดังกล่าวเปิดให้จองอีกครั้งแล้ว");
  });

  it("names the payment type as a deposit when it was one", () => {
    const message = buildCancellationMessage(details({ payment_type: "deposit", amount_paid: 500 }));
    expect(message).toContain("ชำระแบบ: มัดจำ");
    expect(message).toContain("💰 ยอดคืน: ฿500");
  });

  it("refunds nothing when nothing was paid", () => {
    expect(buildCancellationMessage(details({ amount_paid: 0 }))).toContain("💰 ยอดคืน: ฿0");
  });

  it("includes the guest's reason when they gave one", () => {
    expect(buildCancellationMessage(details(), "แผนเปลี่ยน")).toContain("📝 เหตุผล: แผนเปลี่ยน");
    expect(buildCancellationMessage(details())).not.toContain("📝 เหตุผล");
  });

  it("falls back to a generic room name", () => {
    expect(buildCancellationMessage(details({}, null))).toContain("🛏️ บ้านพัก: Standard");
  });
});

describe("buildDateChangeMessage", () => {
  const change = (
    priceDifference: number,
    newTotalPrice: number,
    newRoomName?: string,
    paymentInfo?: Parameters<typeof buildDateChangeMessage>[8],
  ) =>
    buildDateChangeMessage(
      details(),
      "2026-01-12",
      "2026-01-14",
      "2026-02-10",
      "2026-02-13",
      priceDifference,
      newTotalPrice,
      newRoomName,
      paymentInfo,
    );

  it("contrasts the old stay with the requested one", () => {
    const message = change(1000, 3000);

    expect(message).toContain("📅 แขกขอเปลี่ยนวันเข้าพัก");
    expect(message).toContain("12 ม.ค. 2569 → 14 ม.ค. 2569 (2 คืน)");
    expect(message).toContain("10 ก.พ. 2569 → 13 ก.พ. 2569 (3 คืน)");
    expect(message).toContain("ราคาเดิม: ฿2,000");
    expect(message).toContain("ราคาใหม่: ฿3,000");
    expect(message).toContain("กรุณาอนุมัติหรือปฏิเสธใน Dashboard");
  });

  it("mentions the room swap when the guest wants a different house", () => {
    const message = change(0, 2000, "Oak House");
    expect(message).toContain("📅 แขกขอเปลี่ยนบ้านพัก/วันเข้าพัก");
    expect(message).toContain("🛏️ บ้านพักใหม่: Oak House (เดิม: Pine House)");
  });

  it("keeps a single room line when only the dates change", () => {
    expect(change(0, 2000)).toContain("🛏️ บ้านพัก: Pine House");
  });

  describe("without payment details", () => {
    it("reports a price increase as already settled", () => {
      expect(change(1000, 3000)).toContain("💰 ส่วนต่าง: +฿1,000 (ชำระแล้ว)");
    });

    it("reports a price drop", () => {
      expect(change(-500, 1500)).toContain("💰 ส่วนต่าง: -฿500");
    });

    it("reports an unchanged price", () => {
      expect(change(0, 2000)).toContain("💰 ราคาเท่าเดิม");
    });
  });

  describe("with payment details", () => {
    const paymentInfo = (over: Partial<NonNullable<Parameters<typeof buildDateChangeMessage>[8]>> = {}) => ({
      amountPaid: 2000,
      additionalPayment: 0,
      paymentOption: "full" as const,
      depositAvailable: false,
      newDeposit: 0,
      fullOutstanding: 0,
      paymentType: "full",
      ...over,
    });

    it("summarises what has been paid and the difference", () => {
      const message = change(1000, 3000, undefined, paymentInfo({ additionalPayment: 1000 }));
      expect(message).toContain("💳 ประเภทการชำระ: เต็มจำนวน");
      expect(message).toContain("💰 ยอดที่ชำระแล้ว: ฿2,000");
      expect(message).toContain("💰 ส่วนต่างราคา: +฿1,000");
      expect(message).toContain("✅ ชำระเพิ่ม (เต็มจำนวน): ฿1,000");
      expect(message).toContain("🧾 สลิปยืนยันแล้ว");
    });

    it("labels a deposit booking as such", () => {
      const message = change(0, 2000, undefined, paymentInfo({ paymentType: "deposit" }));
      expect(message).toContain("💳 ประเภทการชำระ: มัดจำ");
    });

    it("shows a negative and a zero difference", () => {
      expect(change(-500, 1500, undefined, paymentInfo())).toContain("💰 ส่วนต่างราคา: -฿500");
      expect(change(0, 2000, undefined, paymentInfo())).toContain("💰 ส่วนต่างราคา: ฿0 (เท่าเดิม)");
    });

    it("shows the remaining balance when the guest tops up a deposit", () => {
      const message = change(
        1500,
        3500,
        undefined,
        paymentInfo({ amountPaid: 500, additionalPayment: 500, paymentOption: "deposit", depositAvailable: true }),
      );
      expect(message).toContain("✅ ชำระเพิ่ม (มัดจำ): ฿500");
      expect(message).toContain("⏳ ยอดคงเหลือ (ชำระวันเข้าพัก): ฿2,500");
    });

    it("omits the remaining line when the top-up settles the stay", () => {
      const message = change(
        1000,
        3000,
        undefined,
        paymentInfo({ amountPaid: 2000, additionalPayment: 1000, paymentOption: "deposit", depositAvailable: true }),
      );
      expect(message).toContain("✅ ชำระเพิ่ม (มัดจำ): ฿1,000");
      expect(message).not.toContain("ยอดคงเหลือ");
    });

    it("treats a deposit option as a full payment when deposits are unavailable", () => {
      const message = change(
        1000,
        3000,
        undefined,
        paymentInfo({ additionalPayment: 1000, paymentOption: "deposit", depositAvailable: false }),
      );
      expect(message).toContain("✅ ชำระเพิ่ม (เต็มจำนวน): ฿1,000");
    });

    it("says nothing more is owed when the stay is settled and no cheaper", () => {
      const message = change(-500, 1500, undefined, paymentInfo({ fullOutstanding: 0 }));
      expect(message).toContain("✅ ไม่ต้องชำระเพิ่ม");
    });

    it("stays quiet when there is still an outstanding balance to collect", () => {
      const message = change(0, 2000, undefined, paymentInfo({ fullOutstanding: 800 }));
      expect(message).not.toContain("ไม่ต้องชำระเพิ่ม");
      expect(message).not.toContain("ชำระเพิ่ม (");
    });
  });
});
