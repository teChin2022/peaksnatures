export interface LandingStat {
  value: string;
  label: string;
  star?: boolean;
}

// Below these a number reads as "empty platform" rather than proof, so the stat is hidden.
const MIN_HOMESTAYS = 5;
const MIN_BOOKINGS = 50;
const MIN_REVIEWS = 10;
const MIN_RETURN_ANSWERS = 10;

export function landingStats({
  homestays,
  confirmedBookings,
  reviews,
}: {
  homestays: number;
  confirmedBookings: number;
  reviews: { rating: number; would_return: string | null }[];
}): LandingStat[] {
  const fmt = (n: number) => n.toLocaleString("th-TH");
  const stats: LandingStat[] = [];

  if (homestays >= MIN_HOMESTAYS) {
    stats.push({ value: fmt(homestays), label: "โฮมสเตย์ที่เปิดให้จอง" });
  }
  if (confirmedBookings >= MIN_BOOKINGS) {
    stats.push({ value: fmt(confirmedBookings), label: "การจองที่ยืนยันแล้ว" });
  }
  if (reviews.length >= MIN_REVIEWS) {
    const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    stats.push({
      value: (Math.round(avg * 10) / 10).toFixed(1),
      label: `จาก ${fmt(reviews.length)} รีวิวผู้เข้าพักจริง`,
      star: true,
    });
  }
  // would_return is optional on the review form; only reviewers who answered count.
  const answered = reviews.filter((r) => r.would_return);
  if (answered.length >= MIN_RETURN_ANSWERS) {
    const yes = answered.filter((r) => r.would_return === "yes").length;
    stats.push({
      value: `${Math.round((yes / answered.length) * 100)}%`,
      label: "ของผู้รีวิวอยากกลับมาพักอีก",
    });
  }

  // A lone number looks thinner than no band at all.
  return stats.length >= 2 ? stats : [];
}
