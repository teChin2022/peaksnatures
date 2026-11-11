# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Guests (primary):** Thai travellers, mostly on phones, booking a nature
  stay directly on a homestay's own page (`/[slug]`, booking at
  `/[slug]/book`). They pick dates first, choose one or more houses, then pay
  a deposit or the full amount by PromptPay and upload the transfer slip.
  Foreign visitors use the English version, which is secondary.
- **Hosts:** owner-operators of nature homestays in Thailand. They run the host
  dashboard (`/dashboard`) mostly on their phones: bookings, check-ins,
  payments, houses, prices, calendar, promo codes and their billing plan.
  Booking alerts reach them by SMS or LINE, with email as the fallback.
- **Platform admins:** internal staff on `/admin` (English only): host
  approval and verification, plans, billing and invoices, bookings, logs and
  settings.

## Product Purpose

Peaksnature is a multi-tenant, white-label booking platform for nature
homestays in Thailand. Each host gets a one-page booking site at `/<slug>`;
the home page `/` lets travellers discover homestays across the platform.

It exists so that local hosts can take direct bookings without relying on
large booking platforms, and so travellers can find nature places that are
otherwise hard to discover online. Success is a guest who books with
confidence on a phone, and a host who runs the business from a phone.

## Positioning

A direct, transparent booking site for each nature homestay (mountains,
forests, rivers, rural areas), built on mechanisms a listing site does not
offer the host:

- PromptPay slip verification (EasySlip) that confirms a booking without the
  host stepping in.
- Deposits, with the balance settled on arrival.
- QR check-in and check-out, and reviews from real guests.

Peaksnature is the platform, not the accommodation provider.

## Operating Context

- Booking: the guest books on `/[slug]/book`; the booking is created
  `pending` and the houses are held for a limited time; the guest uploads a
  PromptPay slip; `/api/verify-slip` checks it; the booking is confirmed, the
  host notified and the guest emailed.
- After booking, guests can change dates (host approves), check in and out by
  QR, and leave a review.
- Hosts pay for the platform on one of three plans: Free, Commission (a
  per-booking cut from a prepaid wallet) or Fixed Rate (monthly, paid upfront
  by PromptPay slip). Every billing date is a calendar day in Asia/Bangkok.
- Notifications: guests by email (Resend); hosts by SMS or LINE, then email.

## Capabilities and Constraints

- Thai is the default language. English is available; host content is
  translated automatically (Gemini, cached in Redis).
- Production system: UI work must not change the schema, auth, RLS, booking
  workflow, payment verification, availability and hold logic, pricing and
  commission calculations, API contracts or tenant routing.
- Terminology: a bookable unit is บ้านพัก / House, never ห้องพัก / Room, in
  user-facing copy (code identifiers still say `rooms`). Thai counts use the
  classifier หลัง.
- `/admin` stays English-only.
- Stack: Next.js 16 App Router, React 19, Tailwind CSS v4, shadcn/ui,
  Supabase, Vercel.

## Brand Commitments

- Name: Peaksnature. Tagline in use: "Discover Nature. Stay Local."
- Direction set by the owner: Nature Luxury / Modern Hospitality. Premium
  but approachable; modern, elegant, minimal; real nature photography; clear,
  trustworthy booking.
- Guest, host and admin surfaces share one design language at different
  densities.

## Evidence on Hand

- Real host-uploaded photos of each homestay and its houses (Supabase
  Storage).
- Real guest reviews; a verified-host badge, shown only for verified hosts;
  platform stats computed from the database (`src/lib/landing-stats.ts`).
- No real testimonials, press, awards or partner logos exist.
  `src/components/landing/reviews.tsx` holds invented placeholder testimonials;
  it is not rendered and must never ship. Do not invent people, quotes,
  numbers, prices or claims.

## Product Principles

1. Booking confidence on a phone comes first: dates, price, status and payment
   instructions are clear at every step.
2. Never put the booking or payment path at risk for a visual improvement.
3. Familiar beats novel: the owner prefers the simplest conventional patterns
   (Booking.com-style), done with care.
4. Show the real place: honest photos and real reviews over decoration.
5. Hosts' time is scarce: the dashboard is quick to scan and act on from a
   phone.

## Accessibility & Inclusion

- WCAG 2.2 AA on every surface: 4.5:1 text contrast (3:1 for large text and
  control boundaries), visible focus, full keyboard access, labelled
  controls, targets of at least 24 × 24 px (aim for 44 px on phones), and
  `prefers-reduced-motion` respected.
- Thai script needs legible sizes and generous line height: tone marks and
  vowels sit above and below the line.
