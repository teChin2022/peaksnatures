import { describe, expect, it } from "vitest";
import { roomCtaState } from "@/components/booking/room-cta-state";

describe("roomCtaState", () => {
  it("asks for dates first, whatever is in the cart", () => {
    expect(roomCtaState({ datesChosen: false, inCart: 0, remaining: undefined })).toBe("pick-dates");
    expect(roomCtaState({ datesChosen: false, inCart: 1, remaining: 0 })).toBe("pick-dates");
  });

  it("offers to add a house that is not in the cart", () => {
    expect(roomCtaState({ datesChosen: true, inCart: 0, remaining: 1 })).toBe("add");
  });

  it("still offers to add while free units remain after one is in the cart", () => {
    expect(roomCtaState({ datesChosen: true, inCart: 1, remaining: 2 })).toBe("add");
  });

  // A second tap on a single-unit house used to toast "not available for these dates".
  it("switches to edit once every free unit is in the cart", () => {
    expect(roomCtaState({ datesChosen: true, inCart: 1, remaining: 0 })).toBe("edit");
    expect(roomCtaState({ datesChosen: true, inCart: 2, remaining: 0 })).toBe("edit");
  });

  it("keeps 'add' for a house others hold (nothing of ours in the cart), so the unavailable toast still explains it", () => {
    expect(roomCtaState({ datesChosen: true, inCart: 0, remaining: 0 })).toBe("add");
  });
});
