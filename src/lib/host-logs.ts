import type { createServiceRoleClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/** Where a host's events sit in history_logs. Admin host detail and the Logs host filter share it. */
export interface HostLogScope {
  entityIds: string[];
  homestayIds: string[];
}

/** Host events are keyed by host id, auth user id, login email or invoice id; homestay events carry homestay_id. */
export function hostLogScope(
  host: { id: string; user_id: string; email: string },
  invoiceIds: string[],
  homestayIds: string[],
): HostLogScope {
  return { entityIds: [host.id, host.user_id, host.email, ...invoiceIds], homestayIds };
}

export interface HostLogQuery {
  limit: number;
  /** Only rows older than this created_at (the Logs page's cursor). */
  before?: string | null;
  eventType?: string | null;
  entityType?: string | null;
  actorType?: string | null;
}

/**
 * The newest `limit` of a host's logs, newest first. Two indexed reads merged by id,
 * rather than an OR across two columns built as a filter string.
 */
export async function fetchHostLogs<T extends { id: string; created_at: string }>(
  sc: ServiceClient,
  scope: HostLogScope,
  columns: string,
  q: HostLogQuery,
): Promise<{ rows: T[]; error: unknown }> {
  const read = () => {
    let query = sc.from("history_logs").select(columns).order("created_at", { ascending: false }).limit(q.limit);
    if (q.before) query = query.lt("created_at", q.before);
    if (q.eventType) query = query.eq("event_type", q.eventType);
    if (q.entityType) query = query.eq("entity_type", q.entityType);
    if (q.actorType) query = query.eq("actor_type", q.actorType);
    return query;
  };
  const [byEntity, byHomestay] = await Promise.all([
    read().in("entity_id", scope.entityIds),
    scope.homestayIds.length ? read().in("homestay_id", scope.homestayIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const error = byEntity.error ?? byHomestay.error;
  if (error) return { rows: [], error };

  const byId = new Map<string, T>();
  for (const row of [...((byEntity.data ?? []) as unknown as T[]), ...((byHomestay.data ?? []) as unknown as T[])]) {
    byId.set(row.id, row);
  }
  const rows = [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, q.limit);
  return { rows, error: null };
}
