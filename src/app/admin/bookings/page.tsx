"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, BedDouble, Loader2, Trash2, Timer, Mail, Phone, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { PHONE_TAP, STICKY_START, TABLE, TABLE_CARD, TABLE_WRAP, TBODY, TD, TD_HIDE, TD_LEAD, TD_TRAIL, TH, TH_ROW, TR } from "@/components/admin/table-classes";
import { SearchBox } from "@/components/admin/search-box";
import { LoadError, NETWORK_ERROR, actionFailed } from "@/components/admin/load-error";
import { fmtDateStr, fmtDate } from "@/lib/format-date";
import { fmtTHB } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

interface BookingRow {
  id: string;
  homestay_id: string;
  room_id: string | null;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  total_price: number;
  status: string;
  payment_type: string;
  amount_paid: number;
  created_at: string;
  homestay_name: string | null;
  homestay_slug: string | null;
  room_name: string | null;
  group_id: string | null;
}

interface PaginatedResponse {
  data: BookingRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore?: boolean;
}

interface HoldRow {
  id: string;
  room_id: string;
  check_in: string;
  check_out: string;
  session_id: string;
  expires_at: string;
  created_at: string;
  room_name: string | null;
  homestay_name: string | null;
}

interface HostOption {
  id: string;
  name: string;
}

interface BookingFilters {
  hostId: string;
  status: string;
  q: string;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "verified", label: "Verified" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "rejected", label: "Rejected" },
];

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [hosts, setHosts] = useState<HostOption[]>([]);
  const searchParams = useSearchParams();
  const [selectedHostId, setSelectedHostId] = useState<string>("all");
  // Overview's "Pending bookings" links here with ?status=pending.
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    const s = searchParams.get("status");
    return s && STATUS_OPTIONS.some((o) => o.value === s) ? s : "all";
  });
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("bookings");
  const [holds, setHolds] = useState<HoldRow[]>([]);
  const [holdsLoading, setHoldsLoading] = useState(true);
  const [deletingHoldId, setDeletingHoldId] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [holdsFailed, setHoldsFailed] = useState(false);
  const [confirmDeleteHold, setConfirmDeleteHold] = useState<HoldRow | null>(null);

  useEffect(() => {
    async function fetchHosts() {
      try {
        const r = await fetch("/api/admin/hosts?limit=100");
        if (r.ok) {
          const res = await r.json();
          setHosts(res.data.map((h: { id: string; name: string }) => ({ id: h.id, name: h.name })));
        }
      } catch (err) {
        console.error("Failed to fetch hosts:", err);
      }
    }
    fetchHosts();
  }, []);

  const fetchHolds = useCallback(async () => {
    setHoldsLoading(true);
    try {
      const r = await fetch("/api/admin/booking-holds");
      if (r.ok) {
        const res = await r.json();
        setHolds(res.data);
      }
      setHoldsFailed(!r.ok);
    } catch {
      setHoldsFailed(true);
    } finally {
      setHoldsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHolds();
  }, [fetchHolds]);

  const handleDeleteHold = async (holdId: string) => {
    setDeletingHoldId(holdId);
    try {
      const r = await fetch("/api/admin/booking-holds", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: holdId }),
      });
      if (r.ok) {
        toast.success("Booking hold deleted");
        setHolds((prev) => prev.filter((h) => h.id !== holdId));
      } else {
        const data = await r.json();
        toast.error(data.error || actionFailed("delete the hold"));
      }
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      setDeletingHoldId(null);
      setConfirmDeleteHold(null);
    }
  };

  const fetchBookings = useCallback(async (p: number, append: boolean, f: BookingFilters) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "20" });
      if (f.hostId !== "all") params.set("host_id", f.hostId);
      if (f.status !== "all") params.set("status", f.status);
      if (f.q) params.set("q", f.q);
      const r = await fetch(`/api/admin/bookings?${params}`);
      if (r.ok) {
        const res: PaginatedResponse = await r.json();
        setBookings((prev) => append ? [...prev, ...res.data] : res.data);
        if (res.total != null) setTotal(res.total);
        setHasMore(res.hasMore ?? (p < res.totalPages));
      }
      // A failed "Load More" keeps the rows already shown; only a first load swaps in the error.
      if (append) { if (!r.ok) toast.error(actionFailed("load more bookings")); } else setLoadFailed(!r.ok);
    } catch {
      if (append) toast.error(NETWORK_ERROR); else setLoadFailed(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    fetchBookings(1, false, { hostId: selectedHostId, status: statusFilter, q: query });
  }, [fetchBookings, selectedHostId, statusFilter, query]);

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchBookings(next, true, { hostId: selectedHostId, status: statusFilter, q: query });
  };

  return (
    <div>
      <PageHeader
        subtitle={loading ? "Loading…" : `${total} total`}
        title="Bookings"
        icon={CalendarDays}
        actions={
          <Link
            href="/admin/bookings/date-changes"
            // Phones reach it from the menu; the header keeps room for the title.
            className="hidden h-10 items-center rounded-full border border-earth-200 bg-white px-4 text-sm font-medium text-earth-800 hover:border-brand/40 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand md:inline-flex"
          >
            Date changes
          </Link>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="border border-earth-100 bg-earth-50 max-md:h-11! max-md:w-full">
            <TabsTrigger value="bookings" className="cursor-pointer data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm">
              Bookings
            </TabsTrigger>
            <TabsTrigger value="holds" className="cursor-pointer data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm">
              Holds
              {holds.length > 0 && (
                <Badge className="ml-1.5 bg-amber-50 text-amber-700 border border-amber-200/70 text-xs px-1.5">
                  {holds.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          {activeTab === "bookings" && (
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full cursor-pointer max-md:h-11! sm:w-[150px]" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedHostId} onValueChange={setSelectedHostId}>
                <SelectTrigger className="w-full cursor-pointer max-md:h-11! sm:w-[180px]" aria-label="Filter by host">
                  <SelectValue placeholder="All Hosts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Hosts</SelectItem>
                  {hosts.map((host) => (
                    <SelectItem key={host.id} value={host.id}>
                      {host.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        {activeTab === "bookings" && (
          <div className="mb-4">
            <SearchBox
              value={query}
              onSearch={setQuery}
              label="Search bookings by guest name, phone or email"
              placeholder="Name, phone or email"
            />
          </div>
        )}

        {/* ── Bookings Tab ── */}
        <TabsContent value="bookings">
          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="skeleton-warm h-40 w-full rounded-xl" />
              ))}
            </div>
          ) : loadFailed ? (
            <LoadError what="bookings" onRetry={() => fetchBookings(1, false, { hostId: selectedHostId, status: statusFilter, q: query })} />
          ) : bookings.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={query || statusFilter !== "all" || selectedHostId !== "all" ? "No matching bookings" : "No bookings yet"}
              description={
                query || statusFilter !== "all" || selectedHostId !== "all"
                  ? "Nothing matches this search and these filters."
                  : "New reservations will appear here."
              }
            />
          ) : (
            <>
              {/* Rows on phones, a table from md (owner, 2026-11-20); one markup for both. */}
              <Card className={TABLE_CARD}>
                <CardContent className="p-0">
                  <div className={TABLE_WRAP}>
                    <table className={cn(TABLE, "md:min-w-[640px]")}>
                      <thead>
                        <tr className={TH_ROW}>
                          <th scope="col" className={cn(TH, STICKY_START)}>Guest</th>
                          <th scope="col" className={TH}>Stay</th>
                          <th scope="col" className={TH}>Homestay · house</th>
                          <th scope="col" className={cn(TH, "hidden xl:table-cell")}>Guests</th>
                          <th scope="col" className={cn(TH, "text-right")}>Total</th>
                          <th scope="col" className={cn(TH, "hidden xl:table-cell")}>Booked</th>
                        </tr>
                      </thead>
                      <tbody className={TBODY}>
                        {bookings.map((booking) => {
                          const nights = nightsBetween(booking.check_in, booking.check_out);
                          return (
                            <tr key={booking.id} className={TR}>
                              <td className={cn(TD_LEAD, "md:max-w-64", STICKY_START)}>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-semibold text-earth-900">{booking.guest_name}</span>
                                  <StatusBadge status={booking.status} />
                                </div>
                                {/* Tap to write or call: the phone job is answering a guest. */}
                                <a
                                  href={`mailto:${booking.guest_email}`}
                                  className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-earth-600 underline-offset-4 hover:text-brand hover:underline max-md:min-h-6"
                                >
                                  <Mail className="h-3 w-3 shrink-0" />
                                  <span className="min-w-0 truncate md:whitespace-normal md:break-all">{booking.guest_email}</span>
                                </a>
                                {booking.guest_phone && (
                                  <a
                                    href={`tel:${booking.guest_phone}`}
                                    className="mt-0.5 flex w-fit items-center gap-1.5 text-xs tabular-nums text-earth-600 underline-offset-4 hover:text-brand hover:underline max-md:min-h-6"
                                  >
                                    <Phone className="h-3 w-3 shrink-0" />
                                    {booking.guest_phone}
                                  </a>
                                )}
                              </td>
                              <td className={cn(TD, "tabular-nums max-md:mt-1 md:whitespace-nowrap")}>
                                {fmtDateStr(booking.check_in, "MMM d", "en")} → {fmtDateStr(booking.check_out, "MMM d, yyyy", "en")}
                                <p className="text-xs text-earth-600 max-md:inline max-md:before:content-['_·_']">
                                  {nights} night{nights === 1 ? "" : "s"}
                                  <span className="xl:hidden"> · {booking.num_guests} guest{booking.num_guests === 1 ? "" : "s"}</span>
                                </p>
                              </td>
                              <td className={TD}>
                                {booking.homestay_name || "—"}
                                <p className="flex items-center gap-1.5 text-xs text-earth-600">
                                  {booking.room_name || "—"}
                                  {booking.group_id && (
                                    <StatusBadge status="group" tone="earth" label="Group" />
                                  )}
                                </p>
                              </td>
                              <td className={cn(TD_HIDE, "hidden whitespace-nowrap xl:table-cell")}>{booking.num_guests}</td>
                              <td className={cn(TD_TRAIL, "whitespace-nowrap text-right tabular-nums")}>
                                <span className="font-semibold text-earth-900">{fmtTHB(booking.total_price)}</span>
                                {booking.payment_type === "deposit" && (
                                  <p className="text-xs text-earth-600">Paid: {fmtTHB(booking.amount_paid)}</p>
                                )}
                              </td>
                              <td className={cn(TD_HIDE, "hidden whitespace-nowrap text-xs tabular-nums text-earth-600 xl:table-cell")}>
                                {fmtDate(new Date(booking.created_at), "MMM d, yyyy · HH:mm", "en")}
                              </td>
                            </tr>
                          );
                        })}
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
        </TabsContent>

        {/* ── Holds Tab ── */}
        <TabsContent value="holds">
          {holdsLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton-warm h-32 w-full rounded-xl" />
              ))}
            </div>
          ) : holdsFailed ? (
            <LoadError what="booking holds" onRetry={fetchHolds} />
          ) : holds.length === 0 ? (
            <EmptyState
              icon={Timer}
              title="No active booking holds"
              description="Temporary holds expire automatically and clear themselves from this list."
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {holds.map((hold) => {
                const expired = new Date(hold.expires_at) < new Date();
                return (
                  <Card key={hold.id} className="dashboard-card border-earth-100">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-semibold text-earth-900 truncate">
                              {hold.homestay_name || "—"}
                            </h2>
                            <StatusBadge status={expired ? "expired" : "active"} />
                          </div>
                          {hold.room_name && (
                            <p className="mt-0.5 text-xs text-earth-600 flex items-center gap-1.5">
                              <BedDouble className="h-3 w-3 shrink-0" />
                              <span className="truncate">{hold.room_name}</span>
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn("h-9 px-3 text-xs cursor-pointer text-destructive border-destructive/30 hover:bg-destructive/5 shrink-0", PHONE_TAP)}
                          onClick={() => setConfirmDeleteHold(hold)}
                          disabled={deletingHoldId === hold.id}
                        >
                          {deletingHoldId === hold.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Delete
                            </>
                          )}
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-earth-700">
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                          <span className="tabular-nums">
                            {fmtDateStr(hold.check_in, "MMM d", "en")} → {fmtDateStr(hold.check_out, "MMM d, yyyy", "en")}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Timer className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                          <span className="tabular-nums">
                            Expires {fmtDate(new Date(hold.expires_at), "MMM d, HH:mm", "en")}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-earth-100/70 text-xs text-earth-600 flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        <span className="tabular-nums">Created {fmtDate(new Date(hold.created_at), "MMM d, yyyy · HH:mm", "en")}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Confirm Delete Hold Dialog ── */}
      <Dialog open={!!confirmDeleteHold} onOpenChange={(open) => { if (!open) setConfirmDeleteHold(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">Delete Booking Hold</DialogTitle>
            <DialogDescription>
              Delete the hold on <strong>{confirmDeleteHold?.room_name || "this house"}</strong> ({confirmDeleteHold ? `${fmtDateStr(confirmDeleteHold.check_in, "MMM d", "en")} → ${fmtDateStr(confirmDeleteHold.check_out, "MMM d, yyyy", "en")}` : ""})? This will release the dates immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer border-earth-200" onClick={() => setConfirmDeleteHold(null)}>Cancel</Button>
            <Button
              variant="destructive"
              className="cursor-pointer"
              onClick={() => confirmDeleteHold && handleDeleteHold(confirmDeleteHold.id)}
              disabled={deletingHoldId !== null}
            >
              {deletingHoldId && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
