import { describe, expect, it } from "vitest";
import { upcomingSeasons } from "@/lib/room-rates";

const TODAY = "2026-11-05";

describe("upcomingSeasons", () => {
  it("drops a season that ended before today and keeps one ending today or later", () => {
    const seasons = [
      { id: "aug", end_date: "2026-08-31" },
      { id: "today", end_date: "2026-11-05" },
      { id: "dec", end_date: "2026-12-31" },
    ];
    expect(upcomingSeasons(seasons, TODAY).map((s) => s.id)).toEqual(["today", "dec"]);
  });
});
