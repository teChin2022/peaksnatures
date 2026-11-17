import { describe, expect, it } from "vitest";
import { assignLines, LINE_PALETTE, OTHER_ALIAS, OTHER_LINE_COLOR } from "./chart-lines";

describe("assignLines", () => {
  it("gives each of the first seven its own colour, in order", () => {
    const names = ["a", "b", "c"];
    const { aliasOf, colorOf } = assignLines(names);
    expect(names.map((n) => colorOf[aliasOf.get(n)!])).toEqual(LINE_PALETTE.slice(0, 3));
  });

  it("folds the eighth onward into one 'other' line instead of reusing a colour", () => {
    const names = Array.from({ length: 10 }, (_, i) => `n${i}`);
    const { aliasOf, colorOf } = assignLines(names);
    expect(aliasOf.get("n6")).toBe("r6");
    expect(aliasOf.get("n7")).toBe(OTHER_ALIAS);
    expect(aliasOf.get("n9")).toBe(OTHER_ALIAS);
    expect(colorOf[OTHER_ALIAS]).toBe(OTHER_LINE_COLOR);
    expect(new Set(Object.values(colorOf)).size).toBe(Object.keys(colorOf).length); // no colour twice
  });
});
