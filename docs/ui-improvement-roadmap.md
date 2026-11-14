# UI improvement roadmap

Status: proposed, 2026-11-11. Nothing here is implemented, and **no work
starts until the owner approves it.**

Finding IDs (S1, B11, …) refer to `docs/ui-audit.md`. Target values come from
`DESIGN.md`. Decisions still open are in `docs/design-direction.md` §10.

## Ground rules for every change

- **One page or one foundation per PR.** Behaviour stays identical unless
  the item says otherwise and the owner has approved it.
- **Large changes.** CLAUDE.md §4 counts these as large: the booking path,
  shared tokens, shared components, and anything in `src/app/layout.tsx`.
  Before editing one: find every usage, summarise the impact, and get
  confirmation.
- **Behaviour changes on the booking path** are marked **needs approval**
  below. They wait for an explicit yes, even inside an approved phase.
- **Out of scope:** schema, RLS, API contracts, pricing, holds, slip
  verification and tenant routing. A UI item that would need one of these
  stops and asks.
- **Settled decisions stay settled** (direction §9). In particular:
  - the house-card button stays disabled until dates are chosen;
  - the mobile bar CTA carries the dates;
  - the `/[slug]` landing order and motion stay as they are;
  - image optimization stays off.
- **Verification for every PR:**
  - `npx tsc --noEmit`.
  - `npm run lint`, comparing per-rule counts against the 29-error baseline.
  - `npm run test`.
  - CDP screenshots before and after at 375, 768 and 1280px, using the
    CLAUDE.md "In this repo" method.
  - `impeccable detect` on the changed page.
  - `review-animations` for any motion change.
- **Score tracking.** Re-run `/impeccable audit` (baseline 11/20) and
  `/impeccable critique` on `/[slug]/book` (22/40) and `/` (18/36) after each
  phase.

## Recommended first page: `/[slug]/book`

Do it right after the small Phase 0 foundations it depends on.

- **Every booking passes through it.** It holds 4 of the 13 High findings:
  B1 (the form's accessibility), B2 (contrast), B11 (payment guidance) and
  B12 (silent add-to-cart).
- **The primary users are Thai guests on phones**, and this is where they pay
  a stranger by PromptPay. Principle 1 in PRODUCT.md is "booking confidence
  on a phone".
- **The rest of the path is ready.** The `/[slug]` landing that feeds it was
  already reworked with the owner on 2026-11-05.
- **Most of the work is visual and accessibility work inside one file**
  (`booking-section.tsx`) and its dialogs. That can ship without touching
  holds, drafts or verification. Flow changes are split out and gated.

The alternative is the platform home `/`: more visual change, less
risk, and Persuade rather than Operate. It needs owner input first (a real
Thai hero photo, the section order, copy), so it fits better as Phase 2.

## Phase 0: Foundations

These are small diffs with wide effect. Each one counts as large, so each
gets its own impact summary.

| # | Item | Fixes | Files | Risk | Size | Command |
|---|---|---|---|---|---|---|
| 0.1 | Map shadcn's semantic tokens to the palette: `--primary` and `--ring` to Forest, `--border`/`--input` to Sand and `earth-500`, `--muted-foreground` to `earth-600`. | S1, part of S13, part of S7 | `src/app/globals.css` (`:root`) | Every default `Button`, `Badge`, link and ring changes colour at once, on all three surfaces. The admin settings, bookings and hosts buttons turn green. | S | colorize |
| 0.2 | Thai-safe tracking: stop `tracking-*` and `uppercase` from applying to Thai. Either a scoped CSS rule keyed on `html:lang(th)`, with `lang="en"` on Latin-only tracked text such as the `SectionMark` numerals, or a shared helper like the gate in `booking-footer.tsx:155`. Pick one in review. | S3 (25–28 elements on `/book`, 11–12 on `/`) | `globals.css` or a helper plus call sites | A global CSS rule could also un-track English text inside a Thai page. Screenshot both locales. | S–M | typeset |
| 0.3 | Reduced motion everywhere: wrap `children` in `RespectReducedMotion` in the root layout, and add `prefers-reduced-motion` rules for `.hero-mist` and `.skeleton-warm`. | S4, motion #1 | `src/app/layout.tsx`, `globals.css` | A client wrapper at the root. Children stay server-rendered (passed as props). | S | animate |
| 0.4 | Error boundaries: `src/app/error.tsx`, `global-error.tsx`, plus `dashboard/` and `admin/` `error.tsx`, styled to DESIGN.md. Messages via next-intl, except English for admin. | S11 | new files, `messages/*.json` | Low: new files only. | S | harden |
| 0.5 | Browser chrome colour: `themeColor` and the manifest `theme_color` to #2F5D50. | S17 | `src/app/layout.tsx`, `public/manifest.json` | None. | XS | polish |
| 0.6 | Accessible names: label the 21 icon-only buttons, the auth password toggles, the dashboard menu button, and the home user and search buttons. | S5, part of D5, part of A2 | about 10 files | None: attributes only. | S | harden |
| 0.7 | Billing banners readable: grace and blocked text to `amber-800`/`red-700` at 14px. | D1 | `components/dashboard/dashboard-shell.tsx` | None. | XS | colorize |
| 0.8 | Delete dead code: the unrendered landing sections, including the invented testimonials (`landing/reviews.tsx`, `gallery.tsx`, `experience.tsx`); unused CSS utilities; duplicate `@apply` lines. | S16 | `components/landing/*`, `globals.css` | None, once confirmed unimported (they are today). | XS | distill |

Deferred until the owner decides (direction §10):
- **0.9 Body font.** Make the system stack official (recommended), or load a
  Latin + Thai pair. Fixes S8.
- **0.10 Palette value tuning.** Warm Ivory background; whether Forest
  changes. Only after phase 1 has moved text to `earth-600` or darker.

## Phase 1: `/[slug]/book` (booking and checkout)

### 1a: visual and accessibility, behaviour unchanged

| Item | Fixes | Notes |
|---|---|---|
| Accessible guest-details form | B1 | Follow `DESIGN.md` for fields. A small `Field` wrapper over shadcn `Input`/`Label` (label `htmlFor`, `aria-describedby`, `required`), plus `autoComplete` on name, email and phone, and 16px inputs. `earth-700` labels, unspaced, with a 2px Forest focus ring. Name the four icon back buttons. |
| Contrast and tiny-text pass | B2, S2, S6 | Step dots, the "ยอดนิยม" badge (Charcoal on an amber tint), clickable next-month days at full opacity, helper lines at `earth-600`, the cart badge (Forest or Charcoal; owner decides with direction §10.6), and a 12px floor. |
| One Thai date format | B4 | One `fmtDate` preset, "18 พ.ย. 2569", for the dialog, the sheet and step 1. |
| Landing position | B5, part of B18 | `scroll-margin-top` equal to the header height and `block: "start"`; hide the sticky bar while the booking card is in view. Keep the bar's settled content. |
| Calm the shell | B6, B9, B10, S9, S10 | No entrance animation on the booking card or the date search. Flat 18px card with no `shadow-xl`. Flat pills. No faux italic. Replace the four filler rows with three real mechanisms: slip checked automatically, deposit now and the rest on arrival, the free-cancellation date. No glass header. |
| Calendars, visual part | B13 | One legend, a distinct style for booked nights, a solid focus ring. **Done 2026-11-14** (see ui-audit B13). |
| House dialog context | B16 | Show the dates and nights beside the total; `aria-pressed` on tiers. Preselecting the base tier **needs approval** (it changes the default selection). |
| Readable price and outcome | B17 (visual part) | Price breakdown in `earth-700` at 14px; the pending state gets its own icon and words. |
| Steps and disabled reasons | B19 | Named steps; "accept the terms to continue" under the disabled CTA. |
| Photo scrim | B3 | A bottom gradient scrim that guarantees 4.5:1 for white text on any photo. This is a scrim, not a decorative gradient. |
| Small targets | B8 | Photo dots at 24px, the details link at 44px tall. |
| Lightbox | B20 | Move it to shadcn `Dialog` (Esc, focus trap, labels). |
| Empty homestay | B7 | When a homestay has no houses, replace the checkout card with an empty state: no houses open yet, and how to contact the host. |

### 1b: booking-path behaviour (**needs approval**, item by item)

| Item | Fixes | What changes |
|---|---|---|
| Payment guidance | B11 | Labelled timer ("ชำระเงินภายใน 9:59") with a 2-minute warning; numbered phone steps; a full-width "save QR". Moving the deposit choice to the review screen, and keeping the slip after expiry (hold again, then verify), change the payment flow. |
| In-cart state | B12 | The card shows "✓ อยู่ในรายการจอง · แก้ไข", with a confirmation and "ดูรายการจอง"; "จองบ้านพักนี้" opens that house's dialog. Stopping a re-add of a single-unit house changes cart logic. **Done 2026-11-14** (see ui-audit B12). |
| Back to the previous step | B14 | The leave dialog gains "กลับไปขั้นตอนก่อนหน้า". The `popstate` guard stays (it is deliberate). |
| Province order | B15 | Sort by Thai label when the locale is Thai. Data order only. |
| Recovery | B18, part of B17 | Inline slip errors; the cart kept per homestay in `sessionStorage`; the receipt still reachable after the success modal closes. |

### Tests owed for phase 1 (CLAUDE.md §3)

- **Unit (Vitest):**
  - the date-range format preset;
  - the Thai province sort;
  - the `Field` wrapper links label, input and error (`// @vitest-environment
    happy-dom`).
- **E2E** (Playwright is not set up; ask before installing):
  - `booking-flow.spec.ts`: dates → house → cart → step 2, where every field
    is reachable by its label. Runs against seeded data and never submits.
  - `booking-a11y.spec.ts`: an axe scan of steps 1–2.
- **No pgTAP:** no database change.

## Phase 2: platform home `/`

| Item | Fixes | Notes |
|---|---|---|
| Content visible at rest | H1, motion #2 | Remove `opacity: 0` and blur entrances, parallax, the scroll-linked search fade, the progress bar and the mist. The same rule the owner set for `/[slug]`. |
| Real Thai hero | H2 | **Owner supplies** a licensed photo or a host photo with permission; honest alt. |
| Order | H4 | Hero (about 70svh on phones) → homestays → a short why → hosts. **Owner decides** (direction §10.7). |
| Carousel gutter | H3 | `scroll-pl-4` on the swipe row. |
| Search feedback | H5 | Show the query, a count and a clear button; a reset in the empty state; `htmlFor`; a focus ring; a name on the desktop button. |
| Honest copy | H6 | Replace "ที่พักของเราถูกสร้างขึ้น…" and the unverified claims with the real mechanisms. Show the verified badge, and "เริ่มต้น" on prices. **Owner approves the Thai copy.** |
| Desktop layout | H7 | A container narrower than the viewport, or real gutters; balance the homestay grid. |
| Links and template patterns | H8, H9, S9, S10 | Real FAQ or a renamed link, the `/#contact` anchor, 44px cookie buttons; fewer eyebrows, no faux italic, no gradient card. |

Tests owed: E2E `home-visible-without-js.spec.ts` (the hero heading and
homestay cards render with JavaScript disabled).

## Phase 3: host dashboard (phone-first)

| Item | Fixes | Notes |
|---|---|---|
| Today's work first | D2 | Check-ins, slips to verify and new bookings above the charts. **Owner decides** (direction §10.8). |
| One visual language | D3, S7 | `earth-*` instead of `gray-*`; remove `bg-[#f8f9fa]`. Page by page, starting with the shell, then bookings and check-ins. |
| Shared status tones | S12 | Admin's `StatusBadge` (add "verified") replaces the rainbow `statusConfig`. |
| Pending-approval render | D4 | Render `children` once. This is a bug fix, so it needs a failing test first (CLAUDE.md §3). |
| Mobile top bar | D5 | A 44px labelled menu button and the page title. |
| Polish | D6–D8 | Sign-out contrast, sidebar grouping (billing and wallet), the side-tab borders; extract visual subcomponents from monolith pages only when touching them. |

Dashboard pages write to Supabase from the browser (the `hosts` column
grants, CLAUDE.md §5). Visual changes must not touch those calls.

## Phase 4: auth, slip upload, error and static pages

| Item | Fixes | Notes |
|---|---|---|
| Auth in the brand | A1, A2, S14, S18 | Earth surface, serif heading, `h1` and `main`, labelled toggles, translated titles. |
| Slip page | P1, P2 | On-brand colours and i18n (P2). Checking the session on load (P1) needs a read endpoint or a server check: **needs approval** if it touches `/api/slip-upload`. |
| 404 and static pages | G1–G3, S14 | Earth 404 with a serif heading; `main` landmarks; a table of contents on `/legal`; labels on the lookup inputs. |

## Phase 5: admin polish (desktop, English-only)

| Item | Fixes | Notes |
|---|---|---|
| Calm cards | X1 | No hover lift on cards that are not links. |
| One neutral | X2 | `section-alt` to `earth-50` (after 0.1). |
| Tables for dense lists | X3 | **Owner decides**: bookings and hosts as tables on desktop. |

## Quick wins

Each is under an hour, low risk and visible right away:
- 0.5: `themeColor`.
- 0.7: readable billing banners (D1).
- 0.6: accessible names (S5).
- H3: carousel gutter.
- B5: scroll margin.
- 0.8: delete the invented testimonials and dead CSS.

## Decisions needed before starting

From direction §10:
1. Brand green.
2. Page background.
3. Sage's role.
4. Body font.
5. The home hero photo.
6. The cart badge pulse.
7. The home order.
8. The dashboard home order.

Plus approval of phase 0, then phase 1a. Phase 1b is approved item by
item.
