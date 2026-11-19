# AI Admin: แผนงาน (ร่าง 2026-11-19, ปรับครั้งที่ 2)

สถานะ: **แผน ยังไม่ได้ลงมือ**
(security review: `docs/ai-admin-security-review.md` — F-01 ถึง F-04 อยู่ในแผนแล้ว 2026-11-19 ข้อที่เหลือทำตามลำดับในรายงาน) ทุกเฟสต้องได้รับอนุมัติก่อนเริ่ม (นับเป็น large change:
แตะ DB, RLS, booking flow, billing)

## เป้าหมาย

AI ประจำแต่ละ host ที่ช่วย **แขก** บนหน้าที่พัก ไม่ใช่กล่องแชทลอยมุมจอ แต่เป็น
**ช่องถาม AI ที่ควบคุมหน้าจอง**: แขกพิมพ์ "เสาร์อาทิตย์หน้า 4 คน" แล้วปฏิทินบนหน้าเลือกวัน
ให้ บ้านที่ไม่ว่างจางลง ราคาจริงขึ้นบนการ์ด คำถามเรื่องที่พักตอบใต้ช่องถาม

## ข้อที่ตกลงแล้ว

| เรื่อง | ข้อตกลง |
|---|---|
| ผู้ใช้ | แขกเท่านั้น (ไม่มีโหมด host ในแผนนี้) |
| ช่องทาง | หน้าที่พักบนเว็บ (ไม่ใช่ LINE / Messenger) |
| รูปแบบ | ช่องถามที่ควบคุมหน้าจอง พิมพ์อย่างเดียว (ยังไม่ทำเสียง) |
| การกระทำที่มีผล | AI เสนอ แขกกดยืนยัน แล้วผ่าน flow เดิม (hold, Turnstile, สลิป) |
| การเปิดใช้ | host ส่งคำขอ, platform admin อนุมัติ |
| ค่าใช้จ่าย | แพลตฟอร์มจ่ายค่า AI จริง แล้วหักจากกระเป๋าเงินของ host |
| ขอบเขต "ทำได้ทุกอย่าง" | ทุกอย่างที่ **แขก** ทำได้ในระบบ host เปิดปิดได้ทีละอย่าง AI ไม่มีเครื่องมือระดับ host ไม่ว่าตั้งค่าอย่างไร (แขกพิมพ์หลอก AI ได้) |
| งาน UI | ทุกชิ้นเริ่มที่ `/peaksnature-ui` (ดู "วิธีทำงาน UI") |

## หลักการออกแบบระบบ

1. **AI ไม่พูดตัวเลขเอง** หน้าที่พักโหลดวันจอง, `blocked_dates`, ราคา season / special /
   option ไว้ฝั่ง client แล้ว (`src/app/[slug]/data.ts`) AI แค่แปลงคำพูดเป็น
   `{ check_in, check_out, guests, room_ids }` แล้ว client ส่งเข้า `booking-cart-context`
   (`setDates`, `addLine`, `isRoomAvailableForRange`, `computeLineGross`) วันว่างและราคา
   ที่แขกเห็นจึงมาจากโค้ดเดิมเสมอ AI ตอบผิดได้แค่ "เข้าใจคำขอผิด" ซึ่งแขกเห็นบนปฏิทินทันที
2. **การกระทำ = พาไปหน้าที่มีอยู่แล้ว** จองต่อ → `proceed-booking` เดิม, เลื่อนวัน →
   `/[slug]/change-booking`, เช็คอิน → `/[slug]/check-in-out`, ติดต่อ → `host-contact-links`
   AI จึงไม่ต้องมีเครื่องมือยืนยันตัวตนแขกของตัวเอง หน้าปลายทางตรวจตามเดิม
   (cancel ต้อง `booking_id` + `guest_email`, draft lookup ต้องเบอร์ + อีเมล)
3. **host_id มาจาก slug บน server เท่านั้น** ไม่รับจาก client หรือจาก AI
4. **ข้อมูลที่ส่งให้ AI = คอลัมน์สาธารณะเท่านั้น** (ห้าม `select *` จาก `hosts`: เคยมี
   LINE token / PIN hash รั่วจาก `/[slug]` จนถึง 2026-10-31)
5. **กฎแพลตฟอร์มที่ host แก้ไม่ได้** ห้ามให้ส่วนลด, ห้ามสัญญาคืนเงิน, ห้ามพูดราคาหรือ
   วันว่าง, ห้ามพูดถึงแขกคนอื่น, ตอบเฉพาะจากข้อมูลที่พัก + คำแนะนำของ host
6. **ไม่เพิ่ม package** ใช้ `ai` v6 + `@ai-sdk/google` (`gemini-2.5-flash`) ที่ใช้อยู่ใน
   `src/lib/translation/`

## วิธีทำงาน UI (`/peaksnature-ui`)

ทุกหน้าในแผนนี้เป็นหน้า **ใหม่** หรือชิ้นใหม่บนหน้าเดิม จึงขยายโลกของ DESIGN.md
(ไม่ใช่ redesign) ทุกชิ้นเดินสามขั้น และหยุดรออนุมัติระหว่างขั้น B กับ C:

| ขั้น | โหมด peaksnature-ui | ทำอะไร | ผลลัพธ์ |
|---|---|---|---|
| ออกแบบ | **B Design**: `impeccable shape` | brief: โครงหน้า, state ทั้งหมด, copy, ตำแหน่งบนจอ 375 / 768 / 1280 | brief ให้เจ้าของอนุมัติ **ยังไม่เขียนโค้ด** |
| สร้าง | **C Implement**: impeccable + `harden` (loading / empty / error) + `clarify` (copy) | ทำตาม brief ที่อนุมัติ, เพิ่ม `better-ui` เฉพาะจุดที่ DESIGN.md ไม่กำหนดค่า | โค้ด + test |
| ตรวจ | **A Review**: `impeccable critique` + `audit` | หน้า guest: `UI_REVIEW=1 E2E_SLUG=<slug> npx playwright test ui-review` (เพิ่ม state ใหม่ใน `e2e/ui-review.spec.ts`), หน้า host / admin: CDP เพราะ capture ไม่ครอบคลุม | คะแนน + รายการแก้ |

**กติกาที่ทุกชิ้นต้องถือ**

- ความหนาแน่นตาม design-direction §8: หน้าที่พัก airy (Persuade), `/book` comfortable 44px
  targets, host dashboard compact phone-first, admin dense desktop-first ภาษาอังกฤษ
- ใช้ component และ token เดิม (shadcn, `--primary` Forest, `--input` earth-500, Mist Ridge
  บนหน้า guest เท่านั้น, ฟอนต์ Anuphan ผ่าน `font-sans`)
- Copy: แก้ทั้ง `messages/th.json` และ `messages/en.json` (ยกเว้น `/admin`),
  บ้านพัก / House ไม่ใช่ห้องพัก, นับด้วย "หลัง"
- Motion: เพิ่มเฉพาะที่ช่วยให้เข้าใจ ผ่าน `impeccable animate` และตรวจด้วย SKILL.md +
  STANDARDS.md ของ review-animations, ปิดเมื่อ `prefers-reduced-motion`
  (หน้าที่พักมีรายการ motion ที่ตกลงแล้วใน §9 การเพิ่มต้องถามก่อน)
- WCAG 2.2 AA, focus มองเห็นได้, ใช้คีย์บอร์ดได้ครบ
- ห้ามส่ง checkout step 2 ตอนตรวจ (เขียน hold และ draft)
- ตรวจทุก PR: `npx tsc --noEmit`, `npm run lint` (เทียบ baseline 29 ราย rule), `npm run test`,
  screenshot ก่อน / หลังที่ 375, 768, 1280 px, `impeccable detect` บนหน้าที่แก้

**ข้อที่ตกลงไว้แล้ว (§9) ที่ชิ้นงานนี้อาจชน: ต้องถามเจ้าของก่อนเปลี่ยน**

- ลำดับ section ของ `/[slug]` (Hero, Gallery, About, Houses, …): ถ้าช่องถามเป็น section ใหม่
- แถบจองล่างจอบนมือถือมีสองสถานะ: ถ้าช่องถามต้องอยู่ในแถบนี้หรือเหนือแถบ
- เมนู header บนหน้า guest ถือเครื่องมือการจองชุดเดียวกัน: ถ้าเพิ่มทางเข้า "ถาม AI" ในเมนู
- "เลือกบ้านพักนี้" ปิดจนกว่าจะเลือกวันครบ และ "One house first" หลัง Done: AI ที่เลือกวัน
  ให้ต้องพาไปสถานะเดียวกับที่แขกเลือกเอง

## ต้องตัดสินใจก่อน

| # | เรื่อง | ข้อเสนอ | ต้องตอบก่อนเฟส |
|---|---|---|---|
| D1 | ตั้งค่าระดับ host หรือรายที่พัก | **ตกลงแล้ว (2026-11-19): ระดับ host** = บัญชีเจ้าของที่พัก (ไม่ใช่ platform admin) dashboard โหลดที่พักของ host แค่แห่งเดียว (`.limit(1)`) จึงเท่ากับรายที่พักในทางปฏิบัติ | 1 |
| D2 | staff เห็นการตั้งค่า / ประวัติไหม | **ตกลงแล้ว (2026-11-19): เจ้าของคนเดียว** staff ไม่เห็นทั้งการตั้งค่าและประวัติ (route เป็น owner-only `hosts.eq("user_id", user.id)` ไม่ใช้ `getHostAccess`) | 1 |
| D3 | ช่องถามอยู่หน้าไหน | **ตกลงแล้ว (2026-11-19): `/[slug]/book` เท่านั้น** | 2 |
| D4 | ตำแหน่งช่องถามบนหน้า | **ตกลงแล้ว (2026-11-19): มือถือ B (ปุ่ม "ถาม" ในแถบจองล่างจอ + ลิงก์ใต้ช่องวันที่ → sheet), จอ ≥ 768 px แผงชิดขวาเปิดด้วยปุ่ม** ดู "Brief ช่องถาม AI" | 2 |
| D5 | เก็บประวัติคำถามนานเท่าไร | 90 วัน (PDPA) | 2 |
| D6 | คีย์ Gemini เป็น paid tier ไหม | เจ้าของจ่ายแล้ว (2026-11-19) เหลือตรวจว่า**คีย์ที่ production ใช้มาจาก Cloud project ที่ผูก billing account ที่ active** (เงื่อนไข paid tier ของ Google) ไม่ใช่คีย์จาก AI Studio ฝั่งฟรี | 2 |
| D10 | ใช้ Gemini รุ่นไหน | ไม่เริ่มงานใหม่บน `gemini-2.5-flash` (Google แนะนำรุ่นใหม่กว่าสำหรับโปรเจกต์ใหม่ และมีรายงานว่าจะถูก reroute 2026-12-01) เลือกรุ่น Flash / Flash-Lite ปัจจุบันจากหน้า models ของ Google ตอนเริ่มเฟส 2 ทดสอบกับชุดคำถามไทยจริงก่อนเลือก เก็บชื่อรุ่นไว้ค่าคงที่เดียว | 2 |
| D7 | หน่วยคิดเงิน | ราคาเหมาต่อคำตอบ AI admin ตั้งราคา | 3 |
| D8 | หักเงินเมื่อไร | รวมยอดหักวันละครั้งโดย cron + กันยอดค้างก่อนตอบ (ดูเฟส 3) | 3 |
| D9 | ยอดขั้นต่ำที่ AI ใช้ได้ | Commission: เหนือ ฿300 (`LOW_WALLET_THRESHOLD`) เพื่อไม่แย่งเงินค่าคอม, แผนอื่น: เหนือ ฿0 | 3 |

## เฟส 1: ขอใช้งาน อนุมัติ ตั้งค่า (ยังไม่มี AI)

> **สถานะ 2026-11-19:** ส่วน "ระบบ" เขียนแล้ว (ยังไม่ commit): migration 084 + `supabase/tests/084_host_ai_settings.sql`,
> `src/lib/host-ai.ts`, `/api/host/ai-admin`, `/api/admin/hosts/[id]/ai`, `/api/admin/ai-assist` พร้อม test
> ส่วน "UI" เขียนแล้วเช่นกัน (ยังไม่ commit): `/dashboard/ai-admin` (`guest-ai-card.tsx` + DOM test,
> เมนู owner-only + middleware, `e2e/host-guest-ai.spec.ts`), `/admin/guest-ai` (+ เมนู Guest AI พร้อมตัวเลข)
> route `GET /api/admin/ai-assist` ถูกลบ: หน้า admin อ่านผ่าน `src/app/admin/guest-ai/data.ts`
> ค้าง: E2E ของหน้า admin (ไม่มี admin login ที่บันทึกไว้ จึงยังไม่ได้ดูภาพหน้าจอหน้า admin)

**ระบบ**

- **Migration 084 `host_ai_settings`** (เปิด RLS ในไฟล์เดียวกัน)
  - `host_id` PK → `hosts` on delete cascade
  - `status`: `requested` / `approved` / `rejected` / `suspended`, `requested_at`,
    `decided_at`, `decided_by`
  - `enabled` (สวิตช์ของ host), สิทธิ์ทีละข้อเป็นคอลัมน์ boolean:
    `can_answer`, `can_set_dates`, `can_suggest_houses`, `can_navigate`
  - `instructions` (คำแนะนำ / FAQ ของ host, จำกัดความยาว), `daily_reply_cap` (จำนวนคำตอบต่อวัน
    **ค่าเริ่มต้น 50** ตามเจ้าของ 2026-11-19, **admin ตั้งได้คนเดียว** host เห็นแต่แก้ไม่ได้)
  - RLS เปิด **ไม่มี policy และไม่มี grant ให้ anon / authenticated** (แบบ 083): ทุกการอ่านและ
    เขียนผ่าน API route ด้วย service role, host แก้ `status` หรือเพดานเองไม่ได้
  - Rollback: `drop table` (ตารางใหม่ ไม่กระทบข้อมูลเดิม)
  - อัปเดต `src/types/database.ts` ใน change เดียวกัน
- **ปุ่มปิดฉุกเฉิน** และเพดานรวมทั้งแพลตฟอร์ม: **ย้ายไปเฟส 2** (เฟส 1 ยังไม่เรียก Gemini) ตาราง
  config คือ `platform_billing_config` (แถวเดียว, `/api/admin/billing-config`)
- API host: `src/app/api/host/ai-admin/route.ts` (GET / POST request / PATCH settings, Zod,
  owner-only `hosts.eq("user_id", user.id)`)
  - **[F-04]** PATCH ใช้ Zod `.strict()` รับเฉพาะ `enabled`, สิทธิ์ทีละข้อ, `instructions`
    (จำกัดความยาว) ห้ามส่ง body ทั้งก้อนเข้า `update()` `daily_reply_cap` เป็นของ admin
    `status` / `decided_*` เขียนได้จาก admin route เท่านั้น (`getUser()` + `isAdmin`)
  - ทดสอบ: ส่ง `status: "approved"` หรือคีย์อื่นนอก schema → 400 และ DB ไม่เปลี่ยน
- API admin: `src/app/api/admin/hosts/[id]/ai/route.ts` อนุมัติ / ปฏิเสธ / ระงับ, ลง admin audit log
- **แจ้งเตือน** คำขอใหม่ → `admin-alert.ts`, ผลอนุมัติ → host ผ่าน `notifications.ts`
- **ลบบัญชี host** ตรวจว่า cascade ลบแถวใหม่ครบ (`/api/auth/delete-account`, host reject)

**UI** (`/peaksnature-ui` ขั้น B → อนุมัติ → C → A)

- **`/dashboard/ai-admin`** (Operate, compact, phone-first) state ที่ brief ต้องครอบคลุม:
  ยังไม่ขอ → รออนุมัติ → ถูกปฏิเสธ → อนุมัติแล้ว (เปิดปิด, สิทธิ์ทีละข้อพร้อมคำอธิบายว่า
  แขกจะเห็นอะไร, คำแนะนำ, งบต่อวัน) → ถูกระงับ / ปิดฉุกเฉิน, และ loading / error ของการบันทึก
  เพิ่มเมนูใน dashboard nav ตามแบบเมนู Team
- **Admin: คิวคำขอ** (Operate, dense, English) วางในหน้า hosts หรือ needs-attention ของ
  Overview ตาม brief, ปุ่ม Approve / Reject / Suspend พร้อม confirm
- **ทดสอบ** unit ของ route ทั้ง success / error (ไม่ใช่เจ้าของ, staff, สถานะไม่ถูก), DOM test
  ของหน้า host, SQL ตรวจ RLS ราย role ให้รันเอง (anon อ่านไม่ได้, host A อ่านของ B ไม่ได้,
  host เขียนตรงไม่ได้) และ **ค้าง pgTAP**, E2E host dashboard / admin ยังไม่มี: ระบุว่าค้าง

### Brief หน้าเฟส 1 (shape, 2026-11-19 — เจ้าของให้ทำต่อได้ทันทีโดยไม่ต้องมี prototype)

**`/dashboard/ai-admin` "ผู้ช่วย AI"** (Operate, compact, phone-first, กว้าง `max-w-2xl` แบบหน้าทีมงาน)
- เมนูใหม่ก่อน "ทีมงาน" เฉพาะเจ้าของ (ซ่อนจาก staff ใน sidebar + middleware ส่ง staff ออก, API ตอบ 404)
- state: โหลด (skeleton) → โหลดไม่ได้ (ลองอีกครั้ง) → ยังไม่ขอ (การ์ดว่าง + ปุ่ม "ขอเปิดใช้ผู้ช่วย AI")
  → รออนุมัติ (amber) → ไม่อนุมัติ (ส่งคำขออีกครั้ง) → ถูกระงับ (ติดต่อทีมงาน) → อนุมัติแล้ว
- อนุมัติแล้ว: สวิตช์ "แสดงผู้ช่วยบนหน้าจอง" บันทึกทันที, สวิตช์สิทธิ์ 4 ข้อพร้อมคำอธิบายว่าแขกจะเห็นอะไร
  (บันทึกทันที, พลาดแล้วคืนค่าเดิม + toast), กล่องคำแนะนำ 2,000 ตัวอักษรพร้อมตัวนับและปุ่มบันทึก
  (บอกว่าห้ามใส่เลขบัญชี / ข้อมูลโอนเงิน: F-03), บรรทัด "ตอบได้วันละ N ครั้ง (ทีมงานกำหนด)"
- รายการ "ผู้ช่วยทำได้ / ทำไม่ได้" แบบหน้าทีมงาน: ไม่จอง ไม่ยืนยัน ไม่ยกเลิก ไม่พูดเรื่องโอนเงิน
- ใช้ปุ่ม / ช่อง / การ์ดแบบหน้าทีมงาน (pill Forest, การ์ด Sand 18 px), ข้อความใน `messages/th.json` และ `en.json`

**`/admin/guest-ai` "Guest AI"** (Operate, dense, desktop-first, English)
- เมนูใหม่ใต้ Hosts พร้อมตัวเลขคำขอที่รอ (`nav-counts`)
- ตารางแบบ Rejected payments: Requested, Host (ลิงก์), Status (`StatusBadge`), Host switch, Daily cap
  (แก้ในแถว), Decided (วันที่ + ใคร), Actions ตามสถานะ: Approve / Reject (requested), Approve (rejected),
  Suspend (approved), Resume (suspended) — Reject / Suspend มี dialog ยืนยัน
- ข้อมูลอ่านด้วย server component + `data.ts` แบบหน้า Rejected payments (route `GET /api/admin/ai-assist`
  ที่เขียนไว้ไม่จำเป็นแล้ว ลบทิ้ง), การกระทำเรียก `PATCH /api/admin/hosts/[id]/ai`

## เฟส 2: ช่องถาม AI บนหน้าที่พัก (ฟรีสำหรับ host ที่อนุมัติ = ช่วงทดลอง)

> **สถานะ 2026-11-19:** เขียนแล้ว (ยังไม่ commit) ตามคำตอบเจ้าของ: `gemini-3.5-flash-lite`, เพดานรวม 300
> คำตอบ/วัน, **ไม่เก็บข้อความของแขก** (นับแค่จำนวน จึงไม่มีตาราง `ai_messages` / cron ลบ / ประวัติให้ host
> ในเฟสนี้). Migration 085 (`platform_guest_ai_config`, `guest_ai_sessions` ใช้ id สุ่มเป็น cookie แทน token
> ที่ต้องเซ็น, `ai_usage_daily`, RPC `reserve_guest_ai_reply` / `release_guest_ai_reply`), `POST /api/guest-ai`,
> `src/lib/guest-ai/*`, ปุ่มปิด / เพดานแพลตฟอร์มบน `/admin/guest-ai`, ช่องถามบน `/book`
> (`guest-ai-assistant.tsx`, ปุ่มในแถบมือถือ, ลิงก์ใต้ช่องวันที่, แผงขวา), E2E ใน `booking-flow.spec.ts`
> (`startSession({ guestAi: true })`). ค้าง: state `ai-assist` ใน `ui-review.spec.ts` และ `impeccable critique`
> ของหน้า, ทดสอบกับ Gemini จริงด้วยคำถามไทย (ต้องรัน 084 + 085 ใน DB ก่อน)

**ระบบ**

- **`POST /api/ai-assist`** (Zod)
  - หา host จาก slug, ผ่านเมื่อ: แพลตฟอร์มเปิด + `approved` + `enabled` + ไม่ `isHostBlocked`
  - **[F-01] กันบอทและกันเงินหมด** (route นี้ใช้กฎต่างจาก booking route)
    - ไม่มี Turnstile token → **ปฏิเสธ** (`verifyTurnstileToken` คืน `"skip"` เมื่อไม่มี token
      ห้ามถือว่าผ่าน) ยอม fail-open เฉพาะตอน Cloudflare ติดต่อไม่ได้ และใช้เพดานต่ำกว่าปกติ
    - ผ่าน Turnstile แล้วออก session token ฝั่ง server: HMAC ด้วย secret ฝั่ง server, ผูก
      homestay + หมดอายุสั้น, เก็บใน cookie httpOnly / secure / sameSite แล้วนับข้อความต่อ session
    - **เพดานที่ล้มไม่ได้อยู่ใน DB:** ตาราง `ai_usage_daily` (host + วันไทยจาก `billingTodayStr()`)
      และ RPC `reserve_ai_reply` (service-role only แบบ 066 / 070 / 071, advisory lock ต่อ host)
      ตรวจและนับใน statement เดียว: จำนวนคำตอบต่อ host ต่อวัน (`daily_reply_cap`, เริ่มต้น 50) + เพดานรวมทั้งแพลตฟอร์ม
      ต่อวัน ไม่ได้แถวกลับ = ไม่เรียก Gemini (เฟส 3 เพิ่มเงื่อนไขกระเป๋าเงินใน RPC ตัวนี้)
    - `createRateLimiter` เป็นแค่ชั้นแรก (แยก instance เมื่อไม่มี Redis: F-05)
  - ส่งให้ Gemini: ข้อมูลที่พัก + บ้าน (allowlist คอลัมน์ ไม่ใช่ row `hosts` เต็มแถว: F-10),
    `instructions` ของ host, กฎแพลตฟอร์ม, วันนี้จาก `billingTodayStr()` (ตีความ "เสาร์หน้า"
    ตามเวลาไทย)
  - **[F-03] กัน prompt injection และคำตอบหลอกโอนเงิน**
    - **ห้าม**ใส่รีวิวหรือข้อความใดที่แขกเขียนลง context
    - **ห้าม**ใส่ข้อมูลการชำระเงิน (`promptpay_id`, `bank_*`, มัดจำ) กฎแพลตฟอร์ม: เรื่องโอนเงิน
      ตอบได้แบบเดียวคือ "ดูขั้นตอนชำระเงินในหน้าจอง"
    - กรองคำตอบฝั่ง server ก่อนส่ง: ตัวเลขที่หน้าตาเหมือนเลขบัญชี / พร้อมเพย์ / เบอร์โทร และ URL
      ที่ไม่ใช่ช่องทางของ host ใน DB → ทิ้งคำตอบ แสดงข้อความกลาง ๆ + ส่งต่อ host, ลง log
    - client แสดงคำตอบเป็นข้อความธรรมดา (text node ไม่ใช่ markdown / HTML /
      `dangerouslySetInnerHTML`) ปุ่มทำต่อมาจาก enum, model ห้ามคืน URL
    - ประโยคเรื่องวันว่าง / จำนวนคนที่บ้านรับได้ สร้างจากโค้ดฝั่ง client ไม่ใช่จาก model
    - ทดสอบ: context ไม่มีคีย์ต้องห้าม, คำตอบที่มีเลขบัญชี / URL แปลกถูกทิ้ง
  - ได้กลับเป็น structured output: `{ reply, intent? }` ตรวจด้วย Zod อีกชั้นก่อนส่ง client
    (**ยังไม่ได้ตรวจ** API structured output ของ `ai` v6 ต้องดูของที่ติดตั้งก่อนใช้)
  - ตัดสิทธิ์ที่ host ปิดออกตั้งแต่ server (เช่นปิด `can_set_dates` → ไม่คืน intent)
  - ตอบภาษาตาม locale ของหน้า (TH / EN)
  - Error ทุกกรณีคืนข้อความกลาง ๆ และหน้าเดิมยังจองได้ปกติ
- **ตาราง `ai_messages`** (migration 085, RLS: เจ้าของอ่านของตัวเอง, เขียนด้วย service role)
  เก็บคำถาม คำตอบ intent token เข้า/ออก ให้ host อ่านย้อนหลัง และเป็นฐานคิดเงินเฟส 3

**UI** (`/peaksnature-ui` ขั้น B → อนุมัติ → C → A)

- **ช่องถาม AI** บน `/[slug]/book`: ดู "Brief ช่องถาม AI" ด้านล่าง (prototype:
  `.impeccable/mocks/proto/ai-assist/index.html`, ตัวเลือก "ที่เลือก: มือถือ B · จอใหญ่ แผงขวา")
- **ประวัติคำถามใน `/dashboard/ai-admin`**: รายการตามวัน, ดูคำถาม / คำตอบ, empty state
- **ทดสอบ** route (ปิดอยู่, ไม่อนุมัติ, ถูกบล็อก, rate limit, Gemini error, intent ไม่ผ่าน Zod,
  สิทธิ์ที่ปิดไม่หลุด) ด้วย mock ของ AI SDK ไม่เรียก Gemini จริง, DOM test ของช่องถาม,
  spec ใหม่ใน `e2e/booking-flow.spec.ts` (stub `/api/ai-assist` ใน `startSession`),
  state `ai-assist` ใน `e2e/ui-review.spec.ts` สำหรับขั้น A

### Brief ช่องถาม AI (shape, 2026-11-19, รออนุมัติขั้นสุดท้าย)

1. **งานและผู้ใช้:** แขกไทยบนมือถือที่อยู่หน้า `/[slug]/book` แล้วยังไม่แน่ใจวันหรือบ้านพัก
   หรือมีคำถามที่หน้ายังไม่ตอบ โหมด Operate inside Persuade
2. **ผลลัพธ์:** แขกพิมพ์ภาษาพูด แล้วหน้าจองอยู่ในสถานะเดียวกับที่แขกเลือกเอง (วันที่ในช่องวันที่,
   ปุ่ม "เลือกบ้านพักนี้" กดได้, "One house first") คำถามทั่วไปตอบจากข้อมูลที่พักเท่านั้น
   ไม่รู้ก็บอกว่าไม่รู้แล้วส่งต่อ LINE / โทรของ host
3. **ตำแหน่ง (เจ้าของเลือก):**
   - **< 768 px (B):** ปุ่ม "ถาม" (outline, 52 px, ไอคอน + คำ) ซ้ายของปุ่มหลักในแถบจองล่างจอ
     เปิด bottom sheet (มุมบน 18 px, ปิดด้วย X / แตะพื้นหลัง / Esc, focus กลับปุ่มเดิม)
     ใน sheet ประวัติอยู่บน ช่องพิมพ์อยู่ล่างใกล้นิ้ว
     - แถบตอนเลือกบ้านแล้ว (สรุป + "จองเลย"): ปุ่ม "ถาม" เหลือไอคอน 52 × 52 px
       `aria-label="ถามผู้ช่วยของที่พัก"` (เจ้าของเห็นด้วย 2026-11-19)
     - ตอนเปิดหน้า แถบยังซ่อน (`useBookingBarVisible`): ลิงก์ "ถามผู้ช่วยของที่พัก" (Pine,
       ขีดเส้นใต้, 44 px) ใต้ช่องวันที่ เปิด sheet เดียวกัน ซ่อนตั้งแต่ 768 px (เจ้าของเห็นด้วย 2026-11-19)
   - **≥ 768 px (แผงขวา, เจ้าของเลือก 2026-11-19 แทนแบบ C):** ปุ่ม Pine "ถามผู้ช่วยของที่พัก"
     มุมขวาล่าง (`aria-expanded`, `aria-controls`) เปิดแผงชิดขวาเต็มความสูง กว้าง 380 px
     แบบ **ไม่ modal ไม่มีพื้นหลังมืด** หน้าเดิมใช้งานได้ต่อ แขกเห็นช่องวันที่และปฏิทินเปลี่ยนตอน AI
     เลือกวัน ตั้งแต่ 1024 px แผงดันเนื้อหาให้แคบลง 768–1023 px แผงวางทับด้านขวา (ถ้าดัน
     การ์ดบ้านจะแคบเกิน) ปิดด้วย X / Esc แล้ว focus กลับปุ่ม ปุ่มต้องไม่ชนแถบจองของเดสก์ท็อป
     (`desktop-booking-dock`) ที่ขึ้นตอนเลือกบ้านแล้ว: ตรวจตอน implement
   - เป็นกล่องเดียวกัน ย้ายระหว่าง sheet กับแผงขวาตามความกว้างจอ ประวัติไม่หาย
4. **ส่วนประกอบ:** หัวข้อ "ถามผู้ช่วยของที่พัก", ช่องพิมพ์ pill 52 px + ปุ่มส่ง 44 px, ตัวอย่างคำถาม
   (chip), คำตอบบนพื้น Mist พร้อมบรรทัดที่มาของข้อมูล, ปุ่มทำต่อ (Pine หลัก / outline รอง),
   บรรทัดแจ้ง "ผู้ช่วย AI ตอบจากข้อมูลของที่พักนี้และอาจผิดพลาดได้ ราคาและวันว่างดูจากหน้านี้เสมอ ·
   คำถามถูกเก็บ D5 วัน" แสดงคำถาม-คำตอบล่าสุด 3 ชุด
5. **State:** ว่าง (ตัวอย่างคำถาม), กำลังหาคำตอบ (จุดสามจุด, ปิดการเคลื่อนไหวเมื่อ reduced motion),
   ตอบ, ตอบ + เลือกวันให้ (ช่องวันที่กระพริบกรอบหนึ่งครั้ง, ปุ่ม "ดูบ้านพักที่ว่าง" / "เปลี่ยนวัน"),
   ไม่มีข้อมูล (ส่งต่อ host), ตอบไม่ได้ (พื้นแดงอ่อน + "ลองอีกครั้ง" + บอกให้เลือกวันเอง),
   ครบโควตา (ส่งต่อ host), host ปิด / เงินไม่พอ / host ถูกบล็อก (ไม่แสดงปุ่มและกล่องเลย)
6. **การเข้าถึง:** label ของช่องพิมพ์, คำตอบใน `aria-live="polite"`, sheet บนมือถือเป็น
   `role="dialog"` `aria-modal`, แผงขวาเป็น `<aside>` มีชื่อ (ไม่ modal), ช่องพิมพ์ 16 px (iOS ไม่ซูม), เป้ากด ≥ 44 px, focus ring Pine 2 px
7. **สิ่งที่ไม่แตะ:** ช่องวันที่, ปฏิทินบ้านพักว่าง, การ์ดบ้าน, dialog เลือกวัน / ตั้งค่าบ้าน และ
   ลำดับ section ของ `/book` ทำงานเหมือนเดิม AI สั่งผ่าน `booking-cart-context` เท่านั้น
8. **ข้อที่ตกลงแล้วที่เปลี่ยน (§9):** แถบจองล่างจอได้ปุ่ม "ถาม" เพิ่มทั้งสองสถานะ, ใต้ช่องวันที่
   บนมือถือมีลิงก์ใหม่ และจอ ≥ 768 px มีปุ่มลอยมุมขวาล่าง + แผงขวา (เจ้าของอนุมัติ 2026-11-19)
   ต้องบันทึกใน design-direction §9 และ DESIGN.md "Mobile booking bar" ตอน implement

## เฟส 3: หักเงินจากกระเป๋า

> **สถานะ 2026-11-19:** เขียนแล้ว (ยังไม่ commit) ตามคำตอบเจ้าของ: D7 ราคาต่อคำตอบ admin ตั้ง **เริ่ม ฿0**
> (ยังฟรี), D8 **รวมยอดวันละครั้ง ปัดขึ้นเป็นบาท**, D9 **Commission ≥ ฿300, แผนอื่น ≥ ฿0**
> (`guestAiWalletFloor` ใน `src/lib/guest-ai/rules.ts` ส่งเป็น `p_floor`). Migration 086: `price_per_reply`,
> `ai_usage_daily.amount` / `charged_*`, `host_ai_settings.wallet_low_notified_at`, RPC
> `reserve_guest_ai_reply(…, p_floor)` (ตรวจยอดกระเป๋าใต้ lock: F-02), `charge_guest_ai_usage` (หักวันละครั้ง ไม่ให้ต่ำกว่า 0,
> ส่วนที่เกินยอดตัดทิ้ง). cron: `src/app/api/cron/billing/guest-ai.ts` (+ ลบ session หมดอายุ). หน้าจอ: ช่องราคาและยอดวันนี้บน
> `/admin/guest-ai`, บรรทัดราคาในหน้า host, รายการ "ค่าผู้ช่วย AI" ในหน้ากระเป๋าเงิน (ตัวกรองขึ้นเมื่อมีรายการ),
> หน้ารายรับ-รายจ่ายนับค่า AI เป็นค่าแพลตฟอร์มแยกจากค่าคอม (`aiFees`)

**ระบบ**

- **ความเสี่ยงหลัก:** `wallet_negative_since` ถูกตั้งเมื่อยอดติดลบ (071) และ
  `isHostBlocked` ใช้ค่านี้บล็อกการจอง ค่า AI ต้องไม่ทำให้ยอดติดลบเด็ดขาด
- **[F-02] กันยอดแบบ atomic ไม่ใช่ "เช็กก่อน หักทีหลัง"** (หลาย request พร้อมกันห้ามผ่านด้วยยอดเดิม)
  - เพิ่มเงื่อนไขกระเป๋าเงินใน `reserve_ai_reply` (เฟส 2): ใน statement เดียวภายใต้ advisory lock
    ต่อ host เพิ่มยอดจองของวันนั้นเฉพาะเมื่อ
    `wallet_balance − ยอดจองที่ยังไม่หัก − ราคาคำตอบนี้ ≥ เกณฑ์ D9` (เกณฑ์ ≥ 0 เสมอ)
    ไม่ได้แถวกลับ = ไม่ตอบ ช่องถามเข้า state "ปิดอยู่" และแจ้ง host ครั้งเดียว
  - Gemini error / timeout → คืนยอดจองของคำตอบนั้น (ไม่คิดเงิน)
  - ผล: ยอดกระเป๋าไม่มีทางต่ำกว่าเกณฑ์จากค่า AI จึงไม่ตั้ง `wallet_negative_since`
- **RPC ใหม่ `charge_ai_usage`** (cron เรียก) แบบ 066 / 070 / 071: advisory lock ต่อ host,
  แปลงยอดจองของวันเป็นรายการเดียว: update ยอด + insert `wallet_transactions`
  (`type = 'ai_usage'`, ไม่มี CHECK constraint บน `type`) ในธุรกรรมเดียว, `SECURITY INVOKER`,
  `REVOKE ALL … FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE … TO service_role`
  ใช้ `adjust_wallet` ไม่ได้เพราะ hardcode `adjustment`
- cron หักวันละครั้ง (วันที่ตาม `billing-dates.ts` เวลาไทยเท่านั้น), หักซ้ำไม่ได้
  (unique ต่อ host + วัน)
- ราคาต่อคำตอบตั้งใน admin billing-config

**UI** (`/peaksnature-ui` โหมด C บนหน้าเดิม: ทางเดิมของ refinement)

- หน้า wallet ของ host แสดงรายการ `ai_usage` ด้วยรูปแบบรายการเดิม
- `/dashboard/ai-admin` แสดงยอดใช้วันนี้ / เดือนนี้ และคำเตือนเมื่อใกล้เกณฑ์
- admin billing-config เพิ่มช่องราคาต่อคำตอบ

**ทดสอบ** unit วันที่ด้วย `vi.setSystemTime` (ไม่พึ่ง TZ pin), gate ยอดคงเหลือ,
SQL ตรวจ RPC: anon / authenticated เรียกไม่ได้, หักซ้ำวันเดียวกันไม่ได้, ยอดไม่ติดลบ,
**จองยอดพร้อมกันหลาย session (เช่น 20 ครั้งพร้อมกันตอนยอดพอแค่ 1 ครั้ง) ผ่านได้ครั้งเดียว**

## เฟส 4: แนะนำบ้านและพาไปทำต่อ

> **สถานะ 2026-11-19:** เสร็จ. คำตอบที่มี `room_ids` (เปิด `can_suggest_houses`) แสดงบ้านที่ว่างสำหรับช่วงวันที่ได้สูงสุด 2 หลัง
> พร้อมราคาแบบเดียวกับการ์ดบ้าน (`calculateTotalPrice`) ปุ่ม "เลือกบ้านพักนี้" ปิดแผงแล้วส่ง `choose-house` ให้ `RoomsSection`
> เปิด dialog ตั้งค่าบ้านตัวเดิม (เช็กเดิม, จำนวนคน / ตัวเลือก / โหมด guest-quick ของหน้าเอง) แขกกด "จองเลย" เอง.
> `can_navigate` (เปลี่ยนวัน / เช็คอิน / ติดต่อ LINE-โทร) ทำไว้ตั้งแต่เฟส 2. E2E: ถาม → เลือกบ้าน → dialog → ถึงหน้ากรอกข้อมูล
> ทั้งโหมด normal และ quick ที่ 375 / 1280 px

**ระบบ**

- `can_suggest_houses`: การ์ดข้อเสนอ "บ้าน A, 4 คน" → แขกกด → `addLine` → `proceed-booking`
  (แขกกดเองทุกครั้ง AI ไม่เพิ่มบ้านลงการจองเอง)
- `can_navigate`: ปุ่มไปหน้าเปลี่ยนวัน / เช็คอิน / ติดต่อ host
- รองรับ `guest_booking_mode` ทั้ง guest และ quick

**UI** (`/peaksnature-ui` ขั้น B → อนุมัติ → C → A)

- การ์ดข้อเสนอบ้าน: ใช้รูปแบบการ์ดบ้านเดิม (ไม่สร้างการ์ดใหม่), ราคาจาก `computeLineGross`
- ปุ่มพาไปหน้าอื่น: ใช้ปุ่มและลิงก์เดิม ชื่อตรงกับเมนู header

**ทดสอบ** spec E2E ใหม่: ถาม → เลือกบ้าน → ถึง checkout step 1 (ห้ามส่ง step 2)

## เฟส 5: ดูแลระยะยาว

- cron ลบ `ai_messages` เกิน D5 วัน (ยังไม่มี cron แบบนี้ในระบบ)
- รายงาน admin (`/peaksnature-ui` B → C → A, dense, English): จำนวนคำตอบ, token จริง,
  ค่า Gemini เทียบรายรับต่อ host

**สถานะ (2026-11-19, ยังไม่ commit):**
- ทำแล้ว: migration 087 (`input_tokens` / `output_tokens` ใน `ai_usage_daily`, `cost_in_per_mtok` /
  `cost_out_per_mtok` ใน `platform_guest_ai_config`, RPC `record_guest_ai_tokens` service-role only)
  route บันทึก token จริงจาก Gemini หลังตอบ (`after()`) หน้า `/admin/guest-ai` มีตาราง "Cost, last 30 days"
  ต่อ host + รวม และช่องกรอกราคา ฿ ต่อ 1M token (เริ่มที่ 0 = ยังไม่คิด ไม่เดาราคาให้)
- ต้องรัน 087 ก่อน deploy โค้ดชุดนี้ (route จะ log error ทุกคำตอบถ้ายังไม่มี RPC แต่แขกยังได้คำตอบ)
  แล้วรัน `supabase/tests/087_guest_ai_tokens.sql`
- ไม่ทำ: cron ลบ `ai_messages` เพราะไม่ได้เก็บข้อความแขก (ตัดสินแล้ว) ไม่มีอะไรให้ลบ

## ไม่อยู่ในแผนนี้

- ปุ่มไมค์ / พูดแทนพิมพ์ (เจ้าของสั่งพักไว้ 2026-11-19)
- AI รับโทรศัพท์แทน host (ต้องมีผู้ให้บริการเบอร์ = package + ค่าบริการใหม่)
- LINE OA / Messenger
- ผู้ช่วยฝั่ง host ที่สั่งงานหลังบ้านได้
- AI สร้าง / ยืนยัน / ยกเลิกการจองเอง

## ความเสี่ยงที่ยังเหลือ

- AI เข้าใจคำขอผิด: แขกเห็นบนปฏิทินและแก้ได้ ไม่มีการจองเกิดโดยไม่กด
- แขกพิมพ์หลอก AI: AI ไม่มีเครื่องมือที่เขียนข้อมูล และหน้าปลายทางตรวจเองตามเดิม
- host เขียนคำแนะนำให้ AI พูดเรื่องไม่จริง: เป็นความรับผิดชอบของ host, admin ระงับได้
- ต้นทุน Gemini ขึ้นราคา: รายงานเฟส 5 + admin ปรับราคาต่อคำตอบได้
- ช่องถามอาจชนข้อที่ตกลงแล้วของหน้าที่พัก (§9): brief ขั้น B ต้องระบุจุดที่ชนก่อนเขียนโค้ด
