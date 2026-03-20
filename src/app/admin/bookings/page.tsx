"use client";

import { useState, useEffect, useCallback } from "react";
import { CalendarDays, Home, BedDouble, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  pending: "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchBookings = useCallback(async (p: number, append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const r = await fetch(`/api/admin/bookings?page=${p}&limit=20`);
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
    fetchBookings(1);
  }, [fetchBookings]);

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchBookings(next, true);
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-orange-100 p-2">
          <CalendarDays className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bookings</h1>
          <p className="text-sm text-gray-500">{loading ? "Loading..." : `${total} total`}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <p className="text-sm text-gray-500 py-12 text-center">No bookings found.</p>
      ) : (
        <>
          <div className="space-y-3">
            {bookings.map((booking) => (
              <Card key={booking.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 truncate">{booking.guest_name}</h3>
                        <Badge
                          className={`text-[10px] shrink-0 ${STATUS_COLORS[booking.status] || "bg-gray-100 text-gray-700"}`}
                        >
                          {booking.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-400 mb-1.5">{booking.guest_email}</p>
                      <div className="space-y-1 text-sm text-gray-500">
                        <div className="flex items-center gap-1.5">
                          <Home className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{booking.homestay_name || "—"}</span>
                        </div>
                        {booking.room_name && (
                          <div className="flex items-center gap-1.5">
                            <BedDouble className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{booking.room_name}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                          <span>{new Date(booking.check_in).toLocaleDateString()} → {new Date(booking.check_out).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-gray-900">฿{booking.total_price.toLocaleString()}</p>
                      {booking.payment_type === "deposit" && (
                        <p className="text-xs text-gray-400">Paid: ฿{booking.amount_paid.toLocaleString()}</p>
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
