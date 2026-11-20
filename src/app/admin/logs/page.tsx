"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScrollText, Loader2, Filter, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { LoadError, NETWORK_ERROR, actionFailed } from "@/components/admin/load-error";
import { PHONE_TAP, TABLE, TABLE_CARD, TABLE_WRAP, TBODY, TD, TD_LEAD, TD_TRAIL, TH, TH_ROW, TR } from "@/components/admin/table-classes";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format-date";
import { toast } from "sonner";
import { EventType, eventLabel, fieldLabel } from "@/lib/history-event-types";

interface LogRow {
  id: string;
  entity_type: string;
  event_type: string;
  actor_type: string;
  entity_label: string;
  entity_context: string | null;
  actor_label: string;
  data: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

interface LogsResponse {
  data: LogRow[];
  hasMore: boolean;
  nextCursor: string | null;
}

// Every event the server can write, so billing, staff and payment events are filterable too.
const EVENT_TYPE_OPTIONS = Object.values(EventType);

const ENTITY_TYPE_OPTIONS = ["booking", "booking_hold", "homestay", "room", "host", "review", "blocked_date", "seasonal_price", "billing", "admin", "system"];

const ACTOR_TYPE_OPTIONS = ["guest", "host", "admin", "system"];

type EventTone = "brand" | "earth" | "amber" | "destructive" | "muted";

const POSITIVE_EVENTS = new Set([
  "BOOKING_CREATED", "BOOKING_CONFIRMED", "BALANCE_PAID",
  "HOST_APPROVED", "BOOKING_DATE_CHANGE_APPROVED",
]);
const NEGATIVE_EVENTS = new Set([
  "BOOKING_CANCELLED", "BOOKING_REJECTED", "HOST_REJECTED",
  "FAILED_LOGIN", "ROOM_DELETED", "BOOKING_DATE_CHANGE_REJECTED",
  "PLATFORM_PAYMENT_REJECTED", "BILLING_RETRY_EXHAUSTED", "ADMIN_ACCESS_DENIED",
]);
const WARNING_EVENTS = new Set([
  "PROPERTY_TOGGLED", "BLOCKED_DATE_ADDED", "BLOCKED_DATE_REMOVED",
  "BOOKING_DATE_CHANGE_REQUESTED", "PASSWORD_CHANGED", "HOST_REGISTERED",
  "INVOICE_OVERDUE", "WALLET_LOW_BALANCE", "BILLING_CONFIG_UPDATED",
]);
const MUTED_EVENTS = new Set(["HOST_LOGOUT"]);

function getEventTone(eventType: string): EventTone {
  if (POSITIVE_EVENTS.has(eventType)) return "brand";
  if (NEGATIVE_EVENTS.has(eventType)) return "destructive";
  if (WARNING_EVENTS.has(eventType)) return "amber";
  if (MUTED_EVENTS.has(eventType)) return "muted";
  return "earth";
}

const ACTOR_TONES: Record<string, EventTone> = {
  guest:  "earth",
  host:   "brand",
  admin:  "earth",
  system: "muted",
};

/** Field borders are earth-500 app-wide (2026-11-16); 44px and 16px text on phones (no iOS zoom). */
const FILTER_SELECT =
  "h-11 w-full cursor-pointer rounded-md border border-earth-500 bg-white px-3 text-base text-earth-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand md:h-9 md:text-sm";

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogRow | null>(null);

  // Overview's "Needs attention" links here with ?event_type=…
  const searchParams = useSearchParams();
  const router = useRouter();
  const [eventType, setEventType] = useState(searchParams.get("event_type") ?? "");
  const [entityType, setEntityType] = useState(searchParams.get("entity_type") ?? "");
  const [actorType, setActorType] = useState(searchParams.get("actor_type") ?? "");

  const fetchLogs = useCallback(async (cursor: string | null, append: boolean, filters: { eventType: string; entityType: string; actorType: string }) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (cursor) params.set("before", cursor);
      if (filters.eventType) params.set("event_type", filters.eventType);
      if (filters.entityType) params.set("entity_type", filters.entityType);
      if (filters.actorType) params.set("actor_type", filters.actorType);

      const r = await fetch(`/api/admin/logs?${params}`);
      if (r.ok) {
        const res: LogsResponse = await r.json();
        setLogs((prev) => append ? [...prev, ...res.data] : res.data);
        setHasMore(res.hasMore);
        setNextCursor(res.nextCursor);
      }
      // A failed "Load More" keeps the rows already shown; only a first load swaps in the error.
      if (append) { if (!r.ok) toast.error(actionFailed("load more logs")); } else setLoadFailed(!r.ok);
    } catch {
      if (append) toast.error(NETWORK_ERROR); else setLoadFailed(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(null, false, { eventType, entityType, actorType });
    // Keep the URL in step, so a reload after clearing does not bring a filter back.
    const qs = new URLSearchParams(
      Object.entries({ event_type: eventType, entity_type: entityType, actor_type: actorType }).filter(([, v]) => v),
    ).toString();
    router.replace(qs ? `/admin/logs?${qs}` : "/admin/logs", { scroll: false });
  }, [fetchLogs, router, eventType, entityType, actorType]);

  const handleLoadMore = () => {
    fetchLogs(nextCursor, true, { eventType, entityType, actorType });
  };

  const handleClearFilters = () => {
    setEventType("");
    setEntityType("");
    setActorType("");
  };

  const hasActiveFilters = eventType || entityType || actorType;

  const formatDate = (iso: string) => fmtDate(new Date(iso), "MMM d, yyyy · HH:mm", "en");

  const renderDataSummary = (data: Record<string, unknown>) => {
    const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== "");
    if (entries.length === 0) return null;
    const shown = entries.slice(0, 4);
    return (
      <div className="mt-1.5 flex flex-wrap gap-1">
        {shown.map(([k, v]) => (
          <span key={k} className="inline-flex items-center rounded bg-earth-50 px-1.5 py-0.5 text-xs text-earth-600">
            <span className="font-medium text-earth-700 mr-0.5" title={k}>{fieldLabel(k)}:</span>
            {typeof v === "object" ? JSON.stringify(v).slice(0, 40) : String(v).slice(0, 40)}
          </span>
        ))}
        {entries.length > 4 && (
          <span className="text-xs text-earth-600">+{entries.length - 4} more</span>
        )}
      </div>
    );
  };

  const renderDataDetail = (data: Record<string, unknown>) => {
    const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== "");
    if (entries.length === 0) return <p className="text-sm text-earth-600">No metadata.</p>;
    return (
      <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1.5 text-sm">
        {entries.map(([k, v]) => (
          <Fragment key={k}>
            <dt className="text-xs text-earth-600 pt-0.5 break-words" title={k}>{fieldLabel(k)}</dt>
            <dd className="text-earth-800 break-words whitespace-pre-wrap">
              {typeof v === "object" ? JSON.stringify(v, null, 2) : String(v)}
            </dd>
          </Fragment>
        ))}
      </dl>
    );
  };

  return (
    <div>
      <PageHeader
        subtitle="Activity audit trail"
        title="History Logs"
        icon={ScrollText}
        actions={
          <Button
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            className={cn(
              "cursor-pointer",
              PHONE_TAP,
              showFilters
                ? "bg-brand hover:bg-brand-hover text-white"
                : "bg-white border border-earth-200 text-earth-700 hover:bg-earth-50 hover:text-brand"
            )}
          >
            <Filter className="h-4 w-4 mr-1.5" />
            Filters
            {hasActiveFilters && (
              <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-xs text-brand font-bold">
                {[eventType, entityType, actorType].filter(Boolean).length}
              </span>
            )}
          </Button>
        }
      />

      {showFilters && (
        <Card className="mb-4 border-earth-100">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="log-filter-event" className="text-xs font-medium text-earth-700 mb-1 block">Event Type</label>
                <select
                  id="log-filter-event"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className={FILTER_SELECT}
                >
                  <option value="">All events</option>
                  {EVENT_TYPE_OPTIONS.map((e) => (
                    <option key={e} value={e}>{eventLabel(e)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="log-filter-entity" className="text-xs font-medium text-earth-700 mb-1 block">Entity Type</label>
                <select
                  id="log-filter-entity"
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  className={FILTER_SELECT}
                >
                  <option value="">All entities</option>
                  {ENTITY_TYPE_OPTIONS.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="log-filter-actor" className="text-xs font-medium text-earth-700 mb-1 block">Actor Type</label>
                <select
                  id="log-filter-actor"
                  value={actorType}
                  onChange={(e) => setActorType(e.target.value)}
                  className={FILTER_SELECT}
                >
                  <option value="">All actors</option>
                  {ACTOR_TYPE_OPTIONS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            </div>
            {hasActiveFilters && (
              <div className="mt-3 flex justify-end">
                <Button variant="ghost" size="sm" onClick={handleClearFilters} className={cn("text-xs cursor-pointer text-earth-600 hover:text-brand", PHONE_TAP)}>
                  Clear all filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* With the panel closed (e.g. arriving from an Overview link), still say what is filtered. */}
      {!showFilters && hasActiveFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
          {[
            { name: "Event", value: eventType, shown: eventLabel(eventType), clear: () => setEventType("") },
            { name: "Entity", value: entityType, shown: entityType, clear: () => setEntityType("") },
            { name: "Actor", value: actorType, shown: actorType, clear: () => setActorType("") },
          ]
            .filter((f) => f.value)
            .map((f) => (
              <span
                key={f.name}
                className="inline-flex items-center gap-1 rounded-full border border-earth-200 bg-white py-1 pl-3 pr-1 text-xs text-earth-800"
              >
                <span className="text-earth-600">{f.name}:</span>
                <span>{f.shown}</span>
                <button
                  type="button"
                  onClick={f.clear}
                  aria-label={`Remove ${f.name.toLowerCase()} filter`}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-full text-earth-600 hover:bg-earth-50 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand max-md:size-9"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton-warm h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : loadFailed ? (
        <LoadError what="logs" onRetry={() => fetchLogs(null, false, { eventType, entityType, actorType })} />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No logs found"
          description={hasActiveFilters ? "Nothing matches these filters." : "Platform activity will be recorded here as it happens."}
          action={
            hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={handleClearFilters} className="cursor-pointer">
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Rows on phones, a table from md (owner, 2026-11-20); one markup for both. */}
          <Card className={TABLE_CARD}>
            <CardContent className="p-0">
              <div className={TABLE_WRAP}>
                <table className={cn(TABLE, "md:min-w-[680px]")}>
                  <thead>
                    <tr className={TH_ROW}>
                      <th scope="col" className={TH}>Time</th>
                      <th scope="col" className={TH}>Event</th>
                      <th scope="col" className={TH}>Subject</th>
                      <th scope="col" className={cn(TH, "hidden lg:table-cell")}>By</th>
                      <th scope="col" className={TH}>Details</th>
                    </tr>
                  </thead>
                  <tbody className={TBODY}>
                    {logs.map((log) => (
                      // Row click is a mouse shortcut; the Event button is the keyboard path.
                      <tr
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        className={cn(TR, "cursor-pointer hover:bg-earth-50/60")}
                      >
                        <td className={cn(TD_TRAIL, "whitespace-nowrap text-xs tabular-nums text-earth-600")}>
                          {formatDate(log.created_at)}
                        </td>
                        <td className={TD_LEAD}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                            }}
                            aria-label={`Details for ${eventLabel(log.event_type)}`}
                            className="flex cursor-pointer flex-wrap items-center gap-1.5 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            <StatusBadge
                              status={log.event_type}
                              tone={getEventTone(log.event_type)}
                              label={eventLabel(log.event_type)}
                              className="normal-case"
                            />
                            <StatusBadge
                              status={log.actor_type}
                              tone={ACTOR_TONES[log.actor_type] ?? "muted"}
                              label={log.actor_type}
                            />
                          </button>
                        </td>
                        <td className={cn(TD, "font-medium max-md:mt-1")}>
                          {log.entity_label}
                          {log.entity_context && (
                            <span className="block text-xs font-normal text-earth-600">{log.entity_context}</span>
                          )}
                          {/* Below lg the By column folds in here. */}
                          <span className="block text-xs font-normal text-earth-600 lg:hidden">by {log.actor_label}</span>
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-earth-600 lg:table-cell">
                          {log.actor_label}
                          {log.ip_address && <span className="block text-earth-600">{log.ip_address}</span>}
                        </td>
                        <td className={cn(TD, "md:max-w-md")}>{renderDataSummary(log.data)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" className={cn("cursor-pointer border-earth-200", PHONE_TAP)} onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Load More
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={!!selectedLog} onOpenChange={(open) => { if (!open) setSelectedLog(null); }}>
        <DialogContent className="max-w-lg">
          {selectedLog && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge
                    status={selectedLog.event_type}
                    tone={getEventTone(selectedLog.event_type)}
                    label={eventLabel(selectedLog.event_type)}
                    className="normal-case"
                  />
                  <StatusBadge
                    status={selectedLog.actor_type}
                    tone={ACTOR_TONES[selectedLog.actor_type] ?? "muted"}
                    label={selectedLog.actor_type}
                  />
                </div>
                <DialogTitle className="text-base text-earth-900">{selectedLog.entity_label}</DialogTitle>
                {selectedLog.entity_context && (
                  <DialogDescription className="text-earth-600">{selectedLog.entity_context}</DialogDescription>
                )}
              </DialogHeader>

              <div className="space-y-1.5 text-sm border-y border-earth-100 py-3">
                <div className="flex gap-2">
                  <span className="w-16 shrink-0 text-earth-600">Actor</span>
                  <span className="text-earth-800">by {selectedLog.actor_label}</span>
                </div>
                {selectedLog.ip_address && (
                  <div className="flex gap-2">
                    <span className="w-16 shrink-0 text-earth-600">IP</span>
                    <span className="text-earth-800 tabular-nums">{selectedLog.ip_address}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <span className="w-16 shrink-0 text-earth-600">Time</span>
                  <span className="text-earth-800 tabular-nums">{formatDate(selectedLog.created_at)}</span>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-earth-600 mb-2">Metadata</h3>
                <div className="max-h-[50vh] overflow-y-auto pr-1">
                  {renderDataDetail(selectedLog.data)}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
