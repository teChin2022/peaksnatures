# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev           # Start dev server at http://localhost:3000 (Turbopack)
npm run build         # Production build
npm run start         # Start production server
npm run lint          # Run ESLint
npm run test          # Run the Vitest suite once
npm run test:watch    # Vitest in watch mode
npm run test:coverage # Run with V8 coverage; reports only, never fails
```

Type-check with `npx tsc --noEmit` rather than `npm run build` — the local build
fails on an empty `CRON_SECRET` independently of any given change. When you do
need a real build (bundling errors, client/server boundary), supply one:
`CRON_SECRET="$(openssl rand -base64 32)" npx next build`.

## Testing

Vitest (`vitest.config.mts`) with V8 coverage. Tests are co-located as
`*.test.ts` next to the source; shared helpers and row fixtures live in `test/`.

- `test/setup.ts` pins `TZ=Asia/Bangkok` (demand tracking and other date-fns
  callers read local-time date parts) and sets `CRON_SECRET` —
  `src/lib/auth/cron-auth.ts` throws at module load without one of at least 32
  characters. `REDIS_URL` is left unset so the rate limiter uses its in-memory
  path. Billing does **not** rely on that pin: it names Asia/Bangkok explicitly
  (see The billing calendar), so those tests pass a fixed instant or use
  `vi.setSystemTime` and assert the same result under any TZ.
- `test/helpers/supabase.ts` builds a chainable `{ data, error }` query stub;
  pass an array per table to script successive `.from()` calls.
- `test/helpers/request.ts` builds a `NextRequest` for route handlers.
- Coverage is **reported, not enforced**. The 90% thresholds are written in
  `vitest.config.mts` but commented out, so `npm run test:coverage` always exits
  0 — a green run says nothing about coverage. The scope is `src/lib/**` and
  `src/app/api/**` only, currently ~54% of lines; generated shadcn primitives,
  page and layout shells, React components, hooks and declaration-only modules
  are excluded — see `coverage.exclude`. For a per-file number, read
  `coverage/lcov.info` rather than trusting the exit code.
- Browser-only modules opt into a DOM with a `// @vitest-environment happy-dom`
  docblock; everything else runs in the `node` environment.
- Some tests deliberately pin behaviour that looks wrong, each marked with a
  `KNOWN GAP` comment. Read the comment before "fixing" the code under test.

## After a large or risky change

Two passes before calling the work done. Neither is optional on anything
touching billing, dates, auth or the booking path.

### 1. Analyze the tests

A green suite is not evidence the change is covered — coverage is not enforced
here, so nothing fails when a module sits at 0%.

- **Does the code you touched have tests at all?** Read its row in
  `coverage/lcov.info`, not the summary table.
  `src/app/api/cron/billing/route.ts` was at 0% while the suite looked healthy.
- **Would the tests have caught the bug?** Mutate the fix back to the broken
  behaviour, re-run, confirm the expected tests fail with the expected message,
  then restore. A test that passes either way is pinning nothing. The ฿24
  proration stub, the cron's `isFirstOfMonth` trigger and the free-plan expiry
  boundary were each confirmed this way; for the first two there had been no
  test at that input at all, and the summary numbers gave no hint of it.
- **If the code resists testing where it sits, move it.** Pure arithmetic
  buried in a route handler that needs the whole Supabase surface mocked
  belongs in its own module — see `src/app/api/cron/billing/dates.ts`.
- Pin the regression at the exact input that failed, not a nearby one.

### 2. Analyze the impact on other parts

The change is rarely confined to the file you edited.

- **Other callers, and inlined copies of them.** `grep` the symbol, then grep
  the logic. Duplicated code drifts silently: `blockingInvoiceFilter` had a
  hand-rolled copy in `dashboard-shell.tsx`, and the free-plan expiry predicate
  had two more in page components.
- **What the change makes newly inconsistent.** Fixing one half of a
  client/server pair can widen a gap instead of closing it. Check the
  invariants the surrounding comments claim still hold.
- **Client vs server.** `"use client"` files cannot import anything reaching
  `next/headers` or `ioredis`. `npx tsc --noEmit` does **not** catch this —
  only a real build does:
  `CRON_SECRET="$(openssl rand -base64 32)" npx next build`.
- **Blast radius, before changing behaviour.** `isHostBlocked` gates six
  booking routes and three public pages; `getPlanExpiryInfo` sits under it.
  Know the reach before moving a boundary.
- **Correctness that rests on config rather than code.** The cron's dates were
  right only because `vercel.json` runs it at `0 0 * * *`. If a change is safe
  only under the current configuration, either say so or remove the dependency.

State plainly what you did **not** change and why, so the remaining work stays
visible instead of looking finished.

## Architecture Overview

**Peaksnature** is a multi-tenant white-label booking platform for nature homestays in Thailand. It is a Next.js 16 App Router project using TypeScript strict mode, Tailwind CSS v4, shadcn/ui, and Supabase as the backend.

Path alias: `@/*` → `./src/*`

### Key Directories

- `src/app/` — Next.js App Router pages and API routes
- `src/components/` — React components (UI in `ui/`, feature groups in `booking/`, `landing/`, `dashboard/`, `admin/`)
- `src/lib/` — Shared utilities: Supabase clients, notifications, rate limiting, price calculation, etc.
- `src/types/database.ts` — Supabase DB types (canonical reference for table shapes and enums like `BookingStatus`)
- `src/middleware.ts` — Auth middleware protecting `/dashboard` and `/admin` routes, with 5-min host status cache
- `messages/` — i18n strings (`en.json`, `th.json`) via `next-intl`
- `supabase/migrations/` — 38+ SQL migration files; `000_full_schema.sql` is the full schema dump

### Routing Structure

| Route | Description |
|-------|-------------|
| `/` | Landing page (60s ISR, server-rendered homestay grid) |
| `/[slug]` | Single-page booking (hero, gallery, rooms, calendar, booking form) |
| `/dashboard/*` | Host dashboard (bookings, rooms, calendar, homestay, profile) |
| `/admin/*` | Admin dashboard (hosts, homestays, bookings, logs, settings) |
| `/api/*` | API routes (~42 total) |

### Booking Flow

1. Guest visits `/[slug]` and books via the booking form
2. Booking created with status `pending`
3. Guest uploads PromptPay slip → `/api/verify-slip` calls **EasySlip API**
4. If verified: booking auto-confirmed → host notified via **LINE Messaging API**, guest via **Resend email**

### Host Billing Plans

Three plans on `hosts.plan_type`: `free`, `commission` (per-booking cut deducted
from a prepaid wallet), `fixed_rate` (a monthly subscription, always billed
upfront — never at month end).

Plan changes take effect immediately, and Fixed Rate is paid for before it
starts:

1. Host picks Fixed Rate → `POST /api/host/plan/switch` returns **402
   `PAYMENT_REQUIRED`** with a quote and **writes nothing**
2. Host uploads a PromptPay slip → `POST /api/host/plan/activate` recomputes the
   amount server-side, verifies via EasySlip, then the
   `activate_fixed_rate_plan` RPC writes the paid invoice and flips the plan in
   one transaction
3. An abandoned payment therefore leaves no invoice and no plan change behind

Mid-month entry is prorated: `computeImmediateFixedRateInvoice`
(`src/lib/billing.ts`) charges the rest of the current month at the day rate,
plus whole discounted months for a multi-month term. A `term_months` of 1 means
"monthly billing" and buys only the part-month — the 1st-of-month cron bills the
rest as usual. "The current month" and the day it starts on are read off the
Bangkok calendar — pass `billingToday()`, never a UTC-derived date.

Switching to Commission applies in place and requires a wallet of at least
`LOW_WALLET_THRESHOLD` (฿300); leaving Fixed Rate mid-term forfeits the
remainder with no refund, recorded as `forfeited_days` in the audit log.

`plan_pending_*` now only ever describes a **Fixed Rate renewal** (the new term
starts the day after the current one ends). The cron's apply-pending section
still handles a pending `commission` switch so pre-existing rows drain — don't
delete that branch as unreachable.

### The billing calendar (Asia/Bangkok)

Every billing date means a **calendar day in Asia/Bangkok**, never a UTC day and
never the server's or browser's local day. `src/lib/billing-dates.ts` is the
single source of that: `billingToday()` returns today's Bangkok date as a Date
pinned to UTC midnight, and `billingTodayStr()` is the `YYYY-MM-DD` form for
comparing against DATE columns.

Never write `new Date().toISOString().split("T")[0]` or read `now.getUTC*()` to
decide what "today" is. Vercel runs in UTC, so for the first seven hours of
every Thai day those disagree with the host — which is what once billed a host
paying at 01:00 on 1 September a ฿24 proration stub for 31 August, on top of the
term they actually bought. `toISOString()` has the same hazard in the browser:
it is UTC regardless of the user's clock.

`getUTCFullYear/getUTCMonth/getUTCDate` is still correct for reading an anchor
back: those Dates sit at UTC midnight *carrying the Bangkok date*, which is why
`computeImmediateFixedRateInvoice` and `cronBillingDates` read their parts that
way on purpose. The rule above is about deriving the anchor from the clock, not
about anchors already built.

End dates are **inclusive of their day**, uniformly:

- a Fixed Rate term is active on `fixed_rate_term_ends_at` (`>= today`)
- an invoice does not block until the day *after* `due_date` (`due_date.lt.today`)
- a free plan's last free day is `plan_free_expires_at` itself (Day 0 is
  `active`; grace is Day +1 to +6; blocked from Day +7) — see `plan-expiry.ts`

`plan_free_expires_at` is TIMESTAMPTZ but every writer sends a bare date, which
Postgres stores at `00:00+00` — 07:00 in Bangkok. `getPlanExpiryInfo` therefore
compares Bangkok *calendar days*, not instants, so the stored time of day does
not matter and no migration is needed.

`billing-dates.ts` is deliberately import-free so `"use client"` pages can share
it — `@/lib/billing` cannot be imported from the client (it reaches
`next/headers` and `ioredis`), but it re-exports everything here for server
callers. Same pattern as `wallet-thresholds.ts`.

The daily cron derives all fifteen of its dates from one anchor via
`cronBillingDates()` (`src/app/api/cron/billing/dates.ts`), which is pure and
unit-tested — the route itself has no tests, so date arithmetic belongs in that
module, not inline.

### Supabase Clients

- `src/lib/supabase/client.ts` — browser-side client
- `src/lib/supabase/server.ts` — server-side client (for API routes and Server Components)

### Notifications

- `src/lib/notifications.ts` — Resend (guest email) + LINE Messaging API + SMS via sms-kub.com (host notifications)
- Host notification dispatch: retry 3 times on preferred channel (SMS or LINE), then fallback to email

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
EASYSLIP_API_KEY
RESEND_API_KEY
SMS_KUB_API_KEY
SMS_KUB_SENDER
CRON_SECRET              # Secures /api/cron/* endpoints. Generate with: openssl rand -base64 32. Must be ≥ 32 chars or the cron route's serverless function refuses to initialize. Rotate ~every 90 days; after rotation, sign in as admin and verify /api/health/cron returns ok within 25h.
NEXT_PUBLIC_APP_URL      # Canonical/runtime URL. Used by SEO (metadata, sitemap, robots, JSON-LD), magic-link emails, and notifications. Set per-environment in Vercel: prod = https://peaksnature.com, preview = the preview hostname, local = http://localhost:3000. NEXT_PUBLIC_SITE_URL is still read as a fallback for back-compat but new envs should use NEXT_PUBLIC_APP_URL only.
GOOGLE_SITE_VERIFICATION # Optional. Google Search Console verification token.
BING_SITE_VERIFICATION   # Optional. Bing Webmaster verification token.
REDIS_URL                # Redis Cloud connection string for the Thai→English translation cache used on /[slug]. Format: redis://default:<password>@<host>:<port> (use rediss:// if TLS). Optional: if unset, EN locale silently falls back to TH content.
GOOGLE_GENERATIVE_AI_API_KEY # Gemini API key consumed by @ai-sdk/google. Used by the homestay translation cache.
```

Per-host LINE credentials (`line_channel_access_token`, `line_user_id`) are stored in the `hosts` DB table.

### i18n

`next-intl` with locale files in `messages/`. Configured via `src/i18n/request.ts`. Supports English (`en`) and Thai (`th`).

### Security

Security headers are set in `next.config.ts` (CSP, HSTS, X-Frame-Options). Auth is session-based via Supabase, enforced at the middleware level. Cloudflare Turnstile is used for CAPTCHA. Security PINs and passwords are hashed with `bcryptjs`.

Rate limiting (`src/lib/rate-limit.ts`) is Redis-backed via `ioredis` when `REDIS_URL` is set, with an in-memory per-process fallback otherwise. Both Turnstile (`src/lib/turnstile.ts`) and the rate limiter are designed to **fail open** — Cloudflare or Redis being unreachable must never block legitimate bookings.
