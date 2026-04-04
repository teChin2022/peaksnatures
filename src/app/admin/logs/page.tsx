"use client";

import { useState, useEffect, useCallback } from "react";
import { ScrollText, Loader2, Filter } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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

const ACTOR_COLORS: Record<string, string> = {
  guest: "bg-blue-100 text-blue-700",
  host: "bg-purple-100 text-purple-700",
  admin: "bg-slate-200 text-slate-700",
  system: "bg-gray-100 text-gray-600",
};

const EVENT_COLORS: Record<string, string> = {
  BOOKING_CREATED: "bg-green-100 text-green-700",
  BOOKING_CONFIRMED: "bg-green-100 text-green-700",
  BOOKING_CANCELLED: "bg-red-100 text-red-700",
  BOOKING_REJECTED: "bg-red-100 text-red-700",
  BALANCE_PAID: "bg-emerald-100 text-emerald-700",
  CHECKIN: "bg-blue-100 text-blue-700",
  CHECKOUT: "bg-blue-100 text-blue-700",
  HOST_REGISTERED: "bg-indigo-100 text-indigo-700",
  HOST_APPROVED: "bg-green-100 text-green-700",
  HOST_REJECTED: "bg-red-100 text-red-700",
  HOST_LOGIN: "bg-sky-100 text-sky-700",
  HOST_LOGOUT: "bg-gray-100 text-gray-600",
  FAILED_LOGIN: "bg-red-100 text-red-700",
  PROPERTY_CREATED: "bg-purple-100 text-purple-700",
  PROPERTY_UPDATED: "bg-purple-100 text-purple-700",
  PROPERTY_TOGGLED: "bg-amber-100 text-amber-700",
  ROOM_CREATED: "bg-teal-100 text-teal-700",
  ROOM_UPDATED: "bg-teal-100 text-teal-700",
  ROOM_DELETED: "bg-red-100 text-red-700",
  PRICE_UPDATED: "bg-orange-100 text-orange-700",
  PROFILE_UPDATED: "bg-indigo-100 text-indigo-700",
  BLOCKED_DATE_ADDED: "bg-amber-100 text-amber-700",
  BLOCKED_DATE_REMOVED: "bg-amber-100 text-amber-700",
  REVIEW_SUBMITTED: "bg-yellow-100 text-yellow-700",
  BOOKING_DATE_CHANGE_REQUESTED: "bg-orange-100 text-orange-700",
  BOOKING_DATE_CHANGE_APPROVED: "bg-green-100 text-green-700",
  BOOKING_DATE_CHANGE_REJECTED: "bg-red-100 text-red-700",
  PASSWORD_CHANGED: "bg-slate-200 text-slate-700",
};

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
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

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString();
  };

  const renderDataSummary = (data: Record<string, unknown>) => {
    const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== "");
    if (entries.length === 0) return null;
    const shown = entries.slice(0, 4);
    return (
      <div className="mt-1.5 flex flex-wrap gap-1">
        {shown.map(([k, v]) => (
          <span key={k} className="inline-flex items-center rounded bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-500">
            <span className="font-medium text-gray-600 mr-0.5">{k}:</span>
            {typeof v === "object" ? JSON.stringify(v).slice(0, 40) : String(v).slice(0, 40)}
          </span>
        ))}
        {entries.length > 4 && (
          <span className="text-[11px] text-gray-400">+{entries.length - 4} more</span>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-1">Activity audit trail</p>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-200 p-2">
              <ScrollText className="h-5 w-5 text-slate-600" />
            </div>
            <h1 className="text-2xl font-serif text-gray-900">History Logs</h1>
          </div>
        </div>
        <Button
          variant={showFilters ? "default" : "outline"}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className={showFilters ? "bg-slate-800 hover:bg-slate-700" : ""}
        >
          <Filter className="h-4 w-4 mr-1.5" />
          Filters
          {hasActiveFilters && (
            <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] text-slate-800 font-bold">
              {[eventType, entityType, actorType].filter(Boolean).length}
            </span>
          )}
        </Button>
      </div>

      {showFilters && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Event Type</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <option value="">All events</option>
                  {EVENT_TYPE_OPTIONS.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Entity Type</label>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <option value="">All entities</option>
                  {ENTITY_TYPE_OPTIONS.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Actor Type</label>
                <select
                  value={actorType}
                  onChange={(e) => setActorType(e.target.value)}
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
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
                <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-xs text-gray-500">
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
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-gray-500 py-12 text-center">No logs found.</p>
      ) : (
        <>
          <div className="space-y-2">
            {logs.map((log) => (
              <Card key={log.id}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <Badge className={`text-[10px] ${EVENT_COLORS[log.event_type] || "bg-gray-100 text-gray-700"}`}>
                          {log.event_type}
                        </Badge>
                        <Badge className={`text-[10px] ${ACTOR_COLORS[log.actor_type] || "bg-gray-100 text-gray-600"}`}>
                          {log.actor_type}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">{log.entity_type}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="font-mono text-xs text-gray-400">{log.entity_id.slice(0, 8)}</span>
                        {log.actor_id && (
                          <>
                            <span className="text-gray-400 mx-1">by</span>
                            <span className="font-mono text-xs text-gray-400">{log.actor_id.slice(0, 8)}</span>
                          </>
                        )}
                      </div>
                      {renderDataSummary(log.data)}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-400 whitespace-nowrap">{formatDate(log.created_at)}</p>
                      {log.ip_address && (
                        <p className="text-[11px] text-gray-300 font-mono">{log.ip_address}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
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
