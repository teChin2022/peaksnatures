# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000 (Turbopack)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

No test framework is configured — avoid suggesting test commands.

## Architecture Overview

**Peaksnature** is a multi-tenant white-label booking platform for nature homestays in Thailand. It is a Next.js 16 App Router project using TypeScript strict mode, Tailwind CSS v4, shadcn/ui, and Supabase as the backend.

Path alias: `@/*` → `./src/*`

### Key Directories

- `src/app/` — Next.js App Router pages and API routes
- `src/components/` — React components (UI in `ui/`, feature groups in `booking/`, `landing/`, `dashboard/`, `admin/`, `chat/`)
- `src/lib/` — Shared utilities: Supabase clients, notifications, rate limiting, price calculation, etc.
- `src/types/database.ts` — Supabase DB types (canonical reference for table shapes and enums like `BookingStatus`)
- `src/middleware.ts` — Auth middleware protecting `/dashboard` and `/admin` routes, with 5-min host status cache
- `messages/` — i18n strings (`en.json`, `th.json`) via `next-intl`
- `supabase/migrations/` — 38+ SQL migration files; `000_full_schema.sql` is the full schema dump

### Routing Structure

| Route | Description |
|-------|-------------|
| `/` | Landing page (60s ISR, server-rendered homestay grid) |
| `/[slug]` | Single-page booking (hero, gallery, rooms, calendar, booking form, AI chat) |
| `/dashboard/*` | Host dashboard (bookings, rooms, calendar, homestay, profile) |
| `/admin/*` | Admin dashboard (hosts, homestays, bookings, logs, settings) |
| `/api/*` | API routes (~42 total) |

### Booking Flow

1. Guest visits `/[slug]` and books via **form** or **AI chat**
2. Booking created with status `pending`
3. Guest uploads PromptPay slip → `/api/verify-slip` calls **EasySlip API**
4. If verified: booking auto-confirmed → host notified via **LINE Messaging API**, guest via **Resend email**

### AI Chat (`/api/chat`)

- Uses **Vercel AI SDK** with **Google Gemini 2.5 Flash**
- Tools (`check_availability`, room info, pricing) use a custom Supabase MCP server at `src/lib/mcp/supabase-mcp-server.ts`
- Rate-limited: max 20 messages, 2000 chars per message

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
OPEN_AI_API_KEY
EASYSLIP_API_KEY
RESEND_API_KEY
SMS_KUB_API_KEY
SMS_KUB_SENDER
CRON_SECRET              # Secures /api/cron/* endpoints. Generate with: openssl rand -base64 32
```

Per-host LINE credentials (`line_channel_access_token`, `line_user_id`) are stored in the `hosts` DB table.

### i18n

`next-intl` with locale files in `messages/`. Configured via `src/i18n/request.ts`. Supports English (`en`) and Thai (`th`).

### Security

Security headers are set in `next.config.ts` (CSP, HSTS, X-Frame-Options). Auth is session-based via Supabase, enforced at the middleware level. Cloudflare Turnstile is used for CAPTCHA. Security PINs and passwords are hashed with `bcryptjs`.
