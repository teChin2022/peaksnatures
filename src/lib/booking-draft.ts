/**
 * Booking drafts — the pure half of "resume an abandoned booking".
 *
 * A guest reaches step 3, switches to their banking app, and never returns to
 * the tab. `POST /api/bookings/draft` snapshots the form at the step 2 -> 3
 * transition; `POST /api/bookings/draft/lookup` hands it back on phone + email.
 *
 * Everything here is pure and side-effect free so it can be unit tested without
 * mocking Supabase, and so a `"use client"` component and an API route can both
 * import it. Keep it that way: the only imports allowed are **types**, which
 * erase at compile time. Anything reaching `next/headers` or `ioredis` here
 * would break the client build, and `tsc --noEmit` will not tell you.
 */

import type { Room, RoomOption, RoomGuestPricing } from "@/types/database";

/**
 * One house in a saved cart. Mirrors `CartLine` from the booking cart context
 * but is declared here on purpose — an API route must not reach into a
 * `"use client"` module, even for a type. `lineId` is deliberately absent: it
 * is a React render key, regenerated on restore.
 */
export interface DraftLine {
  room_id: string;
  num_guests: number;
  tier_ids: string[];
  option_ids: string[];
}

/**
 * The schemaless half of a draft row. Versioned by `v` so a shape change can be
 * detected rather than guessed at.
 *
 * The guest's email is NOT here — it is a column, because it is half the lookup
 * key.
 */
export interface BookingDraftPayload {
  v: 1;
  guest: { name: string; province: string; note: string };
  lines: DraftLine[];
  /**
   * The promo CODE only, never the resolved discount. A code can expire, be
   * deactivated or hit MAX_USES between save and restore, so it is re-validated
   * through /api/promos/validate rather than trusted.
   */
  promo_code: string | null;
  payment_option: "full" | "deposit";
  /**
   * The cart subtotal when the draft was saved. Used ONLY to detect that prices
   * moved and warn the guest before they look at a QR for a different amount.
   * Never feed this into a calculation: `computeLineGross` recomputes from the
   * catalog on every render and `POST /api/bookings` re-derives `total_price`
   * server-side, so a stored price is a lie waiting to be reconciled.
   */
  subtotal_at_save: number;
  locale: string;
}

/** Exactly what the lookup route returns on a hit. */
export interface BookingDraftResponse {
  found: true;
  check_in: string;
  check_out: string;
  guest: { name: string; email: string; province: string; note: string };
  lines: DraftLine[];
  promo_code: string | null;
  payment_option: "full" | "deposit";
  subtotal_at_save: number;
  saved_at: string;
}

/**
 * What the resume dialog hands to the booking form on the `resume-draft` event.
 *
 * The phone is added client-side: the lookup response deliberately does not echo
 * it back (nothing is gained by making the response a richer scraping target),
 * but the form needs it — `handleProceedToPayment` sends it to the hold API, and
 * migration 049's same-phone takeover is what lets a returning guest reclaim
 * their own abandoned hold.
 */
export type ResumeDraftDetail = BookingDraftResponse & { phone: string };

/**
 * Digits-only, max 10 — byte-identical to `sanitizePhoneInput` in
 * `src/lib/utils.ts`.
 *
 * This is not duplication for its own sake: `utils.ts` is the client input
 * sanitiser and this is the storage rule, and they must agree exactly or
 * migration 049's same-phone hold takeover stops firing on restore (it matches
 * `booking_holds.guest_phone` with `=`, not a pattern). `booking-draft.ts`
 * cannot import `utils.ts` without dragging `clsx` and `tailwind-merge` into
 * every API route that touches a draft. The equality is pinned by a test.
 */
export function normalizeDraftPhone(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

/** Trimmed + lowercased, matching the comparison in pay-balance and checkin. */
export function normalizeDraftEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** A phone is storable only in the exact shape the CHECK constraint accepts. */
export function isStorableDraftPhone(value: string): boolean {
  return /^\d{10}$/.test(value);
}

/**
 * The `expires_at` stamp, from the host's `booking_draft_hours`.
 *
 * Stamped at write time rather than joined at read or purge time so that the
 * lookup filter and the sweep predicate are the same predicate — "invisible"
 * and "deleted" can then never disagree about which rows are live.
 */
export function draftExpiresAt(retentionHours: number, now: Date): string {
  return new Date(now.getTime() + retentionHours * 3_600_000).toISOString();
}

export interface ReconcileContext {
  rooms: Room[];
  roomOptions: RoomOption[];
  guestPricing: RoomGuestPricing[];
  /**
   * Injected, never reimplemented. The cart context already owns this rule
   * (blocked dates + `getFullyBookedForRoom`); a second copy here is exactly
   * the kind of inlined duplicate that drifts silently.
   */
  isRoomAvailableForRange: (room: Room) => boolean;
  /** Today as YYYY-MM-DD on the Bangkok calendar. */
  todayStr: string;
}

export interface ReconcileResult {
  lines: DraftLine[];
  /** Names of houses we dropped and could still identify. */
  droppedRoomNames: string[];
  /** Total dropped, including houses no longer in the catalog at all. */
  droppedCount: number;
  reason: null | "past_dates" | "no_rooms";
}

/**
 * Reconcile a saved cart against the live catalog before restoring it.
 *
 * Prices are deliberately NOT checked: `computeLineGross` recomputes from the
 * catalog every render and `POST /api/bookings` re-derives `total_price`
 * server-side, so price drift is self-healing. Only existence and availability
 * matter here.
 */
export function reconcileDraftWithCatalog(
  draft: Pick<BookingDraftResponse, "check_in" | "lines">,
  ctx: ReconcileContext,
): ReconcileResult {
  // Non-negotiable, and the one check with teeth: neither acquire_booking_hold
  // nor create_booking_atomic guards against a past check-in — only the client
  // calendar does — so a stale draft would otherwise book a night that has
  // already gone.
  if (draft.check_in < ctx.todayStr) {
    return { lines: [], droppedRoomNames: [], droppedCount: draft.lines.length, reason: "past_dates" };
  }

  const roomsById = new Map(ctx.rooms.map((r) => [r.id, r]));
  // The catalog is already filtered to active rows (see [slug]/page.tsx), so
  // presence in these sets is the whole check.
  const optionRooms = new Map(ctx.roomOptions.map((o) => [o.id, o.room_id]));
  const tierRooms = new Map(ctx.guestPricing.map((g) => [g.id, g.room_id]));

  const kept: DraftLine[] = [];
  const droppedRoomNames: string[] = [];
  const usedPerRoom = new Map<string, number>();
  let droppedCount = 0;

  for (const line of draft.lines) {
    const room = roomsById.get(line.room_id);
    // Deleted or deactivated — [slug]/page.tsx builds the catalog from
    // activeRooms, so this single lookup covers both.
    if (!room) {
      droppedCount++;
      continue;
    }
    if (!ctx.isRoomAvailableForRange(room)) {
      droppedCount++;
      droppedRoomNames.push(room.name);
      continue;
    }
    // The house may still exist but have fewer units than when they saved.
    const used = usedPerRoom.get(room.id) ?? 0;
    if (used >= Math.max(1, room.quantity || 1)) {
      droppedCount++;
      droppedRoomNames.push(room.name);
      continue;
    }
    usedPerRoom.set(room.id, used + 1);

    kept.push({
      room_id: line.room_id,
      // Clamped rather than dropped: friendlier, and pricing is re-derived
      // anyway. This is the only guard — /api/bookings validates num_guests as
      // z.number().int().min(1) with no upper bound.
      num_guests: Math.min(Math.max(1, line.num_guests || 1), Math.max(1, room.max_guests || 1)),
      // An add-on or tier must still exist AND still belong to this house.
      // Strip the stale id, keep the line: losing a breakfast add-on is not a
      // reason to make someone re-pick their house.
      tier_ids: line.tier_ids.filter((id) => tierRooms.get(id) === line.room_id),
      option_ids: line.option_ids.filter((id) => optionRooms.get(id) === line.room_id),
    });
  }

  return {
    lines: kept,
    droppedRoomNames,
    droppedCount,
    reason: kept.length === 0 ? "no_rooms" : null,
  };
}
