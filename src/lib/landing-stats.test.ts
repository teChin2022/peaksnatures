import { describe, it, expect } from "vitest";
import { landingStats } from "./landing-stats";

const review = (rating: number, would_return: string | null) => ({ rating, would_return });

describe("landingStats", () => {
  it("shows every stat that clears its minimum", () => {
    // 11 reviews average 53/11 = 4.82; 10 answered would_return and 9 said yes → 90%,
    // the unanswered one is left out of the share.
    const reviews = [
      ...Array.from({ length: 9 }, () => review(5, "yes")),
      review(4, "maybe"),
      review(4, null),
    ];

    expect(landingStats({ homestays: 36, confirmedBookings: 1240, reviews })).toEqual([
      { value: "36", label: "โฮมสเตย์ที่เปิดให้จอง" },
      { value: "1,240", label: "การจองที่ยืนยันแล้ว" },
      { value: "4.8", label: "จาก 11 รีวิวผู้เข้าพักจริง", star: true },
      { value: "90%", label: "ของผู้รีวิวอยากกลับมาพักอีก" },
    ]);
  });

  it("shows a stat at its minimum and hides the band when only one stat would remain", () => {
    expect(landingStats({ homestays: 5, confirmedBookings: 50, reviews: [] })).toHaveLength(2);
    expect(landingStats({ homestays: 4, confirmedBookings: 50, reviews: [] })).toEqual([]);
  });
});
