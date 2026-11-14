# UI/UX audit

Date: 2026-11-11. Scope: every route in `src/app` except API handlers.
Read-only: no application code was changed for this audit.

Related files: `PRODUCT.md` (product truth), `DESIGN.md` (the system as
built), `docs/design-direction.md` (where it is going) and
`docs/ui-improvement-roadmap.md` (the order of work).

## How this audit was done

**Evidence**
- **Code:** read and grep-measured across `src/app` and `src/components`.
  Counts quoted below are `grep` occurrence counts over `*.tsx`.
- **Rendered pages:** captured with headless Chrome 157 over CDP at 375, 768
  and 1280px, Thai locale, against `npm run dev` on the local data
  (`/ing-khoa-camping` has 5 houses; `/cozy-villa` has none).
  - Demand tracking was blocked and cookies were declined.
  - The guest booking flow was driven up to checkout step 2 and never
    submitted. The dev server log shows no booking, hold or draft request.
  - The dashboard and admin were reviewed from code only, without a login.
  - The payment step (step 3) was reviewed from code only, because reaching it
    creates booking holds.
- **Measurements:** a browser script counted horizontal overflow, text under
  12px, letter-spaced Thai text, targets under 24/44px, unlabelled inputs,
  unnamed controls, headings and landmarks.
- **Contrast:** WCAG 2.x ratios were computed by a self-checking script from
  the token values in `src/app/globals.css` and Tailwind's `theme.css`.

**Skills**
- **Impeccable `audit`:** the five scores below.
- **Impeccable `critique`:** run on `/` and `/[slug]/book`. Each run used
  two isolated subagents: a design review (A) and the Impeccable detector
  with browser evidence (B). The critique's closing questions are replaced
  by the roadmap approval, as agreed in the plan.
- **Emil Kowalski `improve-animations`:** the motion audit, run inline in
  one context, with no plan files.
- Subagent findings were spot-checked against the code before inclusion. The
  B runs verified every detector finding they report.

**Severity**

| Here | Impeccable | Meaning |
|---|---|---|
| **Critical** | P0 | blocks the task |
| **High** | P1 | major difficulty, or fails WCAG 2.2 AA |
| **Medium** | P2 | annoying, a workaround exists |
| **Low** | P3 | polish |

**Settled decisions** are not reported as issues. They are listed in
`docs/design-direction.md` §9.

## Summary

### Audit health score

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 2 | The checkout form's labels are not tied to its inputs and its focus ring is removed; secondary text across the guest site fails 4.5:1. |
| 2 | Performance | 2 | Home content waits for JavaScript at `opacity: 0`; 72 `transition-all`; Geist downloads but barely renders. |
| 3 | Theming | 2 | Tokens exist and dominate the guest side, but shadcn's semantic tokens are unmapped (near-black primary) and the dashboard uses 489 raw greys. |
| 4 | Responsive | 3 | No horizontal overflow at any width tested; real issues are a clipped carousel, thin desktop gutters and small targets. |
| 5 | Implementation integrity | 2 | Three visual languages, and template patterns the detector flags (faux italic, eyebrow kickers, icon tiles, nested cards). |
| | **Total** | **11/20** | **Acceptable: significant work needed** |

Critique scores (Nielsen heuristics):
- `/`: **18/36**, Acceptable, at the bottom edge (H7 n/a, Persuade surface).
- `/[slug]/book`: **22/40**, Acceptable (55%). Operate inside a Persuade
  shell; all 10 heuristics apply.

### Counts

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 13 |
| Medium | 33 |
| Low | 21 |
| **Total** | **67** |

No Critical issue was found in the parts that could be exercised. Payment
(step 3) and slip upload were reviewed from code only, so that remains
unproven.

### Top five

1. **The booking form's accessibility.** On checkout step 2:
   - visible labels are not tied to their inputs;
   - there is no `autocomplete`;
   - focus rings are removed;
   - labels are 2.98:1 and letter-spaced;
   - inputs render at 14px, so iOS zooms in (B1).
2. **The least guidance at the highest stakes.**
   - The payment step has an unlabelled countdown and a QR to scan from the
     same phone, and an expired hold clears the dates and the slip (B11).
   - Adding a house gives no feedback, and a second tap reports a false
     "unavailable" (B12).
3. **Thai readability.**
   - Secondary text fails contrast: `earth-500` is 4.33:1 and `earth-400`
     2.98:1 as text (S2).
   - Thai is letter-spaced in 25–28 elements on `/book` and 11–12 on `/`
     (S3).
4. **The home page.** Content stays invisible until JavaScript runs, the hero
   is a non-Thai photo, homestays come third, and the phone carousel clips
   the first card (H1–H4).
5. **The host dashboard.** It speaks a different, cool-grey visual
   language, and the plan-expiry and blocked banners that tell hosts they are
   about to lose bookings fail contrast (S7, D1).

### What works

These are worth keeping:
- **Honest proof.** Stats come from the database and hide themselves when
  weak (`src/lib/landing-stats.ts`). The verified badge shows only for
  verified hosts. Nothing on a rendered page is invented.
- **A clear booking flow on a phone.** Dates first, a house dialog with
  tiers and add-ons and a running total, a cart sheet, then a stepped
  checkout. One Forest pill per step. Day cells are 44 × 44px.
- **Brand colour.** Forest #2F5D50 passes AAA (7.49:1) as text and as a
  button fill.
- **Reusable patterns already in the repo:**
  - `FullScreenMenu`: 44px rows, unspaced Thai, labelled close.
  - `SectionMark` / `SectionHeading`: Latin numerals carry the tracking.
  - Admin's `StatusBadge`, `EmptyState` and `PageHeader`.
  - The locale gate in `booking-footer.tsx`.
- **No horizontal overflow** at 375, 768 or 1280px on any page tested. Every
  image has alt text; none are broken.
- **Modal overlays render correctly.** Dialogs and sheets are Radix: focus
  trap, Esc, and `bg-black/50` verified in the live DOM.

## 1. Architecture summary

- **Stack:**
  - Next.js 16.1.6 (App Router, Turbopack), React 19.2.3, TypeScript strict.
  - Tailwind CSS v4, configured in CSS in `src/app/globals.css` (`@theme
    inline`; no `tailwind.config`).
  - shadcn/ui `new-york` on `radix-ui` (21 primitives in
    `src/components/ui`).
  - `motion` 12.40.0, `tw-animate-css`, `lucide-react`, `react-day-picker`
    9, `recharts` 3, `sonner`, `next-intl` 4 (Thai default, English by
    cookie).
- **Surfaces:**
  - **Guest:**
    - `/`, the platform home.
    - `/[slug]`, one homestay's landing.
    - `/[slug]/book`, booking and checkout.
    - `/[slug]/{change-booking,check-in-out,reviews}`.
    - `/upload-slip/[sessionId]`, the slip upload handed off to a phone.
    - Static: `/about`, `/legal`, `/trust-safety`, `/host-guidelines`,
      `/recommender`.
  - **Auth:** `/login`, `/register`, `/forgot-password`, `/reset-password`.
  - **Host dashboard:** `/dashboard` plus 11 pages, all client components.
  - **Admin:** `/admin` plus 8 pages and `/admin/login`, English-only.
- **Rendering:**
  - Guest pages are Server Components that fetch through
    `src/app/[slug]/data.ts`, with client islands.
  - `BookingSection` and `MobileBookingBar` load with `next/dynamic`.
  - Dashboard and admin pages are `"use client"` and read and write Supabase
    from the browser, or call `/api/*` route handlers.
  - Only `/[slug]`, `/[slug]/book` and `/admin` have `loading.tsx`. No route
    has `error.tsx`.
- **Booking path:**
  - Data: `BookingCartProvider` (in memory, not persisted) → `RoomsSection`
    and `RoomConfigDialog` → `MobileBookingBar` / `HeaderCart` →
    `BookingSection`.
  - Steps: dates → details → payment.
  - API: step 2 → 3 creates holds (`POST /api/bookings/hold`) and a draft
    (`POST /api/bookings/draft`, `booking-section.tsx:706-771`). Slip
    verification goes through `/api/verify-slip`. Funnel events go to
    `/api/demand`, skipped when cookies are declined
    (`src/lib/demand-track.ts:180`).
- **Tests:** Vitest unit tests sit next to the source (`*.test.ts`). No
  Playwright or visual regression; UI checks are manual CDP screenshots.
- **Size hot spots:** host pages are monoliths. `dashboard/rooms` is 2,452
  lines, `promo-codes` 2,122, `bookings` 1,628 and `homestay` 1,532.
  `booking-section.tsx` is 2,132 and `booking-search-view.tsx` 1,526.

## 2. Design system assessment

Recorded in full in `DESIGN.md`. The state of play:

- **Colour.**
  - The real system is `brand` (635 uses) plus `earth-*` (1,305 uses).
  - **shadcn's semantic tokens were never mapped** (`globals.css:69-102`).
    `--primary` is #171717, so the default `<Button>` is black, as on the
    admin settings, bookings and hosts pages. `--ring` and `--border` are
    neutral greys.
  - **Off-system colour:**
    - 843 raw grey uses: gray, stone, slate, zinc, neutral.
    - 37 hexes in class names and 63 quoted hex strings, for example
      `bg-[#f8f9fa]`, `bg-[#F83858]` and `text-[#111111]`.
    - Rainbow status colours.
  - **Dark mode is dead code:** a `.dark` block and 29 `dark:` variants, with
    no theme provider.
- **Type.**
  - Serif display (Playfair Display + Noto Serif Thai) is coherent.
  - Body text is the system stack by accident. Geist is loaded but `@theme
    inline` never defines `--font-sans` on `:root`, verified in the browser:
    `--font-sans` and `--default-font-family` are unset.
  - Text sizes run 9–11px in 111 places and `text-xs` in 422.
  - About 140 `tracking-*` classes, many on Thai.
- **Shape.** Five radii compete: `rounded-full` 257, `xl` 136, `lg` 128,
  `2xl` 74, `md` 74, and `3xl` on the booking card.
- **Elevation.** Shadows on CTAs and cards (`shadow-lg` / `shadow-xl`), glass
  on two navs (`.glass-nav`), gradients in 27 places.
- **Components.** 277 shadcn `<Button>` against 157 raw `<button>`. The
  `Button` base has `transition-all` and a 36px default height.
- **States.** Loading uses `Skeleton` (180) plus a custom `skeleton-warm`, and
  126 `Loader2` spinners. There is no error boundary.
- **Per surface:**

| Surface | Neutrals | Brand uses | Serif uses | Shape |
|---|---|---|---|---|
| Guest | earth 705, gray 38 | 214 | 39 | pills |
| Host | gray 489, earth 241 | 212 | 10 | md/lg/full |
| Admin | earth 250 | 94 | 13 | quiet |
| Auth | gray 103 | 14 | 0 | generic shadcn |

## 3. Issues by page

Each issue lists its evidence, its impact and the fix. Commands are Impeccable
sub-commands. The "Evidence" column cites `file:line`, a measurement, or a
screenshot description.

### 3.1 Systemic (every surface)

| ID | Sev | Issue | Evidence | Fix | Command |
|---|---|---|---|---|---|
| S1 | High | Default buttons render black | `button.tsx:12` uses `bg-primary`; `--primary` is `oklch(0.205 0 0)` (#171717) at `globals.css:77`. Unstyled `<Button>`s on the admin pages (for example `admin/settings/page.tsx:374`). | Map `--primary`/`--ring` to Forest in `:root` (phase 0), so every default button becomes brand without touching call sites. | colorize |
| S2 | High | Secondary text fails AA | `earth-500` is 4.33:1 on white and 4.09:1 on `earth-50` (31 paragraph uses). `earth-400` is 2.98:1 (17 paragraph uses, plus the form labels). Footer `earth-500` on `earth-900` is 3.03:1 (`landing/footer.tsx:25`). | Text is `earth-600` or darker on light surfaces, and `earth-300` or lighter on Charcoal. | typeset |
| S3 | High | Letter-spaced and uppercased Thai | 25–28 elements on `/book` (for example weekday headers, form labels, CTA labels) and 11–12 on `/`, measured in the browser. About 140 `tracking-*` classes. | Use tracking only on Latin. Reuse the gate in `booking-footer.tsx:155` and `full-screen-menu.tsx`. | typeset |
| S4 | High | Reduced motion ignored outside `/[slug]` | `RespectReducedMotion` is used only in `src/app/[slug]/page.tsx:201`. `.hero-mist` (`globals.css:229-256`) and `.skeleton-warm` (`:344-355`) have no reduced-motion rule. | Wrap every surface's root in `RespectReducedMotion`, and add RM rules to the keyframes. | animate |
| S5 | High | Icon-only buttons with no accessible name | 21 `size="icon"` buttons with no label:<br>• `dashboard/rooms/page.tsx` (14: edit/delete at 1288, 1296, …)<br>• `dashboard/calendar/page.tsx:839,850` (month navigation)<br>• `sidebar.tsx:84,190`<br>• `admin-shell.tsx:79,152,229`<br>Plus the dashboard mobile menu (`dashboard-shell.tsx:110`), the password toggles on all 3 auth pages, the home user and search buttons (`navbar.tsx:99`, `hero.tsx:98-108`), and the checkout back arrow (`booking-section.tsx:1593`). | Add an `aria-label` to every one; list them in the PR. | harden |
| S6 | Medium | Text under 12px | 111 uses of `text-[9-11px]` (booking 41, dashboard 31, admin 20), plus `text-[0.7rem]` weekday headers. 13 sub-12px text nodes on `/book` at 375px. | 12px floor (caption token). | typeset |
| S7 | Medium | Three visual languages | Guest: earth + serif. Host: cool grey with a hard-coded `bg-[#f8f9fa]` background (`dashboard-shell.tsx:92`). Admin: earth plus a cool `section-alt` #F7F7F5. Auth and `/upload-slip`: generic grey, and blue. | One token set; host surfaces move to `earth-*` (phase 0 tokens, then per-page passes). | colorize |
| S8 | Medium | Body font is accidental | Geist loads (`layout.tsx:20-23`, Latin subset only) but the body computes to `ui-sans-serif, system-ui`. 9 `.font-sans` elements on `/[slug]` get Geist. Thai renders in the OS face (Thonburi on macOS). | Decide (design-direction §5): make the system stack official, or load a Latin + Thai pair. | typeset |
| S9 | Medium | Faux italic on Thai | `italic` spans in serif headings: `landing/hero.tsx:56`, `why-peaksnature.tsx:50`, `for-hosts.tsx:59,115`, `booking-section.tsx:1310-1312`. Noto Serif Thai is loaded at 400/700 only (`layout.tsx:35-39`), so the slant is synthesised. Detector: `italic-serif-display`. | Emphasise with Forest colour instead. | typeset |
| S10 | Medium | Effects the brief rules out | `.glass-nav` on two navs (`globals.css:205-210`). Gradient CTA card and button (`for-hosts.tsx:106,125`). `shadow-lg` on CTAs (`rooms-section.tsx:496,511`). The booking card is `rounded-3xl shadow-xl` (`booking-section.tsx:1361`). Nested cards (detector). | Flat at rest: solid header with a Sand border, flat pills, 18px cards, one surface per card. | quieter |
| S11 | Medium | No error boundaries | No `error.tsx` or `global-error.tsx` anywhere. A thrown render error shows Next's default page, with no brand and no way back. | Add `src/app/error.tsx`, `global-error.tsx` and one per surface root. | harden |
| S12 | Medium | Status colours differ by surface | Host: yellow, blue, green, red, gray, purple (`dashboard/bookings/page.tsx:196-203`). Admin: brand, earth, amber, destructive (`components/admin/status-badge.tsx`). | Share `StatusBadge` tones everywhere. | colorize |
| S13 | Medium | Weak or missing focus | `focus-visible:!ring-0` on checkout inputs (`booking-section.tsx:1602`); the home search input is `outline-none` with no replacement (`hero.tsx:91`); `ring-brand/40` (1.94:1) on CTAs; `ring-brand/20` (about 1.36:1) on date-picker days (`calendar.tsx:166`). | A 2px solid Forest ring (7.49:1) on every interactive element. | harden |
| S14 | Medium | Landmarks and headings | Auth pages: no `<h1>`, no `<main>` (`login`, `register`, `admin/login`). Static pages have no `<main>`. No `<header>` landmark on guest pages. | Add `main`, `header` and one `h1` per page. | harden |
| S15 | Low | `transition-all` and no motion tokens | 72 `transition-all`, including the `Button` base. Five ad-hoc easings. | Name the properties; add ease tokens (see §7). | animate |
| S16 | Low | Dead code | Unused CSS: `card-hover`, `dashboard-grain`, `sidebar-dark`, `admin-card`. Unrendered `landing/reviews.tsx` (with invented testimonials), `gallery.tsx` and `experience.tsx`. The `.dark` block and `dark:` variants. Duplicated `@apply` lines (`globals.css:140-145`). A custom `.tabular-nums` duplicates Tailwind's utility. | Delete; the testimonials first. | distill |
| S17 | Low | Browser chrome colour is off-brand | `themeColor: "#16a34a"` (`layout.tsx:42`) and the manifest's `theme_color`, against brand #2F5D50. | Set both to #2F5D50. | polish |
| S18 | Low | English strings and titles on Thai pages | Auth `<title>`s ("Sign In"); footer "Nature Places in Thailand" and "all rights reserved"; "No image" (`homestay-card.tsx:49`); `/upload-slip` copy. | Move to `messages/*.json` (not `/admin`). | clarify |

### 3.2 Platform home `/`

| ID | Sev | Issue | Evidence | Fix | Command |
|---|---|---|---|---|---|
| H1 | High | Content invisible until JavaScript; decorative motion | The h1, subtitle, search and homestay cards are server-rendered at `opacity: 0` (`hero.tsx:48-72` with blur; `unique-homestays.tsx:71-76,99-104`): 19 elements in the server HTML. Also: parallax and a scroll-linked fade of the live search (`hero.tsx:16-18`), a progress bar (`landing-content.tsx:33-37`), the mist loop. No `RespectReducedMotion`. | Start visible (the rule set for `/[slug]` on 2026-11-05); delete the parallax, scroll fade, progress bar and mist; wrap the page in `RespectReducedMotion`. | quieter |
| H2 | High | Hero photo is not Thailand | `/hero-mountain.jpg` shows snow peaks, a glacial river and spruce. Its alt says "Mountain landscape in northern Thailand" (`hero.tsx:33`). Thai guests will notice. | A licensed Thai landscape, or a host photo used with permission; honest alt. | delight |
| H3 | High | First card clipped on phones | The swipe row is `snap-mandatory` with no `scroll-padding` (`unique-homestays.tsx:69`), so card 1 snaps to x=0 and its first Thai glyph, pin and ฿ are clipped (375px capture). | Add `scroll-pl-4`, or stack the cards on phones. | adapt |
| H4 | Medium | Homestays come third | At 375px the first card is about 2,105px down, behind a philosophy block of about 1,076px; the host pitch (about 1,210px) is larger than the listing (about 847px). | Hero (about 70svh on phones) → homestays → a short why → hosts. | layout |
| H5 | Medium | The search is a silent filter | Substring match on name and location only (`unique-homestays.tsx:34-39`): "Chiang Mai" misses "จ.เชียงใหม่". No result echo, count or clear. The empty state has no reset (`:140-147`). The visible label is not tied to the input (`hero.tsx:82`). | "ผลการค้นหา "X" · N แห่ง · ล้าง" above the results; a reset button; `htmlFor`; focus ring. | harden |
| H6 | Medium | Copy contradicts the product | "ที่พักของเราถูกสร้างขึ้น…" (`why-peaksnature.tsx:69`) casts Peaksnature as the builder; PRODUCT.md says platform, not provider. Unverified "sustainable" and "true privacy" claims (`:8-25`). Cards drop the verified badge (`homestay-card.tsx` never reads `is_host_verified`) and show the minimum price without "เริ่มต้น". | Replace with the real mechanisms: book direct, slip checked automatically, deposit then balance on arrival. Show the badge and "from". | clarify |
| H7 | Medium | Desktop layout feels unfinished | At 1280px the `max-w-7xl` container equals the viewport, so content sits 16px from the edge. A centred heading sits over a left-aligned two-card grid with an empty third column. | Container below viewport width, or larger gutters; centre or fill the grid. | layout |
| H8 | Low | Footer and help links mislead | "คำถามที่พบบ่อย" opens the contact form (`footer.tsx:71-77`). A referrer-stats link sits in the guest footer. `PlatformFooter` links `/#contact`, which `/` does not have (`platform-footer.tsx:56`). Cookie buttons are 32px with a 24px X (`cookie-consent.tsx:50-85`). | Point FAQ at real answers or rename it; fix the anchor; 44px cookie buttons. | clarify |
| H9 | Low | Template patterns | Detector: `kicker-above-heading` ×4, `icon-tile-stack` rows (`why-peaksnature.tsx:98`, `for-hosts.tsx:84`), italic accent words. The near-invisible "สำหรับเจ้าของที่พัก" band (2.81:1, 0.3em tracking, `for-hosts.tsx:33`). | Remove eyebrows that repeat the heading; plain rows or a short list. | distill |

### 3.3 Homestay landing `/[slug]`

Reworked with the owner on 2026-11-05; most of it is settled. Measurements at
375px: no overflow, 2 sub-12px text nodes, 1 letter-spaced Thai string, 1
target under 24px.

| ID | Sev | Issue | Evidence | Fix | Command |
|---|---|---|---|---|---|
| L1 | Low | Tiny text in the sticky bar and footer | 11px "เริ่มต้น ฿5/คืน" (`mobile-booking-bar.tsx:165`, `text-white/85`, 5.95:1) and 11px "ติดต่อ" in the footer. | 12px. Keep the CTA height fixed (settled: no reflow). | typeset |
| L2 | Low | House names say ห้องพัก | "ห้องพัก A…" are host-authored database rows, not code (vocabulary memo). | A data note for hosts; nothing to change in code. | none |

### 3.4 Booking `/[slug]/book`

Flow captured at 375px: dates → house dialog → cart sheet → step 1 → step 2.

| ID | Sev | Issue | Evidence | Fix | Command |
|---|---|---|---|---|---|
| B1 | High | The guest-details form is not accessible and is hard to fill on a phone | Five inputs (name, email, phone, note, referral):<br>• visible `<label>`s have no `htmlFor`/`id`, so screen readers fall back to the placeholder (`booking-section.tsx:1598-1649`);<br>• errors are not linked to their fields;<br>• no `autoComplete` anywhere in the file (WCAG 1.3.5);<br>• `text-sm` overrides the Input's `text-base`, so inputs are 14px and iOS zooms in on focus.<br>Labels are `text-[13px] uppercase tracking-[0.15em] text-earth-400` (2.98:1), fainter than the placeholders. Focus is `focus-visible:!ring-0` with only a border shift to `earth-400`. The icon back buttons have no name (`:1593`, `:1704`, `:1821`, `:1824`). | Tie labels and errors (`htmlFor`/`id`, `aria-describedby`, `required`); `autoComplete="name"/"email"/"tel"`; 16px inputs; `earth-700` labels, unspaced; a 2px Forest ring; name the back buttons. | harden |
| B2 | High | Low-contrast status and helper text | Step dots: 10px, 2.51:1 (`booking-section.tsx:1396-1398`). The "ยอดนิยม" badge: white on amber, 2.08:1 at 11px (`rooms-section.tsx:371`). Next-month days at `opacity-55`, 2.5–2.7:1, though still clickable (`availability-calendar-section.tsx:91`). The 11px helper line at 2.98:1 (`booking-section.tsx:1530`). The cart count: white on #F83858, 3.69:1 at 11px (`mobile-booking-bar.tsx:189`). | Darker inks: Charcoal on an amber tint for "popular", `earth-600` for helpers, full-opacity clickable days, 12px floors. | colorize |
| B3 | Medium | Text over photos depends on the photo | White house name and price over the photo. "ห้องพัก B" over a pale wall is hard to read at 375px. "เริ่มต้น" at `text-white/70` measures 4.1:1 on one photo (`rooms-section.tsx:466`). | A bottom scrim that guarantees 4.5:1 (the Photo Scrim Rule). | layout |
| B4 | Medium | Dates in two formats | The dialog and the cart sheet use "พ.ย. 18, 2569" (`MMM d, yyyy`, `booking-calendar-dialog.tsx:158,166`; `mobile-booking-bar.tsx:211`); the bar uses "18 พ.ย." | One Thai-order format ("18 พ.ย. 2569") from a shared formatter. | clarify |
| B5 | Medium | The step indicator lands under the header | "ดำเนินการจอง" scrolls `#booking-section` to `block: "center"` (`mobile-booking-bar.tsx:116`, `header-cart.tsx:45`). At 375px the card's stepper sits under the fixed header (capture of step 2). | `scroll-margin-top` equal to the header height, with `block: "start"`. | adapt |
| B6 | Medium | The task surface animates | The checkout card fades and scales in on scroll over 0.6s (`booking-section.tsx:1356-1360`). The desktop date search fades in over 0.5s (`desktop-date-search.tsx:47-51`). | No entrance on task surfaces, or opacity only at 200ms. | quieter |
| B7 | Medium | A homestay with no houses is a dead end | `/cozy-villa/book` shows the checkout card asking for dates, under "จองแล้วได้รับการยืนยันทันที", with nothing bookable. | An empty state: "no houses open for booking yet", plus contact. | onboard |
| B8 | Low | Small targets | Photo dots 14 × 22px (`rooms-section.tsx:441`); "ดูรายละเอียดที่พัก" 16–20px tall (`hero-section.tsx:152`). The consent checkbox is 16px but sits inside a `<label>`, so its effective target passes. | 24px minimum, 44px for frequent taps. | adapt |
| B9 | Low | Thai CTAs uppercased and tracked, with shadows | "เลือกบ้านพักนี้", "วันว่าง & ราคา" and "เสร็จสิ้น" use `uppercase tracking-widest` (`rooms-section.tsx:496-515`, `booking-calendar-dialog.tsx:227`), plus `shadow-lg`. | Latin-only tracking, flat pills. | polish |
| B10 | Low | Filler above the booking card | Four icon rows of generic reassurance and an icon tile (`final-cta-section.tsx:27`); a nested empty-cart panel (`booking-section.tsx:1467`). | Replace with the three real mechanisms, or remove. | distill |
| B11 | High | The payment step gives the least guidance at the highest stakes (reviewed from code) | The hold countdown is an unlabelled "9:59" chip (`booking-section.tsx:83-105`). On a phone the guest is told to scan the QR on the screen she is holding; "บันทึกรูป QR" is a small pill (`:1880`) and a data-URL download (`:524-546`; on iOS it may land in Files, not Photos; unverified). Deposit-or-full is chosen under the clock. When the hold expires, dates and slip are cleared (`:899-907`) even if she already paid in her bank app. | Label the timer ("ชำระเงินภายใน 9:59") and warn at 2 minutes. On phones: three numbered steps and a full-width "save QR". Choose the deposit on the review screen. On expiry, keep the slip and offer "โอนแล้ว" (hold again, then verify). | harden |
| B12 | High | Adding a house is silent, and a second tap reports a false error | After "เพิ่มลงรายการจอง" the house card looks unchanged (flow capture 07). Its button stays enabled (`rooms-section.tsx:529`), and a second tap on a single-unit house toasts "ไม่ว่างสำหรับวันที่เลือก" (`:572-574`), which reads as a failed booking. In the availability-day dialog, "จองบ้านพักนี้" only sets the dates and scrolls back to the list (`availability-calendar-section.tsx:500-514`). | An in-cart state on the card ("✓ อยู่ในรายการจอง · แก้ไข"), a confirmation with "ดูรายการจอง", and "จองบ้านพักนี้" that opens that house's dialog. The settled rule stays: disabled until dates are chosen. | clarify |
| B13 | Medium | Three calendars, three behaviours | Tapping a day in the availability grid opens a house list. The booking dialog has no legend, and booked nights look exactly like past days (`calendar.tsx:86-87`, both `text-earth-400`). The per-house "วันว่าง & ราคา" calendar is single-select, with no action (`rooms-section.tsx:699-723`). Its focus ring is `ring-brand/20`, about 1.36:1 (`calendar.tsx:166`). | One calendar language: the same legend, a distinct "booked" style, a range picker with a CTA, and a solid focus ring. | distill |
| B14 | Medium | The phone's Back never goes back a step | Any Back, at any step, opens the leave dialog with only "จองต่อ" or "ออกและล้างข้อมูล" (`booking-section.tsx:1193-1207`; the leave label is 2.98:1, `leave-booking-dialog.tsx:109`). Deliberate: re-pushing history inside `popstate` destabilises Next.js (code comment). | Keep the guard; add "กลับไปขั้นตอนก่อนหน้า" to the dialog, and darken the leave label. | clarify |
| B15 | Medium | Province is a 77-item English-ordered list | Required `จังหวัด` options are sorted by romanised name (`src/lib/provinces.ts:8-84`: Amnat Charoen, Ang Thong, Bangkok…), so Thai readers can't find เชียงใหม่ by its Thai initial. | Sort by Thai label (`localeCompare("th")`) when the locale is Thai; consider type-to-search. | harden |
| B16 | Medium | The house dialog forgets the context | It shows "รวม ฿200" without the dates or nights (`room-config-dialog.tsx:258-269`). Tier buttons don't expose which is selected (`:138-157`, no `aria-pressed`). Nothing is preselected among 4 tiers and 2 add-ons. | Show "18–20 พ.ย. · 2 คืน" beside the total; `aria-pressed` on tiers; preselect the base tier. | clarify |
| B17 | Medium | Weak reassurance on price and outcome (reviewed from code) | Deposit and full amounts are 12px `earth-500` (`booking-section.tsx:1838,1844`). The balance due is `amber-600`, about 3.0:1 (`:1887`). "ตรวจสอบอัตโนมัติ" is 12px `earth-400` (`:1971`). The success modal uses the same check icon for pending (`:2004`), its primary CTA is "จองที่พักเพิ่ม", and dismissing it loses the receipt (`:2000`). The hero promises "ยืนยันทันที" for every host (`hero-section.tsx:121-126`). | Price breakdown in `earth-700` at 14px; a pending state with its own icon and words; keep the receipt reachable; promise instant confirmation only where it holds. | clarify |
| B18 | Medium | Recovery is easy to miss | Slip errors are specific but arrive as 4-second toasts in the top right (`src/app/layout.tsx:143`). A refresh before step 3 empties the cart, which lives in memory only (`booking-cart-context.tsx:104`). On phones the sticky "จองบ้านพัก" bar covers the step-1 CTA (flow capture 09). | Errors inline next to the upload; persist the cart per homestay in `sessionStorage`; hide the bar once the booking card is in view. | harden |
| B19 | Low | The steps are numbers only | The stepper shows 1-2-3 though step names exist (`booking-section.tsx:1387-1408`). The disabled "ดำเนินการจองต่อ" never says consent is what's missing (`:1530`). | Name the steps; say why the button is disabled. | clarify |
| B20 | Medium | The photo lightbox is not accessible | No Esc, no focus trap, unlabelled controls (`rooms-section.tsx:39-98`). | Use the shadcn `Dialog`, which brings Esc, focus trap and labels. | harden |

Payment and slip:

| ID | Sev | Issue | Evidence | Fix | Command |
|---|---|---|---|---|---|
| P1 | Medium | Slip page doesn't check its link | `/upload-slip/[sessionId]` shows the upload UI for any ID, including a fake one; errors only after upload. `params` resolved with `params.then` during render (`page.tsx:20-21`). | Validate the session on load; show expired or invalid states up front. | harden |
| P2 | Medium | Slip page is off-brand | Tailwind blue (`page.tsx:89-90,155-156`) on a cool background, with hard-coded bilingual copy ("Upload Payment Slip", `:93`; "Choose from Gallery", `:160`). Not in `next-intl`. | Forest and earth; messages in `th.json`/`en.json`. | colorize |

### 3.5 Other guest pages

| ID | Sev | Issue | Evidence | Fix | Command |
|---|---|---|---|---|---|
| G1 | Low | 404 is plain | A white page, a green "PN." disc, an `rounded-md` button (`src/app/[slug]/not-found.tsx`). Functional. | Earth surface, serif heading, a link to `/`. | polish |
| G2 | Low | Lookup inputs unlabelled | `change-booking` and `check-in-out` each have 1 unlabelled input (`booking-search-view.tsx`). | `htmlFor`/`aria-label`. | harden |
| G3 | Low | `/legal` is very long on phones | 17,505px at 375px. | An on-page table of contents with anchors. | layout |

### 3.6 Auth pages (`/login`, `/register`, `/forgot-password`, `/reset-password`)

| ID | Sev | Issue | Evidence | Fix | Command |
|---|---|---|---|---|---|
| A1 | Medium | A different product | Cool grey background, black system-font headings, a generic shadcn card (`/login` capture). Brand appears only on the button. This is the host's first touchpoint. | Earth surface, serif heading, Forest focus, the guest header style. | colorize |
| A2 | Medium | Structure and names missing | No `<h1>` or `<main>`; password toggles unnamed (`login/page.tsx:246`, and the same on register and admin login); English `<title>`. | Add them; translate the metadata. | harden |

### 3.7 Host dashboard

Reviewed from code; hosts use it mostly on phones.

| ID | Sev | Issue | Evidence | Fix | Command |
|---|---|---|---|---|---|
| D1 | High | Billing warning banners fail contrast | Grace text `text-xs text-amber-600` on `amber-50` (3.08:1, `dashboard-shell.tsx:132`); blocked text `text-xs text-red-600` on `red-50` (4.36:1, `:154,174`). These tell a host their bookings are about to stop. | `amber-800` (6.88:1) and `red-700` (5.88:1); 14px. | colorize |
| D2 | Medium | Analytics before today's work | The home page shows the revenue chart, bookings-by-house chart and demand panel (`dashboard/page.tsx:581-641`) before recent bookings (`:644`). A phone-first host scrolls past three charts. | Today's check-ins, slips to verify and new bookings first; charts after. | layout |
| D3 | Medium | Cool-grey SaaS look | 489 `gray-*` uses; hard-coded `bg-[#f8f9fa]` (`dashboard-shell.tsx:92`); billing, wallet and promo codes use `earth-*` while other pages use grey. | `earth-*` throughout (after the phase 0 tokens). | colorize |
| D4 | Medium | Pending approval renders the page twice | `{children}` in `<main>` (`dashboard-shell.tsx:185`) and again in the blur overlay (`:193`): double effects and fetches, duplicate ids. | Render it once; overlay a notice. | harden |
| D5 | Medium | Mobile top bar | A 32px menu button with no name (`dashboard-shell.tsx:110-116`); the bar shows the brand, not the page. | 44px, labelled; the page title in the bar. | adapt |
| D6 | Low | Sidebar details | Sign-out label `text-gray-400` (2.60:1, `sidebar.tsx:225`); 10 items, with "billing" and "wallet" separate. | `earth-600`; consider grouping billing and wallet. | clarify |
| D7 | Low | Detector: side-tab borders | `border-l-4` accent cards (`dashboard/promo-codes/page.tsx:1290,1382`). | A subtler marker. | quieter |
| D8 | Low | Monolith pages | `rooms` 2,452 lines, `promo-codes` 2,122 and so on: visual and data logic interleaved. | Extract visual subcomponents when a page is touched (§4). | extract |

### 3.8 Admin

| ID | Sev | Issue | Evidence | Fix | Command |
|---|---|---|---|---|---|
| X1 | Low | Hover lift on cards that are not links | `.dashboard-card:hover` lifts and shadows (`globals.css:327-336`, an ungated `:hover`) on static cards (`admin/promo-codes/page.tsx:125,175`; `admin/bookings/page.tsx:241,334`). | Lift only on links, or not at all. | quieter |
| X2 | Low | Cool admin background | `admin-surface` uses `section-alt` #F7F7F5 (`admin-shell.tsx`), the one cool neutral. | `earth-50` once the tokens are unified. | colorize |
| X3 | Low | Dense data as cards | No `<table>` in admin; lists are cards. Desktop staff would scan a table faster. | Decision for the owner; table for bookings and hosts. | layout |

## 4. Component reuse opportunities

| Opportunity | Today | Reuse |
|---|---|---|
| Brand button | 15 `<Button className="bg-brand …">` overrides, 157 raw `<button>`, and the default variant is black | Map `--primary` to Forest (one token), then a `size="lg"` pill variant. Raw buttons migrate as pages are touched. |
| Status badge | Host rainbow `statusConfig` (`dashboard/bookings/page.tsx:196`) | `src/components/admin/status-badge.tsx` (add "verified"). |
| Empty state | Ad hoc in host pages; a dead end on `/cozy-villa/book` | `src/components/admin/empty-state.tsx`. |
| KPI card | `components/admin/kpi-card.tsx` and `components/dashboard/stat-card.tsx` | One `StatCard`. |
| Page header | `<h1 className="text-xl font-bold text-gray-900">` repeated in the dashboard | `components/admin/page-header.tsx`. |
| Form field | Label, input and error hand-wired in checkout, auth and dashboard (unlinked labels) | One `Field` (label `htmlFor`, `aria-describedby`, error) over the shadcn `Input`/`Label`. |
| Thai-safe tracking | Done right in `booking-footer.tsx:155`, `full-screen-menu.tsx` | A shared helper or class used for every eyebrow and button label. |
| Skeleton | shadcn `Skeleton` plus a custom `skeleton-warm` | shadcn `Skeleton` with earth tokens. |
| Section heading | `SectionMark` / `SectionHeading` on `/[slug]` only | Reuse on `/book` and `/` instead of the tracked eyebrows. |
| Date formatting | `MMM d, yyyy` in the dialog and sheet, Thai order in the bar | One `fmtDate` preset for booking ranges. |

## 5. Responsive and accessibility findings

Measured in the browser (Thai locale):

| Page @ width | Overflow | <12px text | Spaced Thai | Targets <24px | <44px / all | Unlabelled inputs | `h1` / `main` |
|---|---|---|---|---|---|---|---|
| `/` @375 | no | 0 | 12 | 5 | 5/14 | 1 | 1 / yes |
| `/` @1280 | no | 0 | 11 | 5 | 5/14 | 1 | 1 / yes |
| `/[slug]` @375 | no | 2 | 1 | 1 | 2/34 | 0 | 1 / yes |
| `/[slug]/book` @375 | no | 13 | 25 | 22 | 67/96 | 0 | 1 / yes |
| `/[slug]/book` @1280 | no | 7 | 26 | 22 | 33/98 | 0 | 1 / yes |
| checkout step 2 @375 | no | 11 | 28 | 20 | 67/97 | 5 | 1 / yes |
| `/login` @375 | no | 4 | 3 | 2 | 2/6 | 0 | 0 / no |
| `/register` @375 | no | 10 | 6 | 3 | 3/12 | 0 | 0 / no |
| `/about`, `/legal`, `/trust-safety`, `/host-guidelines` @375 | no | 0 | 0–4 | 0–4 | — | 0 | 1 / no |
| `/cozy-villa/book` @375 | no | 5 | 4 | 3 | 6/16 | 0 | 1 / yes |
| `/upload-slip/<invalid>` @375 | no | 0 | 0 | 0 | 0/1 | 0 | 1 / no |

WCAG 2.2 AA failures confirmed:

| Criterion | Where |
|---|---|
| 1.3.1 Info and Relationships | B1, S14 |
| 1.3.5 Identify Input Purpose | B1 (no `autocomplete` on name, email, phone) |
| 1.4.3 Contrast (Minimum) | S2, B2, D1, D6, H9 |
| 1.4.11 Non-text Contrast | S13 (focus at 1.94–2.98:1); Sand input borders at 1.45:1 |
| 2.4.7 Focus Visible | B1, S13 |
| 2.5.8 Target Size (Minimum) | B8; home footer links 18–20px tall |
| 4.1.2 Name, Role, Value | S5, B16 (tier state), B20 |

A further risk sits under 2.2.2 (Pause, Stop, Hide): the cart badge pulse
runs forever, by design, and the hero mist loops forever. The badge is an
open decision; see direction §10.

Not verified:
- Real devices and LINE's in-app browser.
- Hydration time in milliseconds.
- Dark mode, which is unused.
- The dashboard and admin rendered.
- The payment step rendered.

## 6. Critique summaries

### `/` (Persuade): 18/36, Acceptable at the bottom edge

- **Verdict:** category-interchangeable.
  - Change the name and it is an eco-resort template: a non-Thai stock hero,
    italic accent words, letter-spaced eyebrows, repeated icon-tile rows, a
    gradient CTA card, a glass nav and parallax.
  - The most Peaksnature thing on the page, the real ม่อนเงาะ sea-of-mist
    photo, sits 2.6 screens down.
  - The product's real mechanisms (PromptPay slip check, deposits, QR
    check-in, real reviews) never appear.
- **Heuristic scores:**
  - status 2, real world 2, control 2, consistency 2, error prevention 2,
    recognition 3, flexibility n/a, minimalism 2, recovery 2, help 1.
  - Help scores lowest because "FAQ" opens a contact form and
    `/trust-safety` is never linked.
- **Detector:** 20 findings at 1280px and 19 at 375px.
  - Mostly `low-contrast`, plus `kicker-above-heading` ×4,
    `italic-serif-display` ×3, `wide-tracking` and `straggler`.
  - `overused-font` is partly a false positive: Geist draws only Latin; Thai
    renders in Thonburi.
- **Priority issues:** H1–H6 above.

### `/[slug]/book` (Operate inside Persuade)

**22/40, Acceptable (55%).**

- **Verdict:** split.
  - **The mechanics are authored for Peaksnature:** a PromptPay QR fixed to
    the exact amount, automatic slip checking, a deposit with the balance on
    arrival, houses counted in หลัง, nightly availability, and guest tiers
    the host defines.
  - **The look could belong to any boutique-hotel template:** a two-tone
    serif headline with faux-italic Thai, four icon-tile rows of claims
    nobody can verify, a hero with blur, parallax and mist, a glass header, a
    `shadow-xl` card, `shadow-lg` uppercase pills, and a pink badge that
    pulses forever.
  - The trust slot should state the real mechanisms instead.
- **Heuristic scores:**
  - status 2, real world 2, control 2, consistency 2, error prevention 3,
    recognition 2, flexibility 2, minimalism 2, recovery 2, help 3.
- **Cognitive load:** 4 of 8 checks fail (high).
  - Single focus: the sticky bar covers the step-1 CTA.
  - Visual hierarchy: labels are fainter than placeholders.
  - Minimal choices: the house dialog has more than 4 options, and step 2
    has 6 fields plus a 77-item province list.
  - Working memory: the house dialog hides the dates.
- **Emotional journey:**
  - Peaks: the hero with rating and verified host; a date dialog that
    prevents mistakes; "ยกเลิกฟรีถึง…" on the review screen.
  - Valleys: a silent add, a false "unavailable", and a long step 2.
  - At the moment of paying, the guest gets an unlabelled timer and a QR to
    scan from the screen she is holding.
- **Strengths:**
  - **Payment flow fits the phone:** returning from the bank app switches to
    upload, slips are compressed for rural data, desktop guests can upload
    from a phone, and an amber note names the recovery route.
  - **Date guardrails:** a half-picked range is refused inline, and a night
    that is full is named.
  - **Honest outcomes:** slip errors are specific and the pending message
    is truthful.
- **Detector** (all verified, no false positives):
  - CLI: 0 findings; TSX gets regex rules only.
  - Browser at 1280px: 14 findings. At 375px: 8.
  - Rules: `low-contrast` (form labels, step dots, the "ยอดนิยม" badge,
    next-month days), `tiny-text`, `italic-serif-display`, `icon-tile-stack`,
    `nested-cards`.
- **Priority issues:** B11, B12, B1, B13, and the loud shell (S10, B9,
  B10).

## 7. Motion audit (Emil Kowalski, `improve-animations`)

Recon: `motion` 12.40.0 (91 `motion.*` elements, 34 `whileInView`, 10
`AnimatePresence`), `tw-animate-css` for shadcn overlays, and six keyframes in
`globals.css`. There are no easing or duration tokens. Personality: calm
hospitality, so motion should be crisp and quiet.

| # | Sev | Category | Location | Finding | Fix summary |
|---|---|---|---|---|---|
| 1 | High | Accessibility | `src/app/[slug]/page.tsx:201` (only use); `globals.css:229-256` and `:344-355` | Reduced motion is honoured only on `/[slug]`. `hero-mist` and `skeleton-warm` loop with no RM rule. | `RespectReducedMotion` at each surface root; RM rules that keep fades and drop movement. |
| 2 | High | Purpose | `landing/hero.tsx:16-18,48-72`; `landing-content.tsx:33-37` | Home content starts at `opacity: 0` with blur; parallax, a scroll-linked fade of a live input, and a progress bar. | Start visible; delete the parallax, scroll fade, progress bar and mist. |
| 3 | Medium | Purpose and duration | `booking-section.tsx:1356-1360`; `desktop-date-search.tsx:47-51` | The checkout card (0.6s scale and fade) and the date search (0.5s) animate in on scroll: the task waits on decoration. | No entrance, or opacity only at 200ms with `cubic-bezier(0.23, 1, 0.32, 1)`. |
| 4 | Medium | Accessibility (2.2.2) | `globals.css:267-286` | The cart badge pulses forever while the cart is non-empty. Deliberate and documented; reduced motion is handled. | Owner decision: a single bump on add instead of a loop. |
| 5 | Low | Performance | 72 × `transition-all` (`button.tsx:8` and others); `booking-header.tsx:103` (500ms) | Animates unintended properties; header state change at 500ms. | Name the properties; 200ms for the header. |
| 6 | Low | Cohesion | 12 × `[0.25, 0.1, 0, 1]`, 5 × `[0.33, 1, 0.68, 1]`, `easeOut`, `easeInOut`, `cubic-bezier(0.23, 1, 0.32, 1)` | Near-duplicate curves, no tokens. | `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` in `@theme`. |
| 7 | Low | Physicality | `globals.css:327-336` | Ungated `:hover` lift on static admin cards. | Remove, or gate with `@media (hover: hover) and (pointer: fine)` on links only. |

Missed opportunities:
- **Press feedback.** There is no `active:scale` or `whileTap` anywhere. The
  primary pills could take `transform: scale(0.97)` with `transition:
  transform 160ms ease-out`.
- **A one-shot bump when a house is added to the cart.** It explains where
  the house went, and could replace the infinite pulse.
- **The rubric's GPU note.** The `improve-animations` rubric says Motion's
  `x`/`y`/`scale` shorthands are not hardware-accelerated before Motion 14.2.
  This project is on 12.40.0. That is the rubric's claim, not checked against
  Motion's changelog, and any upgrade needs approval.

Already right:
- Checkout steps cross-fade with `AnimatePresence mode="wait"`.
- Dialogs use tw-animate at 200ms.
- `SectionMark` / `SectionHeading` and the cart pulse already handle reduced
  motion.

## 8. Not covered

- **Dashboard and admin rendering**, which needs a test host or admin login;
  reviewed from code only.
- **The payment step and slip verification UI**, which needs holds;
  reviewed from code only.
- **English locale** beyond spot checks, **768px** beyond the main three
  pages, **dark mode** (unused), and real devices.
- **`ui-ux-pro-max`** was not needed: the WCAG criteria and the Impeccable
  and Emil rubrics covered every finding.

## 9. Next

The ordered plan and the recommended first page are in
`docs/ui-improvement-roadmap.md`.
