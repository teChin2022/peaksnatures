"use client";

import { useState, useEffect, useCallback } from "react";
import { CalendarDays, Home, BedDouble, Loader2, Trash2, Timer } from "lucide-react";
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

      <Tabs defaultValue="bookings">
        <TabsList className="mb-4 bg-earth-50 border border-earth-100">
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

        {/* ── Bookings Tab ── */}
        <TabsContent value="bookings">
          <div className="flex justify-end mb-4">
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
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton-warm h-28 w-full rounded-xl" />
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
              <div className="space-y-3">
                {bookings.map((booking) => (
                  <Card key={booking.id} className="dashboard-card border-earth-100">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-earth-900 truncate">{booking.guest_name}</h3>
                            <StatusBadge status={booking.status} />
                          </div>
                          <p className="text-xs text-earth-400 mb-1.5">{booking.guest_email}</p>
                          <div className="space-y-1 text-sm text-earth-600">
                            <div className="flex items-center gap-1.5">
                              <Home className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                              <span className="truncate">{booking.homestay_name || "—"}</span>
                            </div>
                            {booking.room_name && (
                              <div className="flex items-center gap-1.5">
                                <BedDouble className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                                <span className="truncate">{booking.room_name}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                              <span>{new Date(booking.check_in).toLocaleDateString()} → {new Date(booking.check_out).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-earth-900 tabular-nums">฿{booking.total_price.toLocaleString()}</p>
                          {booking.payment_type === "deposit" && (
                            <p className="text-xs text-earth-500 tabular-nums">Paid: ฿{booking.amount_paid.toLocaleString()}</p>
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
        </TabsContent>

        {/* ── Holds Tab ── */}
        <TabsContent value="holds">
          {holdsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton-warm h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : holds.length === 0 ? (
            <EmptyState
              icon={Timer}
              title="No active booking holds"
              description="Temporary holds expire automatically and clear themselves from this list."
            />
          ) : (
            <div className="space-y-3">
              {holds.map((hold) => {
                const expired = new Date(hold.expires_at) < new Date();
                return (
                  <Card key={hold.id} className="dashboard-card border-earth-100">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-earth-900 truncate">
                              {hold.homestay_name || "—"}
                            </h3>
                            <StatusBadge status={expired ? "expired" : "active"} />
                          </div>
                          <div className="space-y-1 text-sm text-earth-600">
                            {hold.room_name && (
                              <div className="flex items-center gap-1.5">
                                <BedDouble className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                                <span className="truncate">{hold.room_name}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                              <span>{new Date(hold.check_in).toLocaleDateString()} → {new Date(hold.check_out).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Timer className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                              <span>Expires: {new Date(hold.expires_at).toLocaleString()}</span>
                            </div>
                          </div>
                          <p className="text-xs text-earth-400 mt-1 font-mono">Session: {hold.session_id.slice(0, 12)}…</p>
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
              Delete the hold on <strong>{confirmDeleteHold?.room_name || "this room"}</strong> ({new Date(confirmDeleteHold?.check_in || "").toLocaleDateString()} → {new Date(confirmDeleteHold?.check_out || "").toLocaleDateString()})? This will release the dates immediately.
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
