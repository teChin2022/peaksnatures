/**
 * Ingest for anonymous demand events from the public /[slug] page.
 *
 * Contract: **204 on every path**, including malformed input and DB failure. A
 * beacon must never surface an error to the booking page. Modelled on
 * src/app/api/csp-report/route.ts, the repo's other fire-and-forget endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createRateLimiter } from "@/lib/rate-limit";
import { DEMAND_EVENT_TYPES, DEMAND_STEPS, DEMAND_DEVICES } from "@/lib/demand-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Named so it gets its own Redis bucket. Several older limiters omit `name` and
// collide on "default" — do not join them, this route is far chattier.
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000, name: "demand" });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const eventSchema = z.object({
  homestay_id: z.string().uuid(),
  session_id: z.string().min(1).max(64),
  event_type: z.enum(DEMAND_EVENT_TYPES as [string, ...string[]]),
  check_in: z.string().regex(DATE_RE).nullish(),
  check_out: z.string().regex(DATE_RE).nullish(),
  nights: z.number().int().min(0).max(365).nullish(),
  step: z.enum(DEMAND_STEPS as unknown as [string, ...string[]]).nullish(),
  device: z.enum(DEMAND_DEVICES as unknown as [string, ...string[]]).nullish(),
  locale: z.string().max(8).nullish(),
  data: z.record(z.string(), z.unknown()).nullish(),
});

const batchSchema = z.array(eventSchema).min(1).max(20);

export async function POST(req: NextRequest) {
  const limited = await limiter.check(req);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const supabase = createServiceRoleClient();
    // homestay_id is shape-checked but not existence-checked: the FK does that,
    // and a bad row just fails here inside the 204.
    const { error } = await supabase.from("demand_events").insert(
      parsed.data.map((e) => ({
        homestay_id: e.homestay_id,
        session_id: e.session_id,
        event_type: e.event_type,
        check_in: e.check_in ?? null,
        check_out: e.check_out ?? null,
        nights: e.nights ?? null,
        step: e.step ?? null,
        device: e.device ?? null,
        locale: e.locale ?? null,
        data: e.data ?? {},
      })) as never,
    );
    if (error) console.error("[Demand] insert failed:", error.message);
  } catch (error) {
    console.error("[Demand] ingest error:", error);
  }

  return new NextResponse(null, { status: 204 });
}
