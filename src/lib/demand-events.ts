/**
 * Catalog of the anonymous guest events recorded on the public /[slug] page.
 *
 * Single source of truth for three consumers that must never drift: the client
 * tracker (src/lib/demand-track.ts), the ingest route's zod schema
 * (src/app/api/demand/route.ts) and the dashboard aggregator
 * (src/lib/demand-stats.ts). Mirrors the EventType pattern in
 * src/lib/history-log.ts.
 *
 * Adding a value here also needs the matching CHECK constraint updated in
 * supabase/migrations/065_demand_events.sql.
 */
export const DemandEvent = {
  PAGE_VIEW: "page_view",
  CALENDAR_VIEW: "calendar_view",
  DATES_SELECTED: "dates_selected",
  DATES_UNAVAILABLE: "dates_unavailable",
  CHECKOUT_STEP: "checkout_step",
  SLIP_UPLOADED: "slip_uploaded",
  BOOKING_SUBMITTED: "booking_submitted",
} as const;

export type DemandEventType = (typeof DemandEvent)[keyof typeof DemandEvent];

export const DEMAND_EVENT_TYPES = Object.values(DemandEvent) as DemandEventType[];

/**
 * checkout_step values. Recorded when the guest advances OUT of a step, not on
 * arrival — see the note on demand_events.step in the migration.
 */
export const DEMAND_STEPS = ["dates", "details", "payment"] as const;
export type DemandStep = (typeof DEMAND_STEPS)[number];

export const DEMAND_DEVICES = ["mobile", "desktop"] as const;
export type DemandDevice = (typeof DEMAND_DEVICES)[number];

/**
 * The funnel, in order. `checkout_step` fans out into three stages, and
 * `dates_unavailable` is deliberately absent — it is a side metric (lost
 * demand), not a stage guests pass through.
 */
export const DEMAND_STAGES = [
  "page_view",
  "calendar_view",
  "dates_selected",
  "step_dates",
  "step_details",
  "step_payment",
  "slip_uploaded",
  "booking_submitted",
] as const;

export type DemandStage = (typeof DEMAND_STAGES)[number];
