"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { ScrollText, Loader2, Filter, Clock, User as UserIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format-date";

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

const EVENT_TYPE_OPTIONS = [
  "BOOKING_CREATED",
  "BOOKING_CONFIRMED",
  "BOOKING_CANCELLED",
  "BOOKING_REJECTED",
  "BALANCE_PAID",
  "CHECKIN",
  "CHECKOUT",
  "PROPERTY_CREATED",
  "PROPERTY_UPDATED",
  "PROPERTY_TOGGLED",
  "ROOM_CREATED",
  "ROOM_UPDATED",
  "ROOM_DELETED",
  "PRICE_UPDATED",
  "HOST_REGISTERED",
  "HOST_APPROVED",
  "HOST_REJECTED",
  "HOST_LOGIN",
  "HOST_LOGOUT",
  "FAILED_LOGIN",
  "PROFILE_UPDATED",
  "BLOCKED_DATE_ADDED",
  "BLOCKED_DATE_REMOVED",
  "REVIEW_SUBMITTED",
  "BOOKING_DATE_CHANGE_REQUESTED",
  "BOOKING_DATE_CHANGE_APPROVED",
  "BOOKING_DATE_CHANGE_REJECTED",
  "PASSWORD_CHANGED",
];

const ENTITY_TYPE_OPTIONS = ["booking", "homestay", "room", "host", "review", "blocked_date", "seasonal_price"];

const ACTOR_TYPE_OPTIONS = ["guest", "host", "admin", "system"];

type EventTone = "brand" | "earth" | "amber" | "destructive" | "muted";

const POSITIVE_EVENTS = new Set([
  "BOOKING_CREATED", "BOOKING_CONFIRMED", "BALANCE_PAID",
  "HOST_APPROVED", "BOOKING_DATE_CHANGE_APPROVED",
]);
const NEGATIVE_EVENTS = new Set([
  "BOOKING_CANCELLED", "BOOKING_REJECTED", "HOST_REJECTED",
  "FAILED_LOGIN", "ROOM_DELETED", "BOOKING_DATE_CHANGE_REJECTED",
]);
const WARNING_EVENTS = new Set([
  "PROPERTY_TOGGLED", "BLOCKED_DATE_ADDED", "BLOCKED_DATE_REMOVED",
  "BOOKING_DATE_CHANGE_REQUESTED", "PASSWORD_CHANGED", "HOST_REGISTERED",
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

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogRow | null>(null);

  const [eventType, setEventType] = useState("");
  const [entityType, setEntityType] = useState("");
  const [actorType, setActorType] = useState("");

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
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(null, false, { eventType, entityType, actorType });
  }, [fetchLogs, eventType, entityType, actorType]);

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
          <span key={k} className="inline-flex items-center rounded bg-earth-50 px-1.5 py-0.5 text-[11px] text-earth-600">
            <span className="font-medium text-earth-700 mr-0.5">{k}:</span>
            {typeof v === "object" ? JSON.stringify(v).slice(0, 40) : String(v).slice(0, 40)}
          </span>
        ))}
        {entries.length > 4 && (
          <span className="text-[11px] text-earth-400">+{entries.length - 4} more</span>
        )}
      </div>
    );
  };

  const renderDataDetail = (data: Record<string, unknown>) => {
    const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== "");
    if (entries.length === 0) return <p className="text-sm text-earth-400">No metadata.</p>;
    return (
      <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1.5 text-sm">
        {entries.map(([k, v]) => (
          <Fragment key={k}>
            <dt className="font-mono text-xs text-earth-500 pt-0.5 break-words">{k}</dt>
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
        eyebrow="Activity audit trail"
        title="History Logs"
        icon={ScrollText}
        actions={
          <Button
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "cursor-pointer",
              showFilters
                ? "bg-brand hover:bg-brand-hover text-white"
                : "bg-white border border-earth-200 text-earth-700 hover:bg-earth-50 hover:text-brand"
            )}
          >
            <Filter className="h-4 w-4 mr-1.5" />
            Filters
            {hasActiveFilters && (
              <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] text-brand font-bold">
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
                <label className="text-xs font-medium text-earth-700 mb-1 block">Event Type</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full cursor-pointer rounded-md border border-earth-200 bg-white px-3 py-2 text-sm text-earth-900 focus:outline-none focus:ring-2 focus:ring-brand/40"
                >
                  <option value="">All events</option>
                  {EVENT_TYPE_OPTIONS.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-earth-700 mb-1 block">Entity Type</label>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  className="w-full cursor-pointer rounded-md border border-earth-200 bg-white px-3 py-2 text-sm text-earth-900 focus:outline-none focus:ring-2 focus:ring-brand/40"
                >
                  <option value="">All entities</option>
                  {ENTITY_TYPE_OPTIONS.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-earth-700 mb-1 block">Actor Type</label>
                <select
                  value={actorType}
                  onChange={(e) => setActorType(e.target.value)}
                  className="w-full cursor-pointer rounded-md border border-earth-200 bg-white px-3 py-2 text-sm text-earth-900 focus:outline-none focus:ring-2 focus:ring-brand/40"
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
                <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-xs cursor-pointer text-earth-500 hover:text-brand">
                  Clear all filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton-warm h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No logs found"
          description={hasActiveFilters ? "Try clearing filters to see more activity." : "Platform activity will be recorded here as it happens."}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {logs.map((log) => (
              <Card
                key={log.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedLog(log)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedLog(log);
                  }
                }}
                className="dashboard-card border-earth-100 cursor-pointer transition hover:border-brand/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge
                      status={log.event_type}
                      tone={getEventTone(log.event_type)}
                      label={log.event_type}
                      className="font-mono normal-case"
                    />
                    <StatusBadge
                      status={log.actor_type}
                      tone={ACTOR_TONES[log.actor_type] ?? "muted"}
                      label={log.actor_type}
                    />
                  </div>

                  <div className="text-sm text-earth-800 font-medium">
                    {log.entity_label}
                    {log.entity_context && (
                      <span className="ml-1.5 text-earth-500 font-normal">· {log.entity_context}</span>
                    )}
                  </div>

                  <div className="text-xs text-earth-600 flex items-center gap-1.5">
                    <UserIcon className="h-3 w-3 text-earth-400" />
                    <span>by {log.actor_label}</span>
                    {log.ip_address && (
                      <span className="text-earth-400">· {log.ip_address}</span>
                    )}
                  </div>

                  {renderDataSummary(log.data)}

                  <div className="pt-2 border-t border-earth-100/70 text-xs text-earth-500 flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    <span className="tabular-nums">{formatDate(log.created_at)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" className="cursor-pointer border-earth-200" onClick={handleLoadMore} disabled={loadingMore}>
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
                    label={selectedLog.event_type}
                    className="font-mono normal-case"
                  />
                  <StatusBadge
                    status={selectedLog.actor_type}
                    tone={ACTOR_TONES[selectedLog.actor_type] ?? "muted"}
                    label={selectedLog.actor_type}
                  />
                </div>
                <DialogTitle className="text-base text-earth-900">{selectedLog.entity_label}</DialogTitle>
                {selectedLog.entity_context && (
                  <DialogDescription className="text-earth-500">{selectedLog.entity_context}</DialogDescription>
                )}
              </DialogHeader>

              <div className="space-y-1.5 text-sm border-y border-earth-100 py-3">
                <div className="flex gap-2">
                  <span className="w-16 shrink-0 text-earth-500">Actor</span>
                  <span className="text-earth-800">by {selectedLog.actor_label}</span>
                </div>
                {selectedLog.ip_address && (
                  <div className="flex gap-2">
                    <span className="w-16 shrink-0 text-earth-500">IP</span>
                    <span className="text-earth-800 tabular-nums">{selectedLog.ip_address}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <span className="w-16 shrink-0 text-earth-500">Time</span>
                  <span className="text-earth-800 tabular-nums">{formatDate(selectedLog.created_at)}</span>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-earth-400 mb-2">Metadata</h3>
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
