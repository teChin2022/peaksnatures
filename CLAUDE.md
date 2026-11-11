# CLAUDE.md

Peaksnature is a multi-tenant white-label booking platform for nature homestays
in Thailand: Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4,
shadcn/ui, Supabase. Path alias `@/*` → `./src/*`.

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

- Type-check with `npx tsc --noEmit`: `npm run build` fails locally on an empty
  `CRON_SECRET` whatever the change. Real build:
  `CRON_SECRET="$(openssl rand -base64 32)" npx next build`.
- Lint baseline: 29 errors (2026-11-02), all `react-hooks/*`. Compare per-rule
  counts before and after your change; zero is not the bar.

## Working rules

### 1. No guessing

- Before using any Next.js or Supabase API, check the installed version in
  `package.json` and see how existing code in this repo already uses it. These
  APIs change often between versions.
- Never invent tables, columns, functions, env vars, packages, or config
  options. Verify them against `supabase/migrations`, the types in
  `src/types/database.ts`, and `package.json`.
- Read the relevant files before editing them or drawing conclusions about them.
- If you are unsure, ask me, or state plainly: "I have not verified this."
- Keep verified facts and assumptions clearly separate in your answers.
- You cannot see the remote database. Only describe the schema as defined by
  the migrations in this repo.

**In this repo:** the latest migration touching a table or function wins.
`000_full_schema.sql` is an April 2026 snapshot and is behind. Migrations are
applied by hand in the Supabase SQL editor; there is no Supabase CLI config.

### 2. Minimal changes

- Change only what was asked. No refactoring, renaming, reformatting, or
  dependency upgrades that are unrelated to the task.
- Do not add features, libraries, or abstractions that were not requested.
- If you notice other problems along the way, report them at the end. Do not
  fix them unasked.
- Follow existing patterns: folder structure, data fetching, error handling,
  naming.
- Default to Server Components. Add `"use client"` only where it is actually
  required.

### 3. Testing

Any behavior change requires writing or updating tests:

- Logic, utils, hooks: unit tests
- API routes and Server Actions: cover both success and error paths
- RLS policies and DB functions: pgTAP tests in `supabase/tests`. **Not set up
  yet** (no local Supabase stack): write the per-role SQL checks for me to run,
  and say a pgTAP test is owed.
- Critical user flows: Playwright E2E. **Not set up yet**: name the E2E test
  that is owed, and ask before installing Playwright.
- Bug fixes: write a failing test first, then make it pass.

After every change, run typecheck, lint, and the relevant tests, and report the
real results. Never say tests pass unless you ran them. If you cannot run them,
say why.

Exceptions: comment-only changes, copy text, and documentation.

**In this repo** (Vitest):

- Tests sit next to the source as `*.test.ts`; shared helpers and fixtures are
  in `test/`. `test/helpers/supabase.ts` is a chainable `{ data, error }` stub
  (one array per table scripts successive `.from()` calls);
  `test/helpers/request.ts` builds a `NextRequest`.
- `test/setup.ts` pins `TZ=Asia/Bangkok` (date-fns callers read local date
  parts), sets `CRON_SECRET` (`cron-auth.ts` throws at module load without it)
  and leaves `REDIS_URL` unset (in-memory rate limiter). Billing tests must not
  rely on the TZ pin: fix the instant (`vi.setSystemTime`) and expect the same
  result under any TZ.
- DOM tests opt in with a `// @vitest-environment happy-dom` docblock.
- Coverage is reported, never enforced (thresholds commented out), and covers
  only `src/lib/**` and `src/app/api/**`. Check the touched file's row in
  `coverage/lcov.info`, not the summary.
- `KNOWN GAP` comments mark tests that pin odd-looking behaviour on purpose.
  Read them before "fixing" the code.
- Prove a test bites: revert the fix, see it fail with the expected message,
  restore. Pin the exact input that failed, not a nearby one.
- Logic that is hard to test inside a route handler moves to its own module
  (see `src/app/api/cron/billing/dates.ts`).

### 4. Impact analysis

A change is "large" if it touches more than 3 files, or touches any of the
following:

- DB schema, migrations, RLS policies, DB functions or triggers
- Auth, middleware, session handling
- Shared types, or shared components/hooks/utils used in multiple places
- API routes or Server Actions called from multiple places
- `next.config.*`, environment variables, caching or revalidation

For large changes:

- Before editing, find every usage (grep) and summarize the impact for me to
  confirm.
- Check each of these where relevant:
  - Schema change: update `src/types/database.ts` to match (it is maintained by
    hand) and fix every resulting type error.
  - RLS: each role (anon, authenticated, owner, other) still sees and modifies
    only what it should.
  - Migrations: existing data is safe and there is a rollback path.
  - Caching: `revalidatePath` / `revalidateTag` and fetch caching are still
    correct.
  - Client/server boundary: no server-only code leaks into the client bundle.
  - Environments: behavior is consistent across local, preview, and production.
- At the end, summarize what you checked and what risk remains.

**In this repo:**

- Billing, billing dates and the booking path always count as large.
- Grep the logic, not just the symbol: copies drift. `blockingInvoiceFilter`
  had one in `dashboard-shell.tsx`; the free-plan expiry predicate had two in
  page components.
- `isHostBlocked` gates six booking routes and three public pages;
  `getPlanExpiryInfo` sits under it.
- `"use client"` files cannot import anything reaching `next/headers` or
  `ioredis`. `tsc` misses this; only a real build catches it.
- Caching: `unstable_cache` tags `booking-availability:<homestayId>` (60s) and
  `admin-stats` (300s) are invalidated from the booking routes with Next 16's
  `revalidateTag(tag, "max")`. `demand:<homestayId>` and `admin-demand` are
  never invalidated; their 60s TTL is the only freshness control. Nothing uses
  `revalidatePath`.
- The cron's dates rely on `vercel.json` running it at `0 0 * * *`. If a change
  only holds under the current config, say so.

### 5. Security

Any work touching auth, RLS, storage, user input, or secrets counts as a
"large" change, regardless of how many files it touches.

**Secrets and environment**

- `SUPABASE_SERVICE_ROLE_KEY` and all other secrets are server-side only. Files
  that use them must import `"server-only"` and must never be imported by a
  Client Component. **Not adopted yet** (`server-only` is not installed, and
  Vitest needs an alias for it first): meanwhile, never import such files from
  `"use client"` code. A build only catches it when the import chain reaches
  `next/headers` or `ioredis`.
- `NEXT_PUBLIC_*` variables may only hold values that are safe to expose
  (Supabase URL, anon key).
- Never log or return secrets, tokens, sessions, or passwords, including in
  error messages.
- Never read `.env*` files, and never hardcode secrets in code, tests, or seed
  data.

**Authentication and authorization**

- On the server, verify identity with `supabase.auth.getUser()`. Never trust
  `getSession()` for authorization, because it reads the cookie without
  verifying it.
- Middleware is never the only gate. Every Server Action, route handler, and
  data-access function must perform its own authorization check.
- Treat Server Actions as public HTTP endpoints: always authenticate and
  validate input.
- Never take `user_id`, role, or `host_id` (the tenant key here) from the
  client to make authorization decisions. Derive them from the server-side
  session.
- Never trust `user_metadata`, because users can edit it. Use `app_metadata`
  or a roles table (admins: `platform_admins`).

**RLS and database**

- Every new table must enable row level security in the same migration that
  creates it. Never defer this.
- Write separate policies per operation (select / insert / update / delete),
  specify `to authenticated` or `to anon` explicitly, and use
  `(select auth.uid())`.
- Views must set `security_invoker = true` (Postgres 15+), otherwise they
  bypass RLS.
- `security definer` functions must set their own `search_path` and must not
  live in a schema exposed through the API.
- Storage buckets are private by default and must have explicit policies.
- Never build SQL by string concatenation. Use the Supabase client, `rpc`, or
  parameterized queries.
- Select only the columns you need. Avoid `select *` for data sent to the
  client.
- In this repo, a new RPC for the API routes follows 066, 070 and 071:
  `SECURITY INVOKER`, service-role only, `REVOKE ALL ON FUNCTION … FROM PUBLIC,
  anon, authenticated;` then `GRANT EXECUTE … TO service_role;`. Name `anon`
  and `authenticated` too: revoking from `PUBLIC` leaves direct grants intact.

**Input and output**

- Validate every boundary with Zod (or the project's validation library):
  Server Actions, route handlers, webhooks, query params, form data. (zod 4 is
  installed; most existing routes still validate by hand. Convert one only
  when the task touches it.)
- Do not use `dangerouslySetInnerHTML` unless the content passes through a
  sanitizer (`sanitizeRichText` in `src/lib/sanitize.ts`), and tell me first.
- Redirects based on user-supplied URLs (e.g. a `next` param after login) must
  be restricted to internal paths.
- If the server fetches a user-supplied URL, enforce an allowlist (prevents
  SSRF).
- Return generic error messages to the client. Never expose stack traces or
  raw DB errors.
- Verify webhook signatures before processing anything.

**Sessions, cookies, headers**

- Auth cookies must be httpOnly, secure, and sameSite. Never store tokens in
  localStorage.
- Never set CORS to `*` on endpoints that use cookies.
- Do not weaken CSP or other security headers in `next.config.*` unless I ask.
- Endpoints prone to abuse (login, password reset, OTP, signup) need rate
  limiting (`createRateLimiter` in `src/lib/rate-limit.ts`). If none exists,
  tell me.

**Dependencies**

- Do not add new packages without asking me. If one is needed, give its name,
  the reason, and its maintenance status.
- Never hand-edit lockfiles.
- If an audit reports vulnerabilities, report them. Do not upgrade packages
  unasked.

**Security working rules**

- Never lower security to make a test or build pass (disabling RLS, swapping
  in the service role, skipping auth checks).
- If a test needs elevated privileges, use a dedicated test user or seed data,
  never real keys.
- If you find a vulnerability unrelated to the current task, report it
  immediately with a severity rating, but do not fix it outside the task scope.
- When changing RLS or auth, always add security tests: anon cannot read, user
  A cannot access user B's data, non-owners cannot update or delete.
- After any security-related change, summarize what you checked, who can
  access the data now, and what risk remains.

**Already in place in this repo**

- RLS filters rows, not columns: a host session may update only the `hosts`
  columns granted in migration 069. Writing a new `hosts` column from a
  `"use client"` page needs that grant, or the save fails with 42501.
- Billing columns (plan, term, wallet, overrides, status) are written only by
  API routes with the service-role client.
- `bookings` has no column limit yet: hosts can still update their own bookings
  directly. That hardening is pending.
- Turnstile (`src/lib/turnstile.ts`) and the rate limiter fail open on purpose:
  a Cloudflare or Redis outage must never block a booking.
- Security PINs and passwords are hashed with `bcryptjs`.

### 6. Before handing off

Give a short summary: files changed, why, tests run (with results), and
remaining risks. Say plainly what you did **not** change and why.

### Hard prohibitions

- Never edit a migration that has already been applied. Create a new one
  instead. You cannot see which are applied, so treat every committed one as
  applied; name the new file `NNN_description.sql` with the next unused number.
- Never disable RLS or write `using (true)` policies just to make a query work.
- Never run `supabase db reset`, `supabase db push`, or any command that affects
  a remote or production database unless I explicitly ask.
- Never hand-edit generated type files. Regenerate them. (`src/types/database.ts`
  is not generated any more: it is maintained by hand, with no gen script or
  CLI. Update it in the same change as the migration.)
- Never commit or push unless I explicitly ask.
- Never use `--no-verify` or force push.
- Never silence errors with `any`, `@ts-ignore`, or `eslint-disable` just to
  make things pass.

## UI/UX design engineering

The booking platform is live. UI work improves visual quality, UX,
accessibility and frontend consistency, and never rebuilds the app. The goal: a
premium, modern hospitality platform that keeps the reliability of the
production booking system.

### Role and skills

Work as a senior product design and engineering team: design director (visual
direction), UI/UX designer (usability, information architecture), design-system
engineer (tokens, reusable components), frontend engineer (production React),
motion designer (meaningful animation and interaction), accessibility
specialist.

Start every UI task with the `peaksnature-ui` skill. It picks the one
specialist a task needs (usually `impeccable`) and says which of their
instructions do not apply in this repo.

### Design philosophy

Nature Luxury / Modern Hospitality: premium but approachable; modern, elegant,
minimal; a warm natural palette; editorial typography; high-quality real nature
photography; generous whitespace; clear visual hierarchy; consistent spacing
and alignment; subtle, purposeful motion; an excellent mobile experience.

Avoid: generic AI-generated SaaS looks; excessive gradients, rounded cards,
shadows or glassmorphism; excessive animation; low-contrast text; black buttons
on light backgrounds as the default treatment; decoration that gets in the way
of use.

Proposed palette, a starting point only: Warm Ivory `#F5F1E8`, Sand `#D8C9AE`,
Sage `#8C9A78`, Forest `#495B49`, Charcoal `#39372F`. Reconcile it with the
existing brand tokens before applying any of it.

### Production constraints

- Never rebuild the booking platform. Never change business logic unless
  explicitly asked.
- Preserve: database schema, Supabase tables and relationships, Supabase auth,
  RLS policies, the booking workflow, payment verification, the PromptPay and
  bank-transfer flow, availability and hold (room-locking) logic, host and
  admin permissions, commission and pricing calculations, API contracts, tenant
  routing and multi-tenant behavior.
- Don't: replace Supabase or the booking engine, rewrite auth, change the
  database for a visual improvement, remove functionality, put mock data into
  production, copy a purchased template over the project, or install UI
  libraries a task doesn't need (new packages still need my approval).
- Keep visual components separate from business logic. Reuse existing
  components, hooks, APIs and data structures.

### Workflow

- **A. Discovery.** Before changing anything, inspect the project structure,
  Next.js and React versions, Tailwind setup, component library, global styles
  and tokens, routes and layouts, reusable components, booking components and
  their dependencies, the frontend/backend boundary, and the tests and build
  commands. Don't assume the architecture. No application code changes in this
  phase.
- **B. Audit.** Visual hierarchy, typography, color consistency, spacing,
  component consistency, responsive behavior, accessibility, navigation,
  booking usability, loading, empty and error states, interaction feedback.
  Use `/impeccable audit` and `/impeccable critique` where they fit. Rate each
  finding Critical / High / Medium / Low (Impeccable's P0–P3) and give the fix
  with its expected impact.
- **C. Design system.** Color tokens, type scale, spacing scale, radius,
  shadows, buttons, inputs, cards, navigation, modals, dropdowns, calendars,
  breakpoints, interaction states. Reuse existing components. Documented in
  `DESIGN.md`.
- **D. Implementation.** One page at a time: inspect the implementation,
  understand what it does, define the visual change, find reusable components,
  implement, keep behavior identical, test desktop and mobile, review the
  result. Never redesign the whole platform in one go.
- **E. QA.** Desktop, tablet and mobile layouts; keyboard navigation and focus
  states; accessibility; loading and error states; booking, payment, auth and
  tenant isolation still work. Run lint, typecheck, tests and a production
  build where available (see 3. Testing: never claim a test passed without
  running it).

### Motion

Animate only when it helps use or understanding. Short durations, natural
easing, subtle hover feedback; page transitions and scroll reveals only where
they carry meaning. No heavy parallax, no movement for its own sake, nothing
that delays booking, shifts layout or costs mobile performance. Always respect
`prefers-reduced-motion`.

### Per surface

Guest, host and admin share one design language, each at the density it needs.

- **Guest site:** high-quality photography, clear property information, an
  attractive booking experience, easy date selection, clear pricing, a simple
  checkout, trust and transparency.
- **Booking calendar:** clear availability, easy date navigation, works on
  phones, clear selected dates, visible pricing; keep the availability logic.
- **Checkout and payment:** minimal steps, a clear booking summary, transparent
  payment instructions, clear payment status, error prevention; keep the
  verification logic.
- **Host dashboard:** operational efficiency: booking, house and availability
  management, revenue visibility, clear navigation.
- **Admin:** analytics, booking performance, host management, revenue and
  commission reporting, operational monitoring.

### Execution

Work incrementally. Before changing files, explain the plan, the affected
components and the regression risks. After, list the modified files, the visual
improvements, the tests actually run, and what is still unresolved. If a change
could affect booking, payment, auth, the database or tenant isolation, stop and
get my explicit approval first.

**In this repo:**

- Design docs: `PRODUCT.md` and `DESIGN.md` at the root (Impeccable reads both;
  DESIGN.md tokens are normative), `docs/design-direction.md` (direction,
  proposed palette, and settled UI decisions: ask before changing one),
  `docs/ui-audit.md`, `docs/ui-improvement-roadmap.md`.
- Tokens are CSS-first in `src/app/globals.css` (`@theme inline`); there is no
  `tailwind.config`. The real palette is `brand` (#2F5D50) and `earth-*`.
  shadcn's `--primary` is still near-black, so a `<Button>` without a variant
  renders black.
- `motion` ignores the OS reduced-motion setting unless the tree is wrapped in
  `RespectReducedMotion` (`src/components/respect-reduced-motion.tsx`; today
  only `/[slug]` is). CSS keyframes need their own
  `@media (prefers-reduced-motion: reduce)` rule.
- Visual checks (no Playwright yet): `chrome --headless --screenshot` shows only
  the `100svh` hero, so drive Chrome over CDP at 375, 768 and 1280 px. Block
  `*/api/demand*` and stub `navigator.sendBeacon` (page views write demand
  events to whatever DB `.env.local` uses), set a `cookie_consent=declined`
  cookie, and never submit checkout step 2: it writes holds and a draft.
- The Impeccable hook (`.claude/settings.local.json`) runs its detector after
  every Edit/Write and at the end of a turn. `/impeccable hooks off` disables
  it.

## Project reference

### Layout

- Routes: `/` landing (60s ISR), `/[slug]` single-page booking, `/dashboard/*`
  host dashboard, `/admin/*` admin, `/api/*` route handlers. There are no
  Server Actions; some dashboard pages also write to Supabase from the browser
  (see the `hosts` grant above).
- `src/middleware.ts` guards `/dashboard` and `/admin` (host status cached in a
  cookie for 5 minutes); route handlers check auth themselves.
- Supabase clients: `src/lib/supabase/client.ts` (browser), and in
  `src/lib/supabase/server.ts` `createServerSupabaseClient()` (user session,
  RLS applies) and `createServiceRoleClient()` (bypasses RLS).
- `src/types/database.ts`: table shapes and enums like `BookingStatus`.
- i18n: `next-intl`, `messages/en.json` and `messages/th.json`,
  `src/i18n/request.ts`. Security headers (CSP, HSTS, X-Frame-Options):
  `next.config.ts`.
- Notifications (`src/lib/notifications.ts`): guests by Resend email; hosts by
  SMS (sms-kub.com) or LINE, 3 tries on the preferred channel, then email.
  Per-host LINE credentials are in `hosts`.

### Booking flow

1. Guest books on `/[slug]`; the booking is created `pending`.
2. Guest uploads a PromptPay slip; `/api/verify-slip` checks it with EasySlip.
3. If verified, the booking is confirmed, the host notified, the guest emailed.

### Host billing plans

`hosts.plan_type`: `free`, `commission` (per-booking cut from a prepaid wallet)
or `fixed_rate` (monthly, always billed upfront). Plan changes apply at once.

- **Fixed Rate is paid before it starts.** `POST /api/host/plan/switch` returns
  402 `PAYMENT_REQUIRED` with a quote and writes nothing.
  `POST /api/host/plan/activate` recomputes the amount server-side, verifies
  the slip with EasySlip, then `activate_fixed_rate_plan` writes the paid
  invoice and flips the plan in one transaction. An abandoned payment leaves
  nothing behind.
- `activate_fixed_rate_plan` (070) is the **only** writer of a Fixed Rate term
  and its invoice: `paid` for activation, renewal and admin Set Plan; `pending`
  for the cron's lapsed-term billing and legacy renewals. Never write the two
  in separate calls; a failure between them leaves an unbilled term.
- `fixedRateStartDate()` picks the start for every quote and charge (host
  switch, activation, admin Set Plan and its dialog). From Free or Commission,
  `computeImmediateFixedRateInvoice` (`src/lib/billing.ts`) prorates the rest
  of the month at the day rate, plus whole discounted months. A lapsed term
  restarts from the 1st. A running term renews like an activation and starts
  the day after it ends. `term_months = 1` means the cron bills month by month.
- The cron bills a lapsed term (ended or never set) **every day**: the whole
  current month, due the 5th if billed on the 1st, else five days out
  (`src/app/api/cron/billing/lapsed.ts`). A host still owing an invoice is
  skipped, so bills never stack.
- Nothing writes `plan_pending_*` any more. The cron's apply-pending section
  only drains old rows; don't delete it until they have aged out.
- To Commission: in place, wallet at least `LOW_WALLET_THRESHOLD` (฿300).
  Leaving Fixed Rate mid-term forfeits the rest, no refund (`forfeited_days` in
  the audit log). To Fixed Rate: wallet at least ฿0 (`WALLET_NEGATIVE`); Fixed
  Rate never collects a wallet debt.
- Platform payment routes (activate, wallet top-up, invoice pay) refuse
  everything they can **before** calling EasySlip, which flags a verified slip
  as a duplicate forever, so a later refusal strands a real transfer. Those are
  logged as `PLATFORM_PAYMENT_REJECTED` (with the transRef) for an admin to
  settle by hand.

### The billing calendar (Asia/Bangkok)

Every billing date is a **calendar day in Asia/Bangkok**, never a UTC day or
the server's or browser's local day. `src/lib/billing-dates.ts` is the only
source: `billingToday()` (today's Bangkok date as a Date at UTC midnight) and
`billingTodayStr()` (`YYYY-MM-DD`, for DATE columns).

- Never decide "today" with `new Date().toISOString().split("T")[0]` or
  `now.getUTC*()`. Vercel runs in UTC, so for the first seven hours of every
  Thai day they return yesterday (once: a ฿24 stub for 31 August billed to a
  host paying at 01:00 on 1 September). `toISOString()` is UTC in the browser
  too.
- Reading parts back from an anchor with `getUTC*()` is fine: anchors sit at
  UTC midnight carrying the Bangkok date. `computeImmediateFixedRateInvoice`
  and `cronBillingDates` do it on purpose.
- End dates include their day: a term is active on `fixed_rate_term_ends_at`
  (`>= today`); an invoice blocks from the day after `due_date`
  (`due_date.lt.today`); the last free day is `plan_free_expires_at` (Day 0
  active, grace Day +1 to +6, blocked from Day +7; `src/lib/plan-expiry.ts`).
- `plan_free_expires_at` is TIMESTAMPTZ written as a bare date (07:00 Bangkok).
  `getPlanExpiryInfo` compares Bangkok calendar days, so that is harmless; no
  migration needed.
- `billing-dates.ts` is import-free so client pages can use it; `@/lib/billing`
  (server only: `next/headers`, `ioredis`) re-exports it. Same pattern as
  `wallet-thresholds.ts`.
- The cron takes all its dates from one anchor via `cronBillingDates()`
  (`src/app/api/cron/billing/dates.ts`, unit-tested). The route has no tests,
  so date arithmetic belongs in that module.

### Environment variables

```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
EASYSLIP_API_KEY
RESEND_API_KEY, RESEND_FROM_EMAIL
SMS_KUB_API_KEY, SMS_KUB_SENDER
NEXT_PUBLIC_TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY
CRON_SECRET                  # Secures /api/cron/*. At least 32 chars (openssl rand -base64 32) or cron-auth.ts throws at load. /api/health/cron (admin) reports ok if the cron succeeded within 25h.
NEXT_PUBLIC_APP_URL          # Canonical URL for SEO, magic-link emails, notifications; per environment (prod https://peaksnature.com). NEXT_PUBLIC_SITE_URL is a legacy fallback.
REDIS_URL                    # Optional. Redis Cloud (rediss:// for TLS): TH→EN translation cache on /[slug] and the rate limiter. Unset: EN shows TH content, limiter is in-memory.
GOOGLE_GENERATIVE_AI_API_KEY # Gemini, read by @ai-sdk/google for the translation cache.
GOOGLE_SITE_VERIFICATION, BING_SITE_VERIFICATION  # Optional.
```
