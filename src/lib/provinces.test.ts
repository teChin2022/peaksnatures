import { describe, expect, it } from "vitest";
import { THAI_PROVINCES, getProvinceLabel, sortProvincesForLocale } from "@/lib/provinces";

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

describe("sortProvincesForLocale", () => {
  const index = (list: { value: string }[], value: string) => list.findIndex((p) => p.value === value);

  it("orders Thai readers' list by the Thai label, not the romanised one", () => {
    const th = sortProvincesForLocale("th");
    // Romanised order puts Amnat Charoen first and Bangkok third; by Thai label ก comes before อ.
    expect(index(th, "bangkok")).toBeLessThan(index(th, "amnat_charoen"));
    const collator = new Intl.Collator("th");
    for (let i = 1; i < th.length; i++) {
      expect(collator.compare(th[i - 1].labelTh, th[i].labelTh)).toBeLessThanOrEqual(0);
    }
  });

  it("keeps the romanised order for every non-Thai locale", () => {
    expect(sortProvincesForLocale("en")).toEqual(THAI_PROVINCES);
    expect(sortProvincesForLocale("de")).toEqual(THAI_PROVINCES);
  });

  it("returns all 77 provinces and never reorders the shared list", () => {
    const before = THAI_PROVINCES.map((p) => p.value);
    expect(sortProvincesForLocale("th")).toHaveLength(77);
    expect(THAI_PROVINCES.map((p) => p.value)).toEqual(before);
  });
});
