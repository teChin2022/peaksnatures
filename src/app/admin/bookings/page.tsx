"use client";

import { useState, useEffect, useCallback } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  pending: "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function AdminBookingsPage() {
  const [res, setRes] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchBookings = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/bookings?page=${p}&limit=20`);
      if (r.ok) setRes(await r.json());
    } catch (err) {
      console.error("Failed to fetch bookings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings(page);
  }, [page, fetchBookings]);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-orange-100 p-2">
          <CalendarDays className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bookings</h1>
          <p className="text-sm text-gray-500">{res ? `${res.total} total` : "Loading..."}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Bookings</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !res || res.data.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">No bookings found.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-3 pr-4 font-medium">Guest</th>
                      <th className="pb-3 pr-4 font-medium">Homestay</th>
                      <th className="pb-3 pr-4 font-medium">Room</th>
                      <th className="pb-3 pr-4 font-medium">Dates</th>
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      <th className="pb-3 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.data.map((booking) => (
                      <tr key={booking.id} className="border-b last:border-0">
                        <td className="py-3 pr-4">
                          <div className="font-medium">{booking.guest_name}</div>
                          <div className="text-xs text-gray-500">{booking.guest_email}</div>
                        </td>
                        <td className="py-3 pr-4 text-gray-600">
                          {booking.homestay_name || "—"}
                        </td>
                        <td className="py-3 pr-4 text-gray-600">
                          {booking.room_name || "—"}
                        </td>
                        <td className="py-3 pr-4 text-gray-600 whitespace-nowrap">
                          <div>{new Date(booking.check_in).toLocaleDateString()}</div>
                          <div className="text-xs text-gray-400">
                            → {new Date(booking.check_out).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge
                            className={`text-[10px] ${STATUS_COLORS[booking.status] || "bg-gray-100 text-gray-700"}`}
                          >
                            {booking.status}
                          </Badge>
                        </td>
                        <td className="py-3 text-right font-medium whitespace-nowrap">
                          ฿{booking.total_price.toLocaleString()}
                          {booking.payment_type === "deposit" && (
                            <div className="text-xs text-gray-400 font-normal">
                              Paid: ฿{booking.amount_paid.toLocaleString()}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {res.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <p className="text-sm text-gray-500">
                    Page {res.page} of {res.totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(res.totalPages, p + 1))}
                      disabled={page >= res.totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
