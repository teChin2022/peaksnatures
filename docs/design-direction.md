# Design direction

Status: proposed direction, 2026-11-11. Nothing in this file is implemented
yet unless it says "today".

How the design files fit together:
- `PRODUCT.md` holds product truth: users, purpose, principles, WCAG 2.2 AA.
- `DESIGN.md` holds the design system **as the code has it today**, cleaned of
  drift.
- This file holds **where the design is going** and the decisions behind it.
- `docs/ui-audit.md` records what is wrong today, with evidence.
- `docs/ui-improvement-roadmap.md` is the order of work.

Verified facts and proposals are kept apart below. Proposals are marked
**Proposed**. Contrast ratios are WCAG 2.x values computed by script from the
hex values in `src/app/globals.css`.

## 1. The direction in one line

**"The Quiet Retreat":** Nature Luxury and Modern Hospitality, expressed as a
premium surface on conventional bones.

The brief asks for *Nature Luxury / Modern Hospitality*: premium but
approachable, warm, editorial, generous whitespace, real photography, and
subtle motion. The owner's standing preference (confirmed several times, most
recently 2026-11-05) is the simplest conventional pattern, Booking.com-style,
over novel layouts. These do not conflict:
- **Premium** lives in restraint and precision: real photographs, one green
  voice, a serif for names and prices, warm neutrals, and generous space.
- **Conventional** is the structure: pick dates first, choose a house, review
  the cart, pay. Familiar placements, familiar controls, nothing to learn.
- **Not premium:** effects. Glass, gradients, parallax, heavy shadows, faux
  italics and decorative loops read as a template, and the brief rules them
  out.

## 2. Who we design for

These are confirmed in `PRODUCT.md`:
- **Guests:** Thai travellers, mostly on phones, often arriving from a LINE
  link to one homestay's `/[slug]`. They pay a deposit or the full amount by
  PromptPay and upload a slip.
- **Hosts:** owner-operators running the dashboard mostly on their phones,
  between other work.
- **Admins:** internal staff, desktop, English-only.
- **Standard:** WCAG 2.2 AA everywhere.

## 3. Principles

1. **The place leads.** Real photos and real facts (houses, prices, reviews)
   come before claims and philosophy. The interface recedes.
2. **One voice for action.** Forest green marks what to do next, on every
   surface. Nothing else competes with it.
3. **Readable in daylight, in Thai.**
   - Text at 4.5:1 or better, and nothing under 12px.
   - No letter-spacing and no italics on Thai.
   - Inputs at 16px on phones.
4. **Flat and calm.** Borders and tonal layers for structure; shadow only on
   layers that float.
5. **Motion explains, never decorates.**
   - Under 300ms for UI.
   - Content is visible before JavaScript runs.
   - The OS reduced-motion setting is respected everywhere.
6. **Honest by default.**
   - No invented testimonials, numbers or badges.
   - Every claim maps to a real mechanism (slip verification, deposits, QR
     check-in, real reviews).
   - Peaksnature is the platform, not the accommodation provider.

## 4. Palette direction

**Today:**
- **The real palette:** `brand` #2F5D50 (Forest) plus the warm `earth-50…900`
  scale. Guest pages use `earth-*` 705 times and raw greys 38 times.
- **What drifts away from it:**
  - shadcn's `--primary`, a near-black #171717.
  - The host dashboard's cool greys: 489 `gray-*` uses, plus a hard-coded
    `bg-[#f8f9fa]`.
  - The admin's cool `section-alt` #F7F7F5.
  - A pink cart badge, `bg-[#F83858]`.
  - A Tailwind blue on `/upload-slip`.

**Proposed:** adopt the brief's palette as the *roles* of the existing system,
then tune values. This is a value change, not a rebuild.

| Brief token | Proposed value | Today's equivalent | What the numbers say | Recommendation |
|---|---|---|---|---|
| Forest | #495B49 | `brand` #2F5D50 | Proposed: 7.30:1 with white. Today's: 7.49:1. The two greens differ by only 1.03:1. | **Keep #2F5D50** unless the owner wants the greyer, softer green. It is already called Forest, appears in 635 places, and passes AAA either way. If changed, it is one token (`--color-brand` plus its hover and 700 shades). |
| Warm Ivory | #F5F1E8 | `earth-50` #faf8f5 | Proposed is slightly deeper and yellower. It drops `earth-500` text to 3.84:1 (fails). `earth-600` keeps 5.26:1 and `earth-700` 7.10:1. | **Adopt as the guest page background, but only after** secondary text moves to `earth-600` or darker (roadmap phase 0). |
| Sand | #D8C9AE | `earth-200` #e0d5c8 | Very close. Forest text on proposed Sand is 4.48:1, just under AA. | **Use for dividers, borders and chips.** Not as a background for small Forest text. |
| Sage | #8C9A78 | none (new) | 2.66:1 as text on Ivory; 3.0:1 with white; Charcoal on Sage 3.98:1. | **Decorative accent only:** availability marks, map pins, illustration and tag tints. Never text, never actions. |
| Charcoal | #39372F | `earth-900` #3a2e27 | Near-identical depth: 11.92:1 on white, against 13.12:1 today. Proposed is more olive, today's is browner. | **Use for headings and text.** Choose between the two values by eye on real photos. |

**Proposed:** one colour system for all three surfaces.
- Map shadcn's semantic tokens to the palette: `--primary` to Forest,
  `--ring` to Forest, `--border` and `--input` to Sand and `earth-500`,
  `--muted-foreground` to `earth-600`.
- Replace raw `gray-*` with `earth-*`.
- Retire `section-alt`, the pink badge hex and the upload page's blue.
- Status colours come from admin's `StatusBadge` tones everywhere.

## 5. Typography direction

**Today:**
- **Display:** Playfair Display for Latin with Noto Serif Thai for Thai
  (`font-serif`). This works and stays.
- **Body:** the system UI stack. Because of `@theme inline`, Geist reaches
  only elements with an explicit `font-sans` class, so Thai body text renders
  in each OS's Thai face (Thonburi on macOS, verified in the browser).
- **Size:** 111 uses of 9–11px text.
- **Letter-spacing:** applied to Thai in dozens of places: 25–28 elements on
  `/[slug]/book` and 11–12 on `/`.
- **Italic:** Thai headings on `/` and in the booking card use `italic`.
  Noto Serif Thai has no italic face, so the browser fakes the slant.

**Proposed:**
- **Keep the serif pairing** for display, headlines, house names and prices.
  Never italicise Thai; emphasise with Forest colour instead.
- **Body font: decide between two options.**
  - **A. Recommended:** make the system stack official. It is what renders
    today, costs no bytes, gives native-quality Thai on iOS and Android, and
    stops the half-applied Geist load.
  - **B.** Load a Latin + Thai sans pair through `next/font/google` (no new
    package). Pick a family with real Thai coverage, for consistent rendering
    across operating systems. This costs a font download on every first
    visit.
- **Floors:**
  - 12px for any text.
  - 14px for Thai running text, 16px in inputs.
  - Line-height at least 1.6 for Thai paragraphs.
- **Tracking and uppercase only on Latin.** Reuse the locale gate in
  `src/components/booking/booking-footer.tsx` and
  `src/components/full-screen-menu.tsx`. Latin numerals (the "01 ——" section
  marks) may stay tracked.

## 6. Imagery

**Today:**
- Real host photos on `/[slug]` and `/book`. Image optimization is
  deliberately off, with compression at upload (settled).
- The platform home `/` opens on `/hero-mountain.jpg`: snow peaks and a
  glacial river, which is not Thailand. Its alt text says "Mountain
  landscape in northern Thailand" (`src/components/landing/hero.tsx:33`).

**Proposed:**
- **Only real Thai places.** Replace the home hero with a licensed Thai
  landscape or a host photo used with permission, and write alt text that
  describes it.
- **The Photo Scrim Rule:** text on a photo sits on a scrim that holds 4.5:1
  against the brightest photo a host might upload. Today, white house names
  over a pale photo are hard to read on `/book`.
- **Aspect ratios:** 4:3 for house photos and 4:5 for homestay cards on `/`,
  as today.

## 7. Motion direction

Grounded in Emil Kowalski's rules (`emil-design-eng`, `improve-animations`).

**Today:**
- `motion` 12.40.0 plus CSS keyframes.
- The OS reduced-motion setting is honoured only inside `/[slug]` (the only
  `RespectReducedMotion` wrapper) and in three booking components.
- `/` renders its hero heading, search and homestay cards at `opacity: 0`
  until JavaScript runs, and adds parallax, a scroll-linked fade of the live
  search box, and a scroll progress bar.
- Durations run up to 1.2s on the booking page.
- There are 72 `transition-all` and no motion tokens.

**Proposed:**
- **Purpose test.** Animate only to explain a change, show where something
  came from, or confirm an action. Hover effects stay small; nothing frequent
  animates for show.
- **Visible at rest.** Entrances may refine content that is already visible,
  never reveal it. This is the rule the owner set for `/[slug]` on
  2026-11-05, extended to every page.
- **Budgets:**
  - press feedback 100–160ms
  - menus and selects 150–250ms
  - dialogs and sheets 200–500ms
  - marketing reveals may run longer
- **Tokens** in `globals.css`:
  - `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`
  - `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`
  - `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`
- **Properties:** animate only `transform` and `opacity`, and name them
  instead of `transition-all`.
- **Reduced motion everywhere:**
  - `RespectReducedMotion` at the root of every surface.
  - A `prefers-reduced-motion` rule for every keyframe (`hero-mist` and
    `warm-pulse` have none today).
  - Keep fades, drop movement.
- **Remove:** parallax, scroll-linked fades, the scroll progress bar, the
  hero mist loop, and hover lift on cards that are not links.
- **Settled exceptions, kept:** the `/[slug]` hero entrance and scroll cue,
  the `SectionMark` rule and the `SectionHeading` reveal.

## 8. Density by surface

| Surface | Impeccable mode | Density | What comes first |
|---|---|---|---|
| Platform home `/` | Persuade | airy | real homestays, then why to book direct |
| Homestay `/[slug]` | Persuade | airy | photos, houses, reviews (settled order) |
| Booking `/[slug]/book` | Operate inside Persuade | comfortable, 44px targets | dates, house, price, status, payment |
| Host dashboard | Operate | compact, phone-first | today's work: check-ins, slips to verify, new bookings; analytics after |
| Admin | Operate | dense, desktop-first | queues and exceptions; English-only |

One design language across all of them: the same palette, type, radius,
buttons, inputs, badges and empty states. Only spacing and information
density change.

## 9. Settled decisions (ask before changing)

From earlier sessions with the owner:
- **`/[slug]` landing (2026-11-05):**
  - Section order: Hero, Gallery, About, Houses, Reviews, Host and Location,
    Check-in, Policies, FAQ, closing band.
  - Motion only on the hero entrance and scroll cue, `SectionMark`, and
    `SectionHeading`. Widened by the owner 2026-11-13: the hero name rises
    from a mask and its photo settles; photos (gallery, houses) unveil
    upward as they scroll in; the rating score and host figures count up;
    the rating stars pop in; the closing band's photo settles; the house
    link's arrow nudges on hover. All once, never looping, nothing on text
    blocks or buttons; off under reduced motion (`RevealScope`, `CountUp`
    in `src/components/booking/reveal.tsx`, CSS in `globals.css`).
  - The verified badge shows only for verified hosts; "last booking" only
    within 30 days.
  - Blocked hosts show the unavailable notice.
  - Phones: 3 gallery tiles, then "Show all"; reviews in a swipe row; read
    more expands in place.
  - House rows stack on phones (3:2 photo over the details) and alternate
    photo and details from `md` (owner's pick 2026-11-11, reversing the
    2026-11-05 side-by-side phone layout).
- **Mobile sticky booking bar:** one Forest CTA that carries the dates on a
  second line, plus a cart tile. No separate date field.
- **House-card "เลือกบ้านพักนี้":** disabled until both check-in and
  check-out are chosen.
- **Image delete control:** the always-visible top-right X badge
  (`pointer-fine:` hover only on mouse).
- **Vocabulary:** บ้านพัก / House, never ห้องพัก / Room, in copy. Thai counts
  use หลัง.
- **Images:** image optimization stays off (`images.unoptimized`), with
  compression at upload.
- **Carts:** grouped into one card only on `/dashboard/bookings`.
- **`/admin`:** stays English-only.

- **Guest pages palette (2026-11-13):** Mist Ridge (DESIGN.md "Mist Ridge"),
  guest pages only. `/[slug]` shipped first: hero name and tagline low and
  left; gallery a 5-photo mosaic (3 tiles on phones) with "Show all" over the
  last tile; amenities and rules side by side; houses as white cards; host
  card and map in one section; check-in and policies side by side from lg;
  closing band over the host's hero photo; phone bar shows the "from" price
  beside the Book button. Header menu and language switcher unchanged.

From this session (2026-11-11):
- North Star "The Quiet Retreat".
- The brief's colour names for the existing palette.
- Flat, calm surfaces.
- WCAG 2.2 AA.
- Guests are Thai and mostly on phones; hosts are mostly on phones.

## 10. Open decisions for the owner

1. **Brand green.** Keep #2F5D50 (recommended) or move to #495B49.
2. **Guest page background.** `earth-50` #faf8f5 or the proposed Warm Ivory
   #F5F1E8. The proposed value comes after the text-contrast fix.
3. **Sage.** Confirm its role as a decorative accent only.
4. **Body font.** Make the system stack official (recommended) or load a
   Latin + Thai web font pair.
5. **Home hero image.** Which real Thai photo, and with whose permission.
6. **Cart badge pulse.** It runs forever while the cart has houses
   (deliberate, documented in `globals.css`). WCAG 2.2.2 (Pause, Stop, Hide)
   asks that motion lasting more than 5 seconds can be paused, so a single
   pulse when a house is added may be the safer equivalent.
7. **Platform home order.** Put homestays before the "why" manifesto and the
   host pitch (proposed in the audit).
8. **Host dashboard home.** Today's work first, analytics second (proposed in
   the audit).
