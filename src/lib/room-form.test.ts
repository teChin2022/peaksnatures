import { describe, expect, it } from "vitest";
import { parseRoomPrice, unaddedSections } from "./room-form";

// A blank price used to save as ฿0 (parseInt("") || 0): a house guests could book free.
describe("parseRoomPrice", () => {
  it("rejects a blank, zero, negative or non-numeric price", () => {
    expect(parseRoomPrice("")).toBeNull();
    expect(parseRoomPrice("   ")).toBeNull();
    expect(parseRoomPrice("0")).toBeNull();
    expect(parseRoomPrice("-500")).toBeNull();
    expect(parseRoomPrice("abc")).toBeNull();
  });

  it("returns whole baht for a positive price", () => {
    expect(parseRoomPrice("1500")).toBe(1500);
    expect(parseRoomPrice(" 990 ")).toBe(990);
    expect(parseRoomPrice("1200.75")).toBe(1200); // the column is INTEGER; same truncation as before
  });
});

const EMPTY = {
  season: { name: "", start_date: "", end_date: "", price_per_night: "" },
  special: { name: "", weekdays: [] as number[], dates: [] as string[], start_date: "", end_date: "", surcharge: "" },
  option: { name: "", price: "" },
  tier: { adults: "2", children: "0", detail: "", surcharge: "", useDefaultPrice: false },
  editing: { season: false, special: false, option: false, tier: false },
};

// A season typed into its form but never added with "เพิ่ม" was dropped when the host saved the house.
describe("unaddedSections", () => {
  it("is empty when every sub-form is untouched", () => {
    expect(unaddedSections(EMPTY)).toEqual([]);
  });

  it("names each sub-form holding input that was never added", () => {
    expect(
      unaddedSections({
        ...EMPTY,
        season: { ...EMPTY.season, price_per_night: "2500" },
        option: { ...EMPTY.option, name: "อาหารเช้า" },
      }),
    ).toEqual(["option", "season"]); // in the dialog's order
    expect(unaddedSections({ ...EMPTY, special: { ...EMPTY.special, weekdays: [5, 6] } })).toEqual(["special"]);
    expect(unaddedSections({ ...EMPTY, tier: { ...EMPTY.tier, adults: "3" } })).toEqual(["tier"]);
  });

  it("counts an edit in progress, even with the fields unchanged", () => {
    expect(unaddedSections({ ...EMPTY, editing: { ...EMPTY.editing, tier: true } })).toEqual(["tier"]);
  });
});
