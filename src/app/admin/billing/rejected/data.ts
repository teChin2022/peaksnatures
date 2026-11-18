import { createServiceRoleClient } from "@/lib/supabase/server";
import { EventType } from "@/lib/history-log";

export const REJECTED_LIMIT = 100;

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
}

interface LogData {
  reason?: string;
  host_id?: string;
  expected_amount?: number;
  slip_amount?: number;
  term_months?: number;
  trans_ref?: string | null;
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
    };
  });
}
