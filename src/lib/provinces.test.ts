import { describe, expect, it } from "vitest";
import { THAI_PROVINCES, getProvinceLabel } from "@/lib/provinces";

describe("getProvinceLabel", () => {
  it("returns the Thai label by default", () => {
    expect(getProvinceLabel("chiang_mai")).toBe("เชียงใหม่");
  });

  it("returns the English label for any non-Thai locale", () => {
    expect(getProvinceLabel("chiang_mai", "en")).toBe("Chiang Mai");
    expect(getProvinceLabel("chiang_mai", "de")).toBe("Chiang Mai");
  });

  it("returns the value verbatim when the province is unknown", () => {
    expect(getProvinceLabel("atlantis")).toBe("atlantis");
    expect(getProvinceLabel("atlantis", "en")).toBe("atlantis");
    expect(getProvinceLabel("")).toBe("");
  });

  it("covers all 77 provinces with unique keys and both labels", () => {
    expect(THAI_PROVINCES).toHaveLength(77);
    expect(new Set(THAI_PROVINCES.map((p) => p.value)).size).toBe(77);
    expect(THAI_PROVINCES.every((p) => p.labelTh && p.labelEn)).toBe(true);
  });
});
