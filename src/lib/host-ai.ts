import { z } from "zod";
import type { HostAiStatus } from "@/types/database";

/**
 * The guest AI assistant's request and settings rules (migration 084), shared
 * by /api/host/ai-admin and the admin routes. Import-free apart from zod so a
 * client page can reuse the limits.
 */

export const AI_INSTRUCTIONS_MAX = 2000;
export const AI_REPLY_CAP_MAX = 1000;

/** The columns a page may show. Every route selects exactly these. */
export const HOST_AI_COLUMNS =
  "host_id, status, requested_at, decided_at, enabled, can_answer, can_set_dates, can_suggest_houses, can_navigate, instructions, daily_reply_cap";

/**
 * What a host may change, and only that (security review F-04): `.strict()`
 * refuses status, decided_*, daily_reply_cap or any other key.
 */
export const hostAiSettingsSchema = z
  .object({
    enabled: z.boolean(),
    can_answer: z.boolean(),
    can_set_dates: z.boolean(),
    can_suggest_houses: z.boolean(),
    can_navigate: z.boolean(),
    instructions: z.string().trim().max(AI_INSTRUCTIONS_MAX).nullable(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0);

export const ADMIN_AI_ACTIONS = ["approve", "reject", "suspend", "resume"] as const;
export type AdminAiAction = (typeof ADMIN_AI_ACTIONS)[number];

export const adminAiDecisionSchema = z
  .object({
    action: z.enum(ADMIN_AI_ACTIONS).optional(),
    daily_reply_cap: z.number().int().min(0).max(AI_REPLY_CAP_MAX).optional(),
  })
  .strict()
  .refine((v) => v.action !== undefined || v.daily_reply_cap !== undefined);

/** Which statuses each admin action may start from, and where it leads. */
const TRANSITIONS: Record<AdminAiAction, { from: HostAiStatus[]; to: HostAiStatus }> = {
  approve: { from: ["requested", "rejected"], to: "approved" },
  reject: { from: ["requested"], to: "rejected" },
  suspend: { from: ["approved"], to: "suspended" },
  resume: { from: ["suspended"], to: "approved" },
};

/** The status an admin action leads to from `current`, or null when it does not apply. */
export function nextAiStatus(action: AdminAiAction, current: HostAiStatus): HostAiStatus | null {
  const t = TRANSITIONS[action];
  return t.from.includes(current) ? t.to : null;
}

/**
 * Whether a host may (re)send a request: never asked, or rejected before.
 * A suspended host waits for an admin to resume.
 */
export function canRequestAi(current: HostAiStatus | null): boolean {
  return current === null || current === "rejected";
}
