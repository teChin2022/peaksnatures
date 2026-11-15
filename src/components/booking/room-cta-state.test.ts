import { describe, expect, it } from "vitest";
import { roomCtaState } from "@/components/booking/room-cta-state";

describe("roomCtaState", () => {
  it("asks for dates first, whatever is chosen", () => {
    expect(roomCtaState({ datesChosen: false, inCart: 0, remaining: undefined })).toBe("pick-dates");
    expect(roomCtaState({ datesChosen: false, inCart: 1, remaining: 0 })).toBe("pick-dates");
  });

  it("offers to choose a house that is not chosen yet", () => {
    expect(roomCtaState({ datesChosen: true, inCart: 0, remaining: 1 })).toBe("add");
  });

  it("offers one more unit while free units remain after one is chosen", () => {
    expect(roomCtaState({ datesChosen: true, inCart: 1, remaining: 2 })).toBe("add-more");
  });

  // A second tap on a single-unit house used to toast "not available for these dates".
  it("offers nothing once every free unit is chosen: each chosen unit is edited on its own line", () => {
    expect(roomCtaState({ datesChosen: true, inCart: 1, remaining: 0 })).toBe("full");
    expect(roomCtaState({ datesChosen: true, inCart: 2, remaining: 0 })).toBe("full");
  });

  it("keeps 'add' for a house others hold (none of ours chosen), so the unavailable toast still explains it", () => {
    expect(roomCtaState({ datesChosen: true, inCart: 0, remaining: 0 })).toBe("add");
  });
});
