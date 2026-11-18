import { createServiceRoleClient } from "@/lib/supabase/server";
import { EventType } from "@/lib/history-log";

export const REJECTED_LIMIT = 100;
const SLIP_URL_SECONDS = 600;
// The three refusing routes upload here; never sign a path outside them.
const SLIP_PREFIXES = ["wallet/", "plan-activation/", "invoices/"];

export type RejectedKind = "invoice" | "plan_activation" | "wallet_topup";

export interface RejectedPayment {
  id: string;
  created_at: string;
  kind: RejectedKind;
  host_id: string | null;
  host_name: string | null;
  expected_amount: number | null;
  slip_amount: number | null;
  trans_ref: string | null;
  reason: string | null;
  /** Short-lived link to the transfer slip in the private payment-slips bucket. */
  slip_url: string | null;
  /** Set once an admin marked it settled (082). */
  settlement: { settled_at: string; settled_by_name: string; note: string | null } | null;
}

interface LogData {
  reason?: string;
  host_id?: string;
  expected_amount?: number;
  slip_amount?: number;
  term_months?: number;
  trans_ref?: string | null;
  slip_path?: string;
}

/**
 * Which route refused it. Invoice payments log the invoice id as entity_id;
 * plan activations carry term_months; wallet top-ups log the host id alone.
 */
export function rejectedKind(entityId: string, data: LogData): RejectedKind {
  if (data.host_id && entityId !== data.host_id) return "invoice";
  if (data.term_months != null) return "plan_activation";
  return "wallet_topup";
}

/** Verified transfers the platform then refused, newest first. Caller must have checked isAdmin. */
export async function getRejectedPayments(): Promise<RejectedPayment[]> {
  const sc = createServiceRoleClient();
  const { data: logs } = await sc
    .from("history_logs")
    .select("id, entity_id, data, created_at")
    .eq("event_type", EventType.PLATFORM_PAYMENT_REJECTED)
    .order("created_at", { ascending: false })
    .limit(REJECTED_LIMIT);
  const rows = (logs ?? []) as { id: string; entity_id: string; data: LogData | null; created_at: string }[];

  const hostIds = [...new Set(rows.map((r) => r.data?.host_id).filter((v): v is string => !!v))];
  const { data: hosts } = hostIds.length
    ? await sc.from("hosts").select("id, name").in("id", hostIds)
    : { data: [] };
  const names = new Map(((hosts ?? []) as { id: string; name: string }[]).map((h) => [h.id, h.name]));
  const settled = await settlementsFor(rows.map((r) => r.id));

  const slipPaths = rows
    .map((r) => r.data?.slip_path)
    .filter((p): p is string => !!p && SLIP_PREFIXES.some((prefix) => p.startsWith(prefix)) && !p.includes(".."));
  const slipUrls = new Map<string, string>();
  if (slipPaths.length > 0) {
    const { data: signed } = await sc.storage.from("payment-slips").createSignedUrls(slipPaths, SLIP_URL_SECONDS);
    slipPaths.forEach((path, i) => {
      const url = signed?.[i]?.signedUrl;
      if (url) slipUrls.set(path, url);
    });
  }

  return rows.map((r) => {
    const d = r.data ?? {};
    return {
      id: r.id,
      created_at: r.created_at,
      kind: rejectedKind(r.entity_id, d),
      host_id: d.host_id ?? null,
      host_name: d.host_id ? (names.get(d.host_id) ?? null) : null,
      expected_amount: d.expected_amount ?? null,
      slip_amount: d.slip_amount ?? null,
      trans_ref: d.trans_ref ?? null,
      reason: d.reason ?? null,
      slip_url: d.slip_path ? (slipUrls.get(d.slip_path) ?? null) : null,
      settlement: settled.get(r.id) ?? null,
    };
  });
}

type Settlement = NonNullable<RejectedPayment["settlement"]>;

async function settlementsFor(logIds: string[]): Promise<Map<string, Settlement>> {
  if (logIds.length === 0) return new Map();
  const { data } = await createServiceRoleClient()
    .from("platform_payment_settlements")
    .select("history_log_id, settled_by_name, note, created_at")
    .in("history_log_id", logIds);
  const rows = (data ?? []) as { history_log_id: string; settled_by_name: string; note: string | null; created_at: string }[];
  return new Map(
    rows.map((s) => [s.history_log_id, { settled_at: s.created_at, settled_by_name: s.settled_by_name, note: s.note }]),
  );
}

/** Rejected payments since `sinceIso` that no admin has marked settled yet, for the overview. */
export async function countUnsettledRejected(sinceIso: string): Promise<number> {
  const { data } = await createServiceRoleClient()
    .from("history_logs")
    .select("id")
    .eq("event_type", EventType.PLATFORM_PAYMENT_REJECTED)
    .gte("created_at", sinceIso)
    .limit(REJECTED_LIMIT);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  const settled = await settlementsFor(ids);
  return ids.filter((id) => !settled.has(id)).length;
}
