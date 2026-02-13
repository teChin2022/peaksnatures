# PeaksNature — Homestay Booking App

Multi-tenant white-label booking platform for nature homestays in Thailand, featuring an AI chat assistant powered by Supabase MCP.

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **Tailwind CSS v4** + shadcn/ui
- **Supabase** (Postgres, Auth, Storage)
- **Vercel AI SDK** + **Google Gemini** + Supabase MCP (AI booking assistant)
- **EasySlip API** (auto-verify payment slips)
- **Resend** (guest email notifications)
- **LINE Messaging API** (host notifications)
- **PromptPay** QR code payments

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your API keys

# Run database migrations (in Supabase SQL Editor)
# See: supabase/migrations/001_initial_schema.sql
# Seed data: supabase/seed.sql

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google Gemini API key (for AI chat) |
| `EASYSLIP_API_KEY` | EasySlip API key (slip verification) |
| `RESEND_API_KEY` | Resend API key (email) |
| *(per host in DB)* | `line_channel_access_token` + `line_user_id` stored per host |

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page with homestay grid |
| `/[slug]` | One-page booking (hero, gallery, rooms, calendar, form, AI chat) |
| `/dashboard` | Host dashboard (bookings, management) |

## Key Features

- **Two ways to book**: Manual form OR AI chat assistant
- **Auto-verify payments**: EasySlip verifies PromptPay slips automatically
- **Auto-confirm bookings**: No manual host confirmation needed for verified slips
- **Notifications**: Email to guest (Resend) + LINE message to host
- **MCP-powered AI**: Supabase MCP gives the chat assistant structured DB access
