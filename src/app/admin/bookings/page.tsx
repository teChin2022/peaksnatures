"use client";

import { useState, useEffect, useCallback } from "react";
import { CalendarDays, Home, BedDouble, Loader2, Trash2, Timer, Mail, Phone, Users, Clock } from "lucide-react";
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
import { fmtDateStr, fmtDate } from "@/lib/format-date";
import { fmtTHB } from "@/lib/format-currency";

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

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [hosts, setHosts] = useState<HostOption[]>([]);
  const [selectedHostId, setSelectedHostId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("bookings");
  const [holds, setHolds] = useState<HoldRow[]>([]);
  const [holdsLoading, setHoldsLoading] = useState(true);
  const [deletingHoldId, setDeletingHoldId] = useState<string | null>(null);
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
    } catch (err) {
      console.error("Failed to fetch holds:", err);
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
        toast.error(data.error || "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete hold");
    } finally {
      setDeletingHoldId(null);
      setConfirmDeleteHold(null);
    }
  };

  const fetchBookings = useCallback(async (p: number, append = false, hostId?: string) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "20" });
      if (hostId && hostId !== "all") params.set("host_id", hostId);
      const r = await fetch(`/api/admin/bookings?${params}`);
      if (r.ok) {
        const res: PaginatedResponse = await r.json();
        setBookings((prev) => append ? [...prev, ...res.data] : res.data);
        if (res.total != null) setTotal(res.total);
        setHasMore(res.hasMore ?? (p < res.totalPages));
      }
    } catch (err) {
      console.error("Failed to fetch bookings:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    fetchBookings(1, false, selectedHostId);
  }, [fetchBookings, selectedHostId]);

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchBookings(next, true, selectedHostId);
  };

  return (
    <div>
      <PageHeader
        eyebrow={loading ? "Loading…" : `${total} total`}
        title="Bookings"
        icon={CalendarDays}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="bg-earth-50 border border-earth-100">
            <TabsTrigger value="bookings" className="cursor-pointer data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm">
              Bookings
            </TabsTrigger>
            <TabsTrigger value="holds" className="cursor-pointer data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm">
              Holds
              {holds.length > 0 && (
                <Badge className="ml-1.5 bg-amber-50 text-amber-700 border border-amber-200/70 text-[10px] px-1.5">
                  {holds.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          {activeTab === "bookings" && (
            <Select value={selectedHostId} onValueChange={setSelectedHostId}>
              <SelectTrigger className="w-[180px] cursor-pointer border-earth-200">
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
          )}
        </div>

        {/* ── Bookings Tab ── */}
        <TabsContent value="bookings">
          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="skeleton-warm h-40 w-full rounded-xl" />
              ))}
            </div>
          ) : bookings.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No bookings yet"
              description={selectedHostId !== "all" ? "This host has no bookings in the selected scope." : "New reservations will appear here."}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {bookings.map((booking) => {
                  const nights = nightsBetween(booking.check_in, booking.check_out);
                  return (
                    <Card key={booking.id} className="dashboard-card border-earth-100">
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-earth-900 truncate">{booking.guest_name}</h3>
                              <StatusBadge status={booking.status} />
                            </div>
                            <p className="mt-0.5 text-xs text-earth-500 flex items-center gap-1.5 truncate">
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{booking.guest_email}</span>
                            </p>
                            {booking.guest_phone && (
                              <p className="mt-0.5 text-xs text-earth-500 flex items-center gap-1.5">
                                <Phone className="h-3 w-3 shrink-0" />
                                {booking.guest_phone}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-semibold text-earth-900 tabular-nums">{fmtTHB(booking.total_price)}</p>
                            {booking.payment_type === "deposit" && (
                              <p className="text-xs text-earth-500 tabular-nums">Paid: {fmtTHB(booking.amount_paid)}</p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-earth-700">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Home className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                            <span className="truncate">{booking.homestay_name || "—"}</span>
                          </div>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <BedDouble className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                            <span className="truncate">{booking.room_name || "—"}</span>
                            {booking.group_id && (
                              <span className="shrink-0 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">Group</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                            <span className="tabular-nums">
                              {fmtDateStr(booking.check_in, "MMM d", "en")} → {fmtDateStr(booking.check_out, "MMM d, yyyy", "en")}
                              <span className="text-earth-400"> · {nights} night{nights === 1 ? "" : "s"}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                            <span>{booking.num_guests} guest{booking.num_guests === 1 ? "" : "s"}</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-earth-100/70 text-xs text-earth-500 flex items-center gap-1.5">
                          <Clock className="h-3 w-3" />
                          <span className="tabular-nums">Created {fmtDate(new Date(booking.created_at), "MMM d, yyyy · HH:mm", "en")}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
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
        </TabsContent>

        {/* ── Holds Tab ── */}
        <TabsContent value="holds">
          {holdsLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton-warm h-32 w-full rounded-xl" />
              ))}
            </div>
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
                            <h3 className="font-semibold text-earth-900 truncate">
                              {hold.homestay_name || "—"}
                            </h3>
                            <StatusBadge status={expired ? "expired" : "active"} />
                          </div>
                          {hold.room_name && (
                            <p className="mt-0.5 text-xs text-earth-500 flex items-center gap-1.5">
                              <BedDouble className="h-3 w-3 shrink-0" />
                              <span className="truncate">{hold.room_name}</span>
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 px-3 text-xs cursor-pointer text-destructive border-destructive/30 hover:bg-destructive/5 shrink-0"
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

                      <div className="pt-2 border-t border-earth-100/70 text-xs text-earth-500 flex items-center gap-1.5">
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
              Delete the hold on <strong>{confirmDeleteHold?.room_name || "this room"}</strong> ({confirmDeleteHold ? `${fmtDateStr(confirmDeleteHold.check_in, "MMM d", "en")} → ${fmtDateStr(confirmDeleteHold.check_out, "MMM d, yyyy", "en")}` : ""})? This will release the dates immediately.
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
