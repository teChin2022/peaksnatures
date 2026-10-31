import { describe, expect, it } from "vitest";
import {
  AMENITY_PRESETS,
  FALLBACK_ICON,
  ICON_RULES,
  RULE_PRESETS,
  autoIconKey,
  resolveIconKeys,
} from "@/lib/list-icons";
import { LIST_ICONS } from "@/components/booking/list-icon";

it("has a drawable icon for every key it can pick", () => {
  const keys = [
    ...Object.values(FALLBACK_ICON),
    ...ICON_RULES.amenity.map(([, key]) => key),
    ...ICON_RULES.rule.map(([, key]) => key),
  ];
  for (const key of keys) expect(LIST_ICONS).toHaveProperty([key]);
});

describe("autoIconKey", () => {
  it.each(AMENITY_PRESETS)("gives the amenity preset %s its own icon", (label) => {
    expect(autoIconKey(label, "amenity")).not.toBe(FALLBACK_ICON.amenity);
  });

  it.each(RULE_PRESETS)("gives the rule preset %s its own icon", (label) => {
    expect(autoIconKey(label, "rule")).not.toBe(FALLBACK_ICON.rule);
  });

  it("matches Thai and English wording alike", () => {
    expect(autoIconKey("ไวไฟความเร็วสูง", "amenity")).toBe("wifi");
    expect(autoIconKey("Free Wi-Fi", "amenity")).toBe("wifi");
    expect(autoIconKey("หมูกระทะ", "amenity")).toBe("bbq");
    expect(autoIconKey("No smoking indoors", "rule")).toBe("no-smoking");
  });

  it("names the right preset icons", () => {
    expect(autoIconKey("ไวไฟ (WiFi)", "amenity")).toBe("wifi");
    expect(autoIconKey("อาหารเช้า (Breakfast)", "amenity")).toBe("breakfast");
    expect(autoIconKey("ห้ามสูบบุหรี่ (No Smoking)", "rule")).toBe("no-smoking");
    expect(autoIconKey("งดใช้เสียงหลัง 22:00 น. (Quiet hours after 10 pm)", "rule")).toBe("quiet");
  });

  it("does not find a short keyword inside a longer Thai word", () => {
    expect(autoIconKey("ที่ชาร์จโทรศัพท์", "amenity")).toBe("plug"); // ชาร์จ is not ชา (tea)
    expect(autoIconKey("บ้านเรือนไทย", "amenity")).toBe(FALLBACK_ICON.amenity); // เรือน is not เรือ (boat)
    expect(autoIconKey("ใช้พื้นที่ได้อย่างอิสระ", "rule")).toBe(FALLBACK_ICON.rule); // อิสระ is not สระ (pool)
  });

  it("puts the specific phrase ahead of a word it contains", () => {
    expect(autoIconKey("ปิดเครื่องใช้ไฟฟ้าก่อนออกจากบ้าน", "rule")).toBe("plug"); // ไฟฟ้า, not ไฟ (fire)
    expect(autoIconKey("ห้ามก่อไฟ", "rule")).toBe("fire");
    expect(autoIconKey("วิวแม่น้ำ", "amenity")).toBe("river"); // not the generic วิว
  });

  it("falls back to each list's default for words it does not know", () => {
    expect(autoIconKey("บ้านไม้ทั้งหลัง", "amenity")).toBe("check");
    expect(autoIconKey("ปฏิบัติตามคำแนะนำของเจ้าของบ้าน", "rule")).toBe("info");
  });
});

describe("resolveIconKeys", () => {
  it("uses the host's pick where there is one and the auto icon elsewhere", () => {
    expect(
      resolveIconKeys(["ไวไฟ (WiFi)", "ที่จอดรถ (Parking)"], { "ที่จอดรถ (Parking)": "shuttle" }, "amenity"),
    ).toEqual(["wifi", "shuttle"]);
  });

  it("works for a homestay saved before icons existed", () => {
    expect(resolveIconKeys(["ห้ามสูบบุหรี่ (No Smoking)"], undefined, "rule")).toEqual(["no-smoking"]);
  });
});
