import { createServiceRoleClient } from "@/lib/supabase/server";
import { STALE_DATE_CHANGE_DAYS } from "../../attention";

export const DATE_CHANGE_LIMIT = 100;

export interface PendingDateChange {
  id: string;
  created_at: string;
  old_check_in: string;
  old_check_out: string;
  new_check_in: string;
  new_check_out: string;
  price_difference: number;
  guest_name: string | null;
  homestay_name: string | null;
  host_id: string | null;
  /** Only the host can answer, so the admin's nudge goes to them. */
  host_name: string | null;
  host_phone: string | null;
  stale: boolean;
}

const staleCutoff = (now: Date) => new Date(now.getTime() - STALE_DATE_CHANGE_DAYS * 86_400_000).toISOString();

/** Guest date-change requests no host has answered yet, oldest first. Caller must have checked isAdmin. */
export async function getPendingDateChanges(now: Date = new Date()): Promise<PendingDateChange[]> {
  const { data } = await createServiceRoleClient()
    .from("date_change_requests")
    .select(
      "id, created_at, old_check_in, old_check_out, new_check_in, new_check_out, price_difference, booking:bookings(guest_name, homestay:homestays(name, host_id, host:hosts(name, phone)))",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(DATE_CHANGE_LIMIT);

  const cutoff = staleCutoff(now);
  type Row = Omit<PendingDateChange, "guest_name" | "homestay_name" | "host_id" | "host_name" | "host_phone" | "stale"> & {
    booking: {
      guest_name: string;
      homestay: { name: string; host_id: string; host: { name: string; phone: string | null } | null } | null;
    } | null;
  };
  return ((data ?? []) as Row[]).map(({ booking, ...r }) => ({
    ...r,
    guest_name: booking?.guest_name ?? null,
    homestay_name: booking?.homestay?.name ?? null,
    host_id: booking?.homestay?.host_id ?? null,
    host_name: booking?.homestay?.host?.name ?? null,
    host_phone: booking?.homestay?.host?.phone ?? null,
    stale: r.created_at < cutoff,
  }));
}

/** Pending requests older than STALE_DATE_CHANGE_DAYS, for the overview. */
export async function countStaleDateChanges(now: Date = new Date()): Promise<number> {
  const { count } = await createServiceRoleClient()
    .from("date_change_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lt("created_at", staleCutoff(now));
  return count ?? 0;
}
