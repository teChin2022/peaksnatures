/**
 * Icons for a homestay's amenities and house rules.
 *
 * Labels stay plain text (`homestays.amenities` / `prohibitions`). Every label
 * gets an icon picked from its words; a host can override any of them, and only
 * those overrides are stored (`amenity_icons` / `prohibition_icons`, migration
 * 072). Import-free so the server page, the dashboard and tests can share it —
 * the key → lucide component map lives in `components/booking/list-icon.tsx`.
 */

export type ListKind = "amenity" | "rule";

/** Quick-add choices in the dashboard. The first 4 / 3 are the original presets, kept verbatim. */
export const AMENITY_PRESETS = [
  "ไวไฟ (WiFi)",
  "ที่จอดรถ (Parking)",
  "ห้องครัว (Kitchen)",
  "เตาผิง (Fireplace)",
  "อาหารเช้า (Breakfast)",
  "กาแฟและเครื่องดื่ม (Coffee & drinks)",
  "เครื่องปรับอากาศ (Air conditioning)",
  "พัดลม (Fan)",
  "เครื่องทำน้ำอุ่น (Hot water)",
  "ตู้เย็น (Refrigerator)",
  "ทีวี (TV)",
  "ผ้าเช็ดตัวและของใช้ในห้องน้ำ (Towels & toiletries)",
  "เครื่องปิ้งย่าง (BBQ grill)",
  "ลานแคมป์ไฟ (Campfire area)",
  "ลานกางเต็นท์ (Camping area)",
  "วิวภูเขา (Mountain view)",
  "ริมลำธาร (Riverside)",
  "สวน (Garden)",
  "รถรับส่ง (Shuttle service)",
  "เลี้ยงสัตว์ได้ (Pet friendly)",
];

export const RULE_PRESETS = [
  "ห้ามสูบบุหรี่ (No Smoking)",
  "ห้ามนำสัตว์เลี้ยงเข้า (No Pets)",
  "ห้ามเล่นเพลงดัง (No Loud Music)",
  "งดใช้เสียงหลัง 22:00 น. (Quiet hours after 10 pm)",
  "ห้ามจัดปาร์ตี้ (No parties)",
  "ห้ามดื่มแอลกอฮอล์ (No alcohol)",
  "ห้ามก่อไฟนอกพื้นที่ที่กำหนด (No open fires outside designated areas)",
  "กรุณาถอดรองเท้าก่อนเข้าบ้าน (Please remove shoes indoors)",
  "ทิ้งขยะให้ถูกที่ (Dispose of trash properly)",
  "เด็กต้องอยู่ในความดูแลของผู้ปกครอง (Children must be supervised)",
  "ห้ามนำบุคคลภายนอกเข้าที่พัก (No outside visitors)",
  "ปิดไฟและเครื่องใช้ไฟฟ้าเมื่อออกจากบ้าน (Turn off lights and appliances when leaving)",
];

export const FALLBACK_ICON: Record<ListKind, string> = { amenity: "check", rule: "info" };

// First match wins, so a specific phrase sits above any word it contains
// (river before the generic "วิว", ไฟฟ้า before ไฟ). Thai has no word
// boundaries: keep keywords long enough not to hide inside other words —
// no bare ชา (ที่ชาร์จ), เรือ (เรือน) or สระ (อิสระ).
const AMENITY_RULES: [RegExp, string][] = [
  [/wi-?fi|internet|ไวไฟ|อินเทอร์เน็ต|อินเตอร์เน็ต/, "wifi"],
  [/parking|ที่จอดรถ|จอดรถ/, "parking"],
  [/fireplace|เตาผิง/, "fireplace"],
  [/bbq|barbecue|grill|บาร์บีคิว|ปิ้งย่าง|หมูกระทะ|เตาย่าง/, "bbq"],
  [/campfire|bonfire|แคมป์ไฟ|กองไฟ/, "campfire"],
  [/kitchen|cooking|ห้องครัว|ครัว|ทำอาหาร/, "kitchen"],
  [/breakfast|\bmeals?\b|อาหาร/, "breakfast"],
  [/coffee|\btea\b|กาแฟ|เครื่องดื่ม/, "coffee"],
  [/air ?con|\ba\/c\b|แอร์|เครื่องปรับอากาศ/, "ac"],
  [/\bfans?\b|พัดลม/, "fan"],
  [/hot water|shower|น้ำอุ่น|ฝักบัว/, "hot-water"],
  [/fridge|refrigerator|ตู้เย็น/, "fridge"],
  [/microwave|ไมโครเวฟ/, "microwave"],
  [/\btv\b|television|netflix|ทีวี|โทรทัศน์/, "tv"],
  [/towel|toiletr|bath|ผ้าเช็ดตัว|ห้องน้ำ|อ่างอาบน้ำ/, "bath"],
  [/washing machine|laundry|ซักผ้า|ซักรีด/, "laundry"],
  [/\bbed|ที่นอน|เตียง|เครื่องนอน/, "bed"],
  [/tent|camping|เต็นท์|เต้นท์|เต๊นท์/, "tent"],
  [/pool|swim|สระว่ายน้ำ|สระน้ำ/, "pool"],
  [/river|stream|waterfall|lake|ลำธาร|แม่น้ำ|ริมน้ำ|น้ำตก|ทะเลสาบ/, "river"],
  [/mountain|view|sea of mist|ภูเขา|ดอย|ทะเลหมอก|วิว/, "mountain"],
  [/garden|forest|สวน|ป่า/, "garden"],
  [/shuttle|transfer|pick-?up|รถรับส่ง|รับส่ง/, "shuttle"],
  [/bike|bicycle|จักรยาน/, "bike"],
  [/kayak|boat|\bsup\b|คายัค|ล่องเรือ|พายเรือ/, "boat"],
  [/fishing|ตกปลา/, "fishing"],
  [/\bgames?\b|บอร์ดเกม|เกม/, "games"],
  [/\bbooks?\b|library|หนังสือ|ห้องสมุด/, "books"],
  [/telescope|stargaz|ดูดาว/, "stargazing"],
  [/karaoke|speaker|music|คาราโอเกะ|ลำโพง|ดนตรี/, "music"],
  [/sofa|living room|lounge|โซฟา|ห้องนั่งเล่น/, "sofa"],
  [/charger|\bplugs?\b|power|electric|ที่ชาร์จ|ปลั๊ก|ไฟฟ้า/, "plug"],
  [/first aid|ปฐมพยาบาล/, "first-aid"],
  [/extinguisher|ถังดับเพลิง/, "extinguisher"],
  [/cctv|\bsafe\b|security|กล้องวงจรปิด|ตู้เซฟ|ความปลอดภัย/, "security"],
  [/\bpets?\b|สัตว์เลี้ยง/, "pet"],
];

const RULE_RULES: [RegExp, string][] = [
  [/smok|cigarette|vape|บุหรี่|สูบ/, "no-smoking"],
  [/\bpets?\b|animal|สัตว์/, "pet"],
  [/alcohol|liquor|beer|แอลกอฮอล์|เหล้า|เบียร์|ของมึนเมา/, "no-alcohol"],
  [/part(y|ies)|ปาร์ตี้|งานเลี้ยง|สังสรรค์/, "party"],
  [/quiet|noise|loud|music|เสียง|เพลง/, "quiet"],
  [/electric|power|\blights?\b|appliance|ไฟฟ้า|ปิดไฟ/, "plug"],
  [/fire|candle|ก่อไฟ|จุดไฟ|เทียน|พลุ|ประทัด|ไฟ/, "fire"],
  [/shoe|รองเท้า/, "shoes"],
  [/trash|garbage|rubbish|waste|ขยะ/, "trash"],
  [/child|\bkids?\b|infant|เด็ก/, "children"],
  [/\bfood|cook|อาหาร/, "food"],
  [/visitor|outsider|บุคคลภายนอก|คนนอก/, "guests"],
  [/check-?in|check-?out|เช็คอิน|เช็คเอาท์|เช็กอิน|เช็กเอาต์|เวลา|\d{1,2}[:.]\d{2}/, "clock"],
  [/clean|tidy|ความสะอาด|สะอาด/, "clean"],
  [/\bkeys?\b|\block|กุญแจ|ล็อก|ล็อค/, "key"],
  [/swim|pool|สระว่ายน้ำ|ว่ายน้ำ/, "pool"],
  [/damage|\bfines?\b|เสียหาย|ทำลาย|ค่าปรับ|ชดใช้/, "damage"],
  [/drug|weapon|gambl|illegal|ยาเสพติด|อาวุธ|การพนัน|ผิดกฎหมาย/, "ban"],
];

export const ICON_RULES: Record<ListKind, [RegExp, string][]> = { amenity: AMENITY_RULES, rule: RULE_RULES };

/** The icon an amenity or rule gets from its own words, or the list's fallback. */
export function autoIconKey(label: string, kind: ListKind): string {
  const text = label.toLowerCase();
  return ICON_RULES[kind].find(([pattern]) => pattern.test(text))?.[1] ?? FALLBACK_ICON[kind];
}

/** One icon key per label: the host's pick when there is one, else the auto icon. */
export function resolveIconKeys(
  labels: string[],
  overrides: Record<string, string> | null | undefined,
  kind: ListKind,
): string[] {
  return labels.map((label) => overrides?.[label] || autoIconKey(label, kind));
}
