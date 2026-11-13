---
name: Peaksnature
description: Direct booking for nature homestays in Thailand. "Discover Nature. Stay Local."
colors:
  brand: "#2F5D50"
  brand-hover: "#264A40"
  brand-700: "#1E3D34"
  brand-100: "#D4E0DC"
  brand-50: "#EEF3F1"
  earth-50: "#faf8f5"
  earth-100: "#f0ebe4"
  earth-200: "#e0d5c8"
  earth-300: "#c9b9a6"
  earth-400: "#a89279"
  earth-500: "#8d7560"
  earth-600: "#75604e"
  earth-700: "#5f4d40"
  earth-800: "#4a3b32"
  earth-900: "#3a2e27"
  surface: "#ffffff"
  section-alt: "#F7F7F5"
  destructive: "oklch(0.577 0.245 27.325)"
  amber-50: "oklch(0.987 0.022 95.277)"
  amber-700: "oklch(0.555 0.163 48.998)"
typography:
  display:
    fontFamily: "Playfair Display, Noto Serif Thai, serif"
    fontSize: "4.5rem"
    fontWeight: 400
    lineHeight: 1.25
  headline:
    fontFamily: "Playfair Display, Noto Serif Thai, serif"
    fontSize: "2.25rem"
    fontWeight: 400
    lineHeight: 1.25
  title:
    fontFamily: "Playfair Display, Noto Serif Thai, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.333
  price:
    fontFamily: "Playfair Display, Noto Serif Thai, serif"
    fontSize: "1.875rem"
    fontWeight: 400
    lineHeight: 1.2
    fontFeature: "\"tnum\""
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
  body-sm:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.43
  caption:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.333
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  2xl: "18px"
  full: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
  "14": "56px"
  "20": "80px"
  "28": "112px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0 32px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.earth-800}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "48px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.earth-900}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "14px"
    height: "48px"
  chip:
    backgroundColor: "{colors.earth-200}"
    textColor: "{colors.earth-700}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.2xl}"
    padding: "20px"
  badge-confirmed:
    backgroundColor: "{colors.brand-50}"
    textColor: "{colors.brand}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
  badge-pending:
    backgroundColor: "{colors.amber-50}"
    textColor: "{colors.amber-700}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
---

<!--
  Status (2026-11-11): records the system the code already uses, with its drift
  removed. Where the code does one thing two ways, the dominant, accessible,
  on-brief way is normative here and the other is a Don't. Where a value in use
  fails WCAG 2.2 AA (PRODUCT.md), the nearest existing token that passes is
  normative. The proposed Warm Ivory / Sand / Sage / Forest / Charcoal values are
  NOT in this file yet: they live in docs/design-direction.md and arrive through
  docs/ui-improvement-roadmap.md. Re-run `/impeccable document` after that ships.
  Source of truth for values: src/app/globals.css.
-->

# Design System: Peaksnature

## Overview

**Creative North Star: "The Quiet Retreat"**

Peaksnature sells a feeling the guest already has in mind: mist over a valley,
a house with nobody else around, a morning that asks nothing of you. The
interface earns trust by getting out of the way. Real photographs of real
houses lead; warm ivory and sand surfaces hold them; one deep forest green
speaks for every action. Names of places and prices are set in a serif, the
way a good guesthouse letters its sign. Everything a guest reads or taps is
plain, legible and familiar.

The system is premium but approachable, and conventional on purpose: the
owner wants Booking.com-simple structure, done with care, not novel layouts.
Ambition shows as restraint and precision. Guest pages are airy; the host
dashboard and admin use the same palette and type at a denser, scannable
rhythm. Surfaces are flat at rest; depth comes from tonal layers and fine
borders, and shadow is reserved for things that float. Motion explains a
change or draws a line; it never decorates.

Confirmed rejections (the owner's brief): generic AI-generated SaaS looks,
gradients, glassmorphism, unnecessary shadows, excessively rounded cards,
black buttons as the default, low-contrast text, decorative motion, and
decoration that gets in the way of booking.

**Key Characteristics:**
- Real photography first; the interface recedes.
- One voice for action: Forest green, never black, never a gradient.
- Warm neutrals only (the `earth-*` scale); text dark enough to read in daylight.
- Serif for place names, headings and prices; system sans for reading and tapping.
- Flat at rest; borders and tonal layers for structure; shadow only when floating.
- Thai-first: no letter-spacing, no faux italics, no text under 12px.
- Phone-first for guests and hosts alike.

## Colors

A warm, earthy palette: one deep green against ivory, sand and teak-brown
neutrals. Contrast ratios below are WCAG 2.x, computed against the stated
surface.

### Primary
- **Forest** (`brand`, #2F5D50): every primary action (Book, Select this
  house, Done, Continue), selected states (chosen dates, chosen tier),
  links, focus rings and chart series. 7.49:1 on white; white text on Forest
  is 7.49:1.
- **Forest Hover** (`brand-hover`, #264A40): hover and pressed state of
  Forest fills. 9.83:1 with white.
- **Forest Deep** (`brand-700`, #1E3D34): the darkest green, for text on
  Forest tints. 11.85:1 with white.
- **Forest Mist** (`brand-50`, #EEF3F1) and **Forest Pale** (`brand-100`,
  #D4E0DC): selected-row and confirmed-badge fills, the date-range band.
  Forest text on Forest Mist is 6.68:1.

### Neutral
- **Warm Ivory** (`earth-50`, #faf8f5): the page background on guest
  surfaces.
- **Linen** (`earth-100`, #f0ebe4): the tonal layer for insets, empty
  panels and "today" in calendars.
- **Sand** (`earth-200`, #e0d5c8): dividers, card borders, chip fill. Not a
  text colour, and not enough on its own to outline an input (1.45:1).
- **Driftwood** (`earth-300`, #c9b9a6) and **Clay** (`earth-400`, #a89279):
  decorative lines and icons only, such as the section-mark rule (1.91:1 and
  2.98:1 on white: never text). On the dark Charcoal band, `earth-300` is the
  lightest-coloured *text* that passes (6.86:1).
- **Bark Light** (`earth-500`, #8d7560): input borders (4.33:1, above the
  3:1 a control boundary needs) and large text only. It fails as body text
  (4.33:1 on white, 4.09:1 on Warm Ivory).
- **Bark** (`earth-600`, #75604e): secondary text, captions, meta. The
  lightest text colour that passes AA on every light surface: 5.93:1 on
  white, 5.60:1 on Warm Ivory, 5.00:1 on Linen.
- **Teak** (`earth-700`, #5f4d40): body copy, chip text (5.54:1 on Sand).
- **Teak Deep** (`earth-800`, #4a3b32): strong text, secondary button text.
- **Charcoal** (`earth-900`, #3a2e27): headings, primary text, and the dark
  closing band and footer. 13.12:1 on white.
- **Surface** (#ffffff): cards, inputs, dialogs, sheets.
- **Stone** (`section-alt`, #F7F7F5): today's admin background. It is the one
  cool neutral in a warm system; keep it to admin until the tokens are
  unified (roadmap phase 0).

### Status
- **Confirmed / success:** Forest on Forest Mist.
- **Pending / warning:** `amber-700` on `amber-50` (4.87:1). For body text in
  a warning banner use `amber-800` (6.88:1).
- **Cancelled / error:** shadcn `destructive` (#e7000b, 4.76:1 on white) for
  text and borders; `red-700` on `red-50` (5.88:1) for banners.

### Named Rules
**The One Voice Rule.** Forest is the only colour for primary actions and
selection. Never the shadcn default `Button` (its `--primary` is near-black
#171717), never a gradient, never a second accent for the same job.

**The Readable Earth Rule.** Text on light surfaces is `earth-600` or darker.
`earth-300` and `earth-400` are lines and decoration; `earth-500` is borders
and large text.

**The Photo Scrim Rule.** Text over a photograph sits on a scrim strong
enough to give 4.5:1 against the brightest photo a host might upload, not
just the demo photo.

## Typography

**Display Font:** Playfair Display for Latin, with Noto Serif Thai for Thai
(`font-serif`; Noto Serif Thai is loaded at 400 and 700 only).
**Body Font:** the system UI stack (`ui-sans-serif, system-ui, sans-serif`),
so Thai renders in the OS Thai face (SF Thai or Thonburi on Apple, Noto Sans
Thai on Android, Leelawadee UI on Windows).
**Mono:** Geist Mono (loaded; not part of the visible system).

**Character:** a quiet serif for the names of places and prices, against a
plain, native sans that reads well in Thai on any phone.

Geist is loaded in `src/app/layout.tsx` but is not the body font in practice:
`@theme inline` inlines `--font-sans` into utilities instead of defining it on
`:root`, so the base `html` font falls back to the system stack, and only
elements with an explicit `font-sans` class (9 on `/[slug]`) render in Geist.
Whether to make the system stack official or apply a web font (with a Thai
companion) is an open decision in `docs/design-direction.md`.

### Hierarchy
- **Display** (serif 400, `text-4xl` → `sm:text-6xl` → `md:text-7xl`, i.e.
  36 → 60 → 72px, leading-tight): the homestay hero name on `/[slug]`. The
  platform hero on `/` runs 30 → 72px.
- **Headline** (serif 400, `text-3xl` → `md:text-4xl`, 30 → 36px,
  leading-tight): section headings (`SectionHeading`). Closing bands go to
  `md:text-5xl` (48px).
- **Title** (serif 400, `text-2xl`, 24px): house names, card titles.
- **Price** (serif 400, `text-3xl`, 30px, `tabular-nums`): nightly prices on
  house rows; the `฿` and "/คืน" sit beside it in body-sm.
- **Body** (sans 400, 16px, `leading-relaxed` 1.625): running text and every
  input on phones (16px stops iOS zooming into a focused field).
- **Body small** (sans 400, 14px, 1.625): secondary copy, list rows,
  dashboard text. Today's most common paragraph size.
- **Label** (sans 600, 14px): button labels, form labels, tabs. Latin labels
  may be uppercase with `tracking-widest`; Thai labels never.
- **Caption** (sans 500, 12px): chips, badges, legends, helper lines. The
  floor: nothing smaller.

### Named Rules
**The No-Track Thai Rule.** Letter-spacing and `uppercase` are Latin-only.
Tracking pulls Thai vowels and tone marks away from their consonants. Gate it
on the locale or script, as `src/components/booking/booking-footer.tsx` and
`src/components/full-screen-menu.tsx` already do, and as `SectionMark` does by
keeping its tracked numerals Latin.

**The Upright Thai Rule.** Never italicise Thai. Noto Serif Thai ships no
italic, so the browser fakes a slant. Emphasise with Forest colour or weight.

**The 12px Floor.** No text under 12px, Thai or Latin. Thai running text is
14px minimum, 16px in inputs.

## Layout

Tailwind v4 defaults; nothing in `globals.css` overrides them.

- **Breakpoints:** `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl`
  1536px. `md` is the phone/desktop switch for booking UI (the sticky
  booking bar and the desktop date search swap there).
- **Containers:** `max-w-7xl` (1280px) for headers and wide pages;
  `max-w-6xl` (1152px) for the houses list; `max-w-4xl` (896px) for the
  availability calendar; `max-w-3xl` (768px) for closing bands and reading
  columns; `max-w-md` / `max-w-sm` for forms and dialogs.
- **Gutters:** 16px (`px-4`) on phones, 24px (`sm:px-6`), 32px (`lg:px-8`).
  A container is never wider than its viewport minus the gutter: at 1280px a
  `max-w-7xl` container needs its gutter or content touches the edge.
- **Rhythm:** a 4px base (`--spacing: 0.25rem`). Guest sections breathe at
  56px on phones (`py-14`), 80px on tablets (`md:py-20`) and 112px from `lg`
  (`lg:py-28`); dark bands use 96 → 128px. Dashboard pages pad 16 / 24 / 32px
  (`p-4 sm:p-6 lg:p-8`).
- **Section heading column:** the `/[slug]` heading-beside-text sections split
  5/7 on tablets and 4/8 from `lg`; at 4/12 a 36px Thai heading splits mid-word.
- **Phones:** the `/[slug]` hero fills the screen (`100svh`, settled). The
  sticky booking bar sits above the home indicator
  (`pb-[env(safe-area-inset-bottom)]`). Horizontal swipe rows keep the page
  gutter on their first item (`scroll-padding` / `scroll-pl-4`).
- **Density by surface:** guest pages are airy; the host dashboard is
  compact cards in a single column on phones; admin is denser lists.
- **Targets:** 44 × 44px on phones for anything tapped often; never under 24
  × 24px (WCAG 2.5.8).

## Elevation & Depth

Flat at rest (the owner's choice). Depth is tonal: Warm Ivory page, white
cards with a 1px Sand border, Linen insets inside them. Shadow appears only on
layers that float above the page, and its job is separation, not decoration.

### Shadow Vocabulary
- **Popover** (`shadow-md`, Tailwind default): dropdowns, selects, popovers
  (shadcn defaults, unchanged).
- **Modal** (`shadow-lg`): dialogs and sheets (shadcn defaults), over a
  `bg-black/50` overlay.
- **Sticky bars:** a 1px Sand border on the edge that meets content, no
  shadow and no blur.

### Named Rules
**The Flat-at-Rest Rule.** Cards, buttons and inputs carry no shadow at rest.
`shadow-lg`/`shadow-xl` on a CTA or a summary card, and hover lift on a card
that is not a link, are drift.

## Shapes

Radius comes from `--radius: 0.625rem` (shadcn): `sm` 6px, `md` 8px, `lg`
10px, `xl` 14px, `2xl` 18px; `full` for pills. The form language is soft but
not bubbly.

- **Pills** (`rounded-full`): every button, chip, badge, segmented control
  and step dot.
- **14px** (`rounded-xl`): inputs, inner panels, alert boxes, house photos on
  `/[slug]`.
- **18px** (`rounded-2xl`): content cards, the booking summary card, house
  photos on `/book`, the mobile sheet's top corners.
- **10px** (`rounded-lg`): dialogs (shadcn default).
- Borders are 1px Sand; a selected option takes a 1px Forest border on Forest
  Mist.
- One radius per role: a card never mixes 14px and 22px corners with the same
  job elsewhere.

## Components

### Buttons
- **Shape:** pill (9999px), 48px tall for primary actions (`h-12`, or
  `py-3.5` for full-width), 40px in dense dashboard rows.
- **Primary:** Forest fill, white label 14px semibold. Latin labels may be
  uppercase with `tracking-widest`; Thai labels stay unspaced.
- **Hover / Focus:** hover to Forest Hover. Focus is a 2px solid Forest ring
  with a 2px offset (7.49:1). A ring at `brand/40` is too faint (1.94:1).
- **Secondary:** white fill, 1px Sand border, Teak Deep label, the same
  pill. On a photo, white at 90% with no border.
- **Ghost / link:** Forest text, underline on hover. Dashboard icon buttons
  are ghost, at least 40px (44px on phones), and always carry an
  `aria-label`.
- **Disabled:** 50% opacity, `cursor-not-allowed`, no hover change. The house
  card's "Select this house" stays disabled until both dates are chosen
  (settled).
- **Never:** the shadcn default variant (near-black), gradients, shadows.

### Chips
- **Style:** Sand fill, Teak text, 12px medium, pill, `2px 10px`.
- **State:** a selected filter chip takes Forest Mist with a Forest border.

### Cards / Containers
- **Corner Style:** 18px for content cards; 14px for inner panels.
- **Background:** white on Warm Ivory; Linen for empty or inset panels.
- **Shadow Strategy:** none at rest (see Elevation).
- **Border:** 1px Sand.
- **Internal Padding:** 20px on phones (`p-5`), 32px from `lg` (`lg:p-8`).
- **Nesting:** at most one surface inside a card. An icon disc inside an
  empty panel inside a card is one layer too many.

### Inputs / Fields
- **Style:** white, 1px `earth-500` border (4.33:1), 14px radius, 14px padding,
  16px text on phones, a leading icon in `earth-500` where it helps.
- **Label:** above the field, Teak 14px semibold, unspaced, tied to the input
  with `htmlFor`/`id`. Placeholder is an example, never the label.
- **Focus:** 2px solid Forest ring. Never `ring-0` with only a border shift.
- **Error:** `destructive` border, message below in `destructive` 12px with
  `role="alert"`, linked by `aria-describedby`.
- **Disabled:** 50% opacity, not editable.

### Navigation
- **Guest header:** transparent over the hero; once scrolled, solid white with
  a 1px Sand bottom border, no glass. Brand mark and name left; language and
  menu right, each a 44px target.
- **Guest phone menu:** `FullScreenMenu`, 44px rows, unspaced Thai, labelled
  close button (the reference implementation).
- **Mobile booking bar:** one Forest CTA that carries the dates on a second
  line, plus a cart tile with a count badge (settled). Tapping the CTA always
  reopens the date picker.
- **Host dashboard:** collapsible sidebar from `lg`; below it a 56px top bar
  with a menu button (44px target) and a drawer. Active item: Forest icon and
  text.
- **Admin:** an earth-toned sidebar with an active-item indicator.

### Dialogs, Sheets, Menus
- **Dialog** (shadcn): centered, 10px radius, `shadow-lg`, `bg-black/50`
  overlay; one primary pill at the bottom; an X close with an accessible
  name. Used for picking dates and configuring a house.
- **Sheet** (shadcn): bottom sheet on phones for cart review, 18px top
  corners, the total and one primary CTA pinned at the bottom.
- **Dropdowns and Select** (shadcn): 8px radius, `shadow-md`, 44px rows on
  phones.

### Calendars
- **Date picker** (shadcn `Calendar`, react-day-picker 9, in
  `BookingCalendarDialog`): 44 × 44px day buttons; check-in and check-out are
  Forest circles joined by a Forest Pale band; today is a Linen circle; past
  days are `earth-400` and disabled. Check-in and check-out summary boxes sit
  above the grid.
- **Availability calendar** (`AvailabilityCalendarSection`): month grid with a
  legend for all free, some free and full. Status must not rely on colour
  alone, and days from the next month that stay clickable must keep text
  contrast.

### Badges and Status
- **Normative:** admin's `StatusBadge` tones (`src/components/admin/status-badge.tsx`):
  confirmed Forest, completed Teak, pending amber, cancelled and rejected
  destructive, inactive muted. Caption type, pill.
- The host dashboard's per-status Tailwind colours (yellow, blue, green,
  purple) are drift.

### Feedback and States
- **Toasts:** sonner, `richColors`, top-right.
- **Loading:** shadcn `Skeleton` for content; `Loader2` spinners only inside
  the button that is working.
- **Empty states:** admin's `EmptyState` pattern: icon, title, one line, one
  action.
- **Errors:** say what happened and the next step, with a way out.

### Section Mark and Heading (signature)
The "01 ——" counter above each `/[slug]` landing heading (`SectionMark`):
Latin numerals carry the spaced-caps look so Thai never gets tracked, a CSS
counter numbers only sections that render, and the rule draws in once as the
section enters. `SectionHeading` slides the serif heading up from behind a
mask padded so Thai marks are not clipped.

## Do's and Don'ts

### Do:
- **Do** use Forest (#2F5D50) for every primary action, selection and focus
  ring.
- **Do** set text on light surfaces in `earth-600` (#75604e) or darker, and
  in `earth-300` or lighter on Charcoal.
- **Do** give every input a visible label tied to it with `htmlFor`, a 1px
  `earth-500` border and a 2px solid Forest focus ring.
- **Do** keep tap targets at 44 × 44px on phones and never under 24 × 24px.
- **Do** keep tracking and uppercase to Latin text; reuse the locale gate in
  `booking-footer.tsx`.
- **Do** keep cards flat: white, 1px Sand border, 18px radius.
- **Do** start content visible. Motion may refine an entrance; it may not
  hide content until JavaScript runs.
- **Do** wrap every motion tree in `RespectReducedMotion`, and give every CSS
  keyframe a `prefers-reduced-motion` rule.
- **Do** keep UI transitions under 300ms and animate only `transform` and
  `opacity`.
- **Do** show prices with `tabular-nums`, and "เริ่มต้น" (from) whenever the
  figure is a minimum.

### Don't:
- **Don't** use the shadcn default `Button` variant, `bg-primary` or
  `text-primary`: they render near-black (#171717).
- **Don't** set text in `earth-400` (2.98:1) or `earth-500` (4.33:1) on light
  surfaces, or in `earth-500` on Charcoal (3.03:1).
- **Don't** letter-space or italicise Thai (`tracking-*`, `uppercase`,
  `italic` on Thai strings).
- **Don't** set text under 12px (`text-[9px]`, `text-[10px]`, `text-[11px]`,
  `text-[0.7rem]`).
- **Don't** use gradients (`bg-gradient-to-*`), glass (`.glass-nav`,
  `backdrop-blur` on bars) or `shadow-lg`/`shadow-xl` on cards and buttons.
- **Don't** use `rounded-3xl` on cards, or nest more than one surface inside
  a card.
- **Don't** use raw Tailwind greys (`gray-*`, `slate-*`) or hard-coded hexes
  (`bg-[#f8f9fa]`, `bg-[#F83858]`, `text-[#111111]`); use the `earth-*` scale.
- **Don't** colour booking statuses per screen; use the `StatusBadge` tones.
- **Don't** add hover lift to cards that are not links.
- **Don't** use `transition-all`; name the properties.
- **Don't** invent testimonials, people, numbers or claims (the placeholder
  `landing/reviews.tsx` was deleted on 2026-11-13; don't bring it back).
