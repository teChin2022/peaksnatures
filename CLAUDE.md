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
npm run test:coverage # Run with V8 coverage; fails below the 90% thresholds
```

Type-check with `npx tsc --noEmit` rather than `npm run build` — the local build
fails on an empty `CRON_SECRET` independently of any given change.

## Testing

Vitest (`vitest.config.mts`) with V8 coverage. Tests are co-located as
`*.test.ts` next to the source; shared helpers and row fixtures live in `test/`.

- `test/setup.ts` pins `TZ=Asia/Bangkok` (several modules read local-time date
  parts) and sets `CRON_SECRET` — `src/lib/auth/cron-auth.ts` throws at module
  load without one of at least 32 characters. `REDIS_URL` is left unset so the
  rate limiter uses its in-memory path.
- `test/helpers/supabase.ts` builds a chainable `{ data, error }` query stub;
  pass an array per table to script successive `.from()` calls.
- `test/helpers/request.ts` builds a `NextRequest` for route handlers.
- Coverage is enforced at 90% (lines, functions, branches, statements) over
  `src/lib/**` and `src/app/api/**` only. Generated shadcn primitives, page and
  layout shells, React components, hooks and declaration-only modules are
  excluded — see `coverage.exclude` in `vitest.config.mts`.
- Browser-only modules opt into a DOM with a `// @vitest-environment happy-dom`
  docblock; everything else runs in the `node` environment.
- Some tests deliberately pin behaviour that looks wrong, each marked with a
  `KNOWN GAP` comment. Read the comment before "fixing" the code under test.

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
