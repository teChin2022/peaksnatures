"use client";

import { useState, useEffect, useCallback } from "react";
import { ScrollText, Loader2, Filter } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { cn } from "@/lib/utils";

interface LogRow {
  id: string;
  homestay_id: string | null;
  entity_type: string;
  entity_id: string;
  event_type: string;
  actor_type: string;
  actor_id: string | null;
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

  const formatDate = (iso: string) => new Date(iso).toLocaleString();

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
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton-warm h-20 w-full rounded-xl" />
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
          <div className="space-y-2">
            {logs.map((log) => (
              <Card key={log.id} className="dashboard-card border-earth-100">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
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
                      <div className="text-sm text-earth-700">
                        <span className="font-medium">{log.entity_type}</span>
                        <span className="text-earth-400 mx-1">/</span>
                        <span className="font-mono text-xs text-earth-500">{log.entity_id.slice(0, 8)}</span>
                        {log.actor_id && (
                          <>
                            <span className="text-earth-400 mx-1">by</span>
                            <span className="font-mono text-xs text-earth-500">{log.actor_id.slice(0, 8)}</span>
                          </>
                        )}
                      </div>
                      {renderDataSummary(log.data)}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-earth-500 whitespace-nowrap tabular-nums">{formatDate(log.created_at)}</p>
                      {log.ip_address && (
                        <p className="text-[11px] text-earth-400 font-mono">{log.ip_address}</p>
                      )}
                    </div>
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
    </div>
  );
}
