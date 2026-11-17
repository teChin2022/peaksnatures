import { describe, expect, it } from "vitest";
import { parseRoomPrice } from "./room-form";

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
