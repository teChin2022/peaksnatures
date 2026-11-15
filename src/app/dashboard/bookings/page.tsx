"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useTranslations, useLocale } from "next-intl";
import {
  Home,
  CalendarDays,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  Loader2,
  MapPin,
  ImageIcon,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  User,
  Phone,
  Mail,
  CreditCard,
  ArrowRightLeft,
  Zap,
  Paperclip,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { statusToneClass } from "@/components/admin/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { BookingStatus } from "@/types/database";
import { toast } from "sonner";
import { fmtDateStr } from "@/lib/format-date";
import { logClientEvent } from "@/lib/history-log-client";
import { getProvinceLabel } from "@/lib/provinces";
import { QuickBookingDialog } from "@/components/dashboard/quick-booking-dialog";
import { BookingAttachments } from "@/components/dashboard/booking-attachments";
import { countAttachmentsByBooking } from "@/lib/booking-attachments";
import { isQuickPending } from "@/lib/quick-booking";
import { cartActionTargets, cartMoney, groupIntoCarts, housesDiffer, mergeById } from "@/lib/booking-carts";

interface BookingRow {
  id: string;
  homestay_id: string;
  room_id: string | null;
  group_id: string | null;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  total_price: number;
  discount_amount: number | null;
  amount_paid: number;
  payment_type: string;
  status: BookingStatus;
  easyslip_verified: boolean;
  payment_slip_url: string | null;
  payment_slip_hash: string | null;
  guest_province: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  selected_options: { name: string; price: number }[] | null;
  booking_source: string | null;
  guest_pricing_label: string | null;
}

interface DateChangeRequestRow {
  id: string;
  booking_id: string;
  old_check_in: string;
  old_check_out: string;
  new_check_in: string;
  new_check_out: string;
  old_total_price: number;
  new_total_price: number;
  price_difference: number;
  status: string;
  requested_by: string;
  easyslip_verified: boolean;
  payment_slip_url: string | null;
  old_room_id: string | null;
  new_room_id: string | null;
  old_room_name: string | null;
  new_room_name: string | null;
}

interface DisplayBooking extends BookingRow {
  homestay_name: string;
  room_name: string;
}

const PAGE_SIZE = 20;
const SEARCH_MIN_CHARS = 3;

/**
 * Converts a storage path (or legacy signed URL) stored in payment_slip_url
 * into a fresh signed URL. Returns null if no path is stored.
 */
function extractStoragePath(value: string | null): string | null {
  if (!value) return null;
  // New format: plain storage path like "pending/xxx/slip.jpg"
  if (!value.startsWith("http")) return value;
  // Legacy format: full signed URL — extract path after "/payment-slips/"
  const match = value.match(/\/payment-slips\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function resolveSlipUrls(
  rows: BookingRow[],
  supabase: ReturnType<typeof createClient>
): Promise<BookingRow[]> {
  const paths = rows
    .map((r) => ({ id: r.id, path: extractStoragePath(r.payment_slip_url) }))
    .filter((p): p is { id: string; path: string } => p.path !== null);

  if (paths.length === 0) return rows;

  const { data } = await supabase.storage
    .from("payment-slips")
    .createSignedUrls(
      paths.map((p) => p.path),
      60 * 60 // 1 hour
    );

  if (!data) return rows;

  const urlMap = new Map<string, string>();
  paths.forEach((p, i) => {
    const signed = data[i]?.signedUrl;
    if (signed) urlMap.set(p.id, signed);
  });

  return rows.map((r) => ({
    ...r,
    payment_slip_url: urlMap.get(r.id) ?? r.payment_slip_url,
  }));
}

/**
 * Attachment counts for a page of bookings, in one round trip.
 *
 * Only counts — the signed URLs for the grid are minted when a detail dialog
 * opens, for that one booking. Prefetching them for 20 bookings would sign up
 * to 200 URLs nobody looks at.
 */
async function fetchAttachmentCounts(
  bookingIds: string[],
  supabase: ReturnType<typeof createClient>
): Promise<Record<string, number>> {
  if (bookingIds.length === 0) return {};
  const { data } = await supabase
    .from("booking_attachments")
    .select("booking_id")
    .in("booking_id", bookingIds);
  return countAttachmentsByBooking(data as { booking_id: string }[] | null);
}

/**
 * The rest of every cart a page touches. A page of 20 rows can stop part-way
 * through a cart, and a cart card adds up all of its houses, so a missing house
 * would show the host a short total.
 */
async function withCartSiblings(
  rows: BookingRow[],
  supabase: ReturnType<typeof createClient>
): Promise<BookingRow[]> {
  const groupIds = [...new Set(rows.flatMap((r) => (r.group_id ? [r.group_id] : [])))];
  if (groupIds.length === 0) return rows;
  const { data } = await supabase.from("bookings").select("*").in("group_id", groupIds);
  return mergeById(rows, (data as unknown as BookingRow[]) || []);
}

const statusConfig: Record<
  BookingStatus,
  { labelKey: string; color: string; icon: React.ElementType }
> = {
  pending: { labelKey: "statusPending", color: statusToneClass("pending"), icon: Clock },
  verified: { labelKey: "statusVerified", color: statusToneClass("verified"), icon: CheckCircle2 },
  confirmed: { labelKey: "statusConfirmed", color: statusToneClass("confirmed"), icon: CheckCircle2 },
  rejected: { labelKey: "statusRejected", color: statusToneClass("rejected"), icon: XCircle },
  cancelled: { labelKey: "statusCancelled", color: statusToneClass("cancelled"), icon: XCircle },
  completed: { labelKey: "statusCompleted", color: statusToneClass("completed"), icon: CheckCircle2 },
};

export default function BookingsPage() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [bookings, setBookings] = useState<DisplayBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPendingCount, setTotalPendingCount] = useState(0);
  const [totalConfirmedCount, setTotalConfirmedCount] = useState(0);
  // Declared up here with the other list state: every fetcher below writes it.
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({});
  // Rows paged from the server, per list. Not the list's length: each page also
  // pulls in the rest of every cart it touches, and those are not part of paging.
  const [pagedCount, setPagedCount] = useState(0);
  const [pagedFilteredCount, setPagedFilteredCount] = useState(0);
  // Every house of one cart; a single booking is a cart of one.
  const [detailTarget, setDetailTarget] = useState<DisplayBooking[] | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const openDetail = useCallback((cart: DisplayBooking[]) => {
    setDetailTarget(cart);
    setDetailDialogOpen(true);
  }, []);

  // Kept in step by the attachments panel itself, so adding or deleting one
  // updates the card badge behind the dialog without refetching the page.
  const handleAttachmentCountChange = useCallback((bookingId: string, count: number) => {
    setAttachmentCounts((prev) => ({ ...prev, [bookingId]: count }));
  }, []);

  // Store lookup maps so loadMore can reuse them
  const homestayMapRef = useRef<Record<string, string>>({});
  const roomMapRef = useRef<Record<string, string>>({});
  const homestayIdsRef = useRef<string[]>([]);
  // fetchBookings also runs after a quick booking is created, and ?booking= is
  // still in the URL then — without this the detail dialog would pop open on
  // top of the booking the host just made.
  const deepLinkHandledRef = useRef(false);

  const toDisplay = useCallback(
    (rows: BookingRow[]): DisplayBooking[] =>
      rows.map((b) => ({
        ...b,
        homestay_name: homestayMapRef.current[b.homestay_id] || "—",
        room_name: b.room_id ? roomMapRef.current[b.room_id] || "—" : "—",
      })),
    []
  );

  const [userId, setUserId] = useState<string | null>(null);
  const [hostName, setHostName] = useState<string | null>(null);
  const [hostPlanType, setHostPlanType] = useState<string | null>(null);
  const [quickBookingOpen, setQuickBookingOpen] = useState(false);
  const [quickBookingRooms, setQuickBookingRooms] = useState<{ id: string; name: string; price_per_night: number; max_guests: number }[]>([]);
  const [firstHomestayId, setFirstHomestayId] = useState<string | null>(null);

  // Filters (All tab only) — Pending/Confirmed tabs always read from `bookings`
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "all">("all");
  const searchActive = searchQuery.trim().length >= SEARCH_MIN_CHARS;
  const filtersActive = searchActive || statusFilter !== "all";
  const filtersDirty = searchInput.trim().length > 0 || statusFilter !== "all";
  const showSearchHint =
    searchInput.trim().length > 0 && searchInput.trim().length < SEARCH_MIN_CHARS;

  // Separate bookings list for the All tab when filters are active
  const [filteredBookings, setFilteredBookings] = useState<DisplayBooking[]>([]);
  const [filteredCount, setFilteredCount] = useState(0);
  const [hasMoreFiltered, setHasMoreFiltered] = useState(false);

  // Debounce searchInput → searchQuery
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchBookings = async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    // Get host
    const { data: hostRow } = await supabase
      .from("hosts")
      .select("id, name, plan_type")
      .eq("user_id", user.id)
      .single();
    const host = hostRow as { id: string; name: string; plan_type: string } | null;
    if (!host) {
      setLoading(false);
      return;
    }
    setHostName(host.name);
    setHostPlanType(host.plan_type);

    // Get homestays for this host
    const { data: homestayRows } = await supabase
      .from("homestays")
      .select("id, name")
      .eq("host_id", host.id);
    const homestays = (homestayRows as { id: string; name: string }[]) || [];
    if (homestays.length === 0) {
      setLoading(false);
      return;
    }

    const homestayIds = homestays.map((h) => h.id);
    const homestayMap = Object.fromEntries(homestays.map((h) => [h.id, h.name]));
    homestayIdsRef.current = homestayIds;
    homestayMapRef.current = homestayMap;

    // Parallel: rooms + counts + first page of bookings (all depend only on homestayIds)
    const [
      { data: roomRows },
      { count: total },
      { count: pendingCnt },
      { count: confirmedCnt },
      { data: bookingRows },
    ] = await Promise.all([
      supabase.from("rooms").select("id, name, price_per_night, max_guests").in("homestay_id", homestayIds),
      supabase.from("bookings").select("id", { count: "exact", head: true }).in("homestay_id", homestayIds),
      supabase.from("bookings").select("id", { count: "exact", head: true }).in("homestay_id", homestayIds).in("status", ["pending", "verified"]),
      supabase.from("bookings").select("id", { count: "exact", head: true }).in("homestay_id", homestayIds).eq("status", "confirmed"),
      supabase.from("bookings").select("*").in("homestay_id", homestayIds).order("created_at", { ascending: false }).range(0, PAGE_SIZE - 1),
    ]);

    const typedRooms = (roomRows as { id: string; name: string; price_per_night: number; max_guests: number }[]) || [];
    const roomMap = Object.fromEntries(typedRooms.map((r) => [r.id, r.name]));
    roomMapRef.current = roomMap;
    setQuickBookingRooms(typedRooms);
    if (homestayIds.length > 0) setFirstHomestayId(homestayIds[0]);

    setTotalCount(total || 0);
    setTotalPendingCount(pendingCnt || 0);
    setTotalConfirmedCount(confirmedCnt || 0);

    const pageRows = (bookingRows as unknown as BookingRow[]) || [];
    const rawRows = await withCartSiblings(pageRows, supabase);

    // Parallel: resolve slip URLs + fetch date change requests (independent)
    const bookingIds = rawRows.map((b) => b.id);
    const [rows, dcrResult, counts] = await Promise.all([
      resolveSlipUrls(rawRows, supabase),
      bookingIds.length > 0
        ? supabase.from("date_change_requests").select("id, booking_id, old_check_in, old_check_out, new_check_in, new_check_out, old_total_price, new_total_price, price_difference, status, requested_by, easyslip_verified, payment_slip_url, old_room_id, new_room_id").in("booking_id", bookingIds).eq("status", "pending")
        : Promise.resolve({ data: null }),
      fetchAttachmentCounts(bookingIds, supabase),
    ]);

    const displayed = toDisplay(rows);
    setBookings(displayed);
    setAttachmentCounts(counts);
    setPagedCount(pageRows.length);
    setHasMore(pageRows.length === PAGE_SIZE && pageRows.length < (total || 0));

    if (dcrResult.data) {
      const map: Record<string, DateChangeRequestRow> = {};
      for (const row of dcrResult.data as unknown as DateChangeRequestRow[]) {
        map[row.booking_id] = {
          ...row,
          old_room_name: row.old_room_id ? roomMapRef.current[row.old_room_id] || null : null,
          new_room_name: row.new_room_id ? roomMapRef.current[row.new_room_id] || null : null,
        };
      }
      setDateChangeRequests(map);
    }

    setLoading(false);

    /**
     * ?booking=<id> opens that booking's detail dialog — the landing spot for
     * the attachment badge on /dashboard/checkins, which has no dialog of its
     * own. Handled here rather than in its own effect so the open happens after
     * this function's awaits, alongside every other setState it makes.
     *
     * Read off window.location rather than useSearchParams(): that hook forces
     * a <Suspense> boundary at build time, which is a lot of machinery for a
     * value read exactly once on mount.
     */
    if (deepLinkHandledRef.current) return;
    const wanted = new URLSearchParams(window.location.search).get("booking");
    if (!wanted) return;
    deepLinkHandledRef.current = true;

    const loaded = groupIntoCarts(displayed).find((cart) => cart.some((b) => b.id === wanted));
    if (loaded) {
      openDetail(loaded);
      return;
    }

    // Older than the first page of 20 — fetch that one booking (and the rest of
    // its cart) rather than paging forward until it appears.
    const { data: single } = await supabase.from("bookings").select("*").eq("id", wanted).single();
    if (!single) return;
    const cartRows = await withCartSiblings([single as unknown as BookingRow], supabase);
    const withSlips = await resolveSlipUrls(cartRows, supabase);
    const deepCounts = await fetchAttachmentCounts(cartRows.map((b) => b.id), supabase);
    setAttachmentCounts((prev) => ({ ...prev, ...deepCounts }));
    openDetail(groupIntoCarts(toDisplay(withSlips))[0]);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch; setState calls occur after await boundaries
    fetchBookings();
  }, []);


  // Refetch the All-tab list when filters change (skips first run before bootstrap)
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true;
      // If user already changed filters before bootstrap finished, apply now.
      if (searchQuery.trim().length >= SEARCH_MIN_CHARS || statusFilter !== "all") {
        fetchAllTabBookings(searchQuery, statusFilter);
      }
      return;
    }
    fetchAllTabBookings(searchQuery, statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, statusFilter, loading]);

  const fetchAllTabBookings = async (
    search: string,
    status: BookingStatus | "all"
  ) => {
    if (homestayIdsRef.current.length === 0) return;
    const trimmed = search.trim();
    const useSearch = trimmed.length >= SEARCH_MIN_CHARS;
    const isFiltered = useSearch || status !== "all";
    if (!isFiltered) {
      setFilteredBookings([]);
      setFilteredCount(0);
      setPagedFilteredCount(0);
      setHasMoreFiltered(false);
      return;
    }
    setLoadingMore(true);
    const supabase = createClient();
    const sanitized = trimmed.replace(/[%,]/g, "");

    let query = supabase
      .from("bookings")
      .select("*", { count: "exact" })
      .in("homestay_id", homestayIdsRef.current);
    if (status !== "all") query = query.eq("status", status);
    if (useSearch && sanitized) {
      query = query.or(
        `guest_name.ilike.%${sanitized}%,guest_email.ilike.%${sanitized}%,guest_phone.ilike.%${sanitized}%`
      );
    }

    const { data, count } = await query
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1);

    const pageRows = (data as unknown as BookingRow[]) || [];
    const rows = await resolveSlipUrls(await withCartSiblings(pageRows, supabase), supabase);

    const bookingIds = rows.map((b) => b.id);
    const dcrResult = bookingIds.length > 0
      ? await supabase.from("date_change_requests").select("id, booking_id, old_check_in, old_check_out, new_check_in, new_check_out, old_total_price, new_total_price, price_difference, status, requested_by, easyslip_verified, payment_slip_url, old_room_id, new_room_id").in("booking_id", bookingIds).eq("status", "pending")
      : { data: null };

    // Merge, not replace: the unfiltered list stays mounted behind the filter,
    // and its badges are read from this same map.
    const counts = await fetchAttachmentCounts(bookingIds, supabase);
    setAttachmentCounts((prev) => ({ ...prev, ...counts }));

    setFilteredBookings(toDisplay(rows));
    setFilteredCount(count || 0);
    setPagedFilteredCount(pageRows.length);
    setHasMoreFiltered(pageRows.length === PAGE_SIZE && pageRows.length < (count || 0));

    if (dcrResult.data) {
      setDateChangeRequests((prev) => {
        const next = { ...prev };
        for (const row of dcrResult.data as unknown as DateChangeRequestRow[]) {
          next[row.booking_id] = {
            ...row,
            old_room_name: row.old_room_id ? roomMapRef.current[row.old_room_id] || null : null,
            new_room_name: row.new_room_id ? roomMapRef.current[row.new_room_id] || null : null,
          };
        }
        return next;
      });
    }

    setLoadingMore(false);
  };

  const loadMore = async () => {
    if (loadingMore) return;
    if (filtersActive ? !hasMoreFiltered : !hasMore) return;
    setLoadingMore(true);
    const supabase = createClient();
    const from = filtersActive ? pagedFilteredCount : pagedCount;
    const to = from + PAGE_SIZE - 1;
    const sanitized = searchQuery.trim().replace(/[%,]/g, "");

    let query = supabase
      .from("bookings")
      .select("*")
      .in("homestay_id", homestayIdsRef.current);
    if (filtersActive) {
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (searchActive && sanitized) {
        query = query.or(
          `guest_name.ilike.%${sanitized}%,guest_email.ilike.%${sanitized}%,guest_phone.ilike.%${sanitized}%`
        );
      }
    }

    const { data: bookingRows } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    const pageRows = (bookingRows as unknown as BookingRow[]) || [];
    const rawRows = await withCartSiblings(pageRows, supabase);
    const counts = await fetchAttachmentCounts(rawRows.map((b) => b.id), supabase);

    const rows = await resolveSlipUrls(rawRows, supabase);
    // Merge: the earlier pages are still on screen and still need their badges.
    setAttachmentCounts((prev) => ({
      ...prev,
      ...counts,
    }));
    const newBookings = toDisplay(rows);
    const end = from + pageRows.length;
    // mergeById: a house pulled in with an earlier page's cart comes back on its own page too.
    if (filtersActive) {
      setFilteredBookings((prev) => mergeById(prev, newBookings));
      setPagedFilteredCount(end);
      setHasMoreFiltered(pageRows.length === PAGE_SIZE && end < filteredCount);
    } else {
      setBookings((prev) => mergeById(prev, newBookings));
      setPagedCount(end);
      setHasMore(pageRows.length === PAGE_SIZE && end < totalCount);
    }
    setLoadingMore(false);
  };

  // Several ids when a cart's houses are completed together.
  const updateStatus = async (ids: string[], status: BookingStatus) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("bookings")
      .update({ status, updated_by: hostName || userId } as never)
      .in("id", ids);

    if (error) {
      toast.error(t("errorUpdate"));
      console.error("Update booking error:", error);
      return;
    }

    for (const id of ids) {
      const booking = bookings.find((b) => b.id === id);
      logClientEvent({
        homestay_id: booking?.homestay_id,
        entity_type: "booking",
        entity_id: id,
        event_type: status === "confirmed" ? "BOOKING_CONFIRMED" : status === "cancelled" ? "BOOKING_CANCELLED" : "CHECKOUT",
        data: { previous_status: booking?.status, new_status: status },
      });
    }

    setBookings((prev) =>
      prev.map((b) => (ids.includes(b.id) ? { ...b, status } : b))
    );
    toast.success(
      status === "confirmed" ? t("confirm") + "!" :
      status === "completed" ? t("markCompleted") + "!" :
      t("cancel") + "!"
    );
  };

  const confirmedCount = bookings.filter((b) => b.status === "confirmed").length;
  const pendingCount = bookings.filter((b) => b.status === "pending" || b.status === "verified").length;

  const getTabTotal = (tab: "all" | "pending" | "confirmed") => {
    if (tab === "all") return totalCount;
    if (tab === "pending") return totalPendingCount;
    return totalConfirmedCount;
  };

  const [cancelTarget, setCancelTarget] = useState<DisplayBooking | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  // Every confirmed house of the cart that is past check-out.
  const [completeTarget, setCompleteTarget] = useState<DisplayBooking[] | null>(null);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  // Date change state
  const [dateChangeRequests, setDateChangeRequests] = useState<Record<string, DateChangeRequestRow>>({});
  const [submittingDateChange, setSubmittingDateChange] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<DateChangeRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // A cart is confirmed or cancelled as one (the API cascades to every room and
  // returns their ids), so apply the result to each of them — in the tab list
  // and in a search/filter view alike.
  const applyStatus = (ids: string[], patch: Partial<DisplayBooking>) => {
    const update = (list: DisplayBooking[]) => list.map((b) => (ids.includes(b.id) ? { ...b, ...patch } : b));
    setBookings(update);
    setFilteredBookings(update);
  };

  const handleCancelClick = (booking: DisplayBooking) => {
    setCancelTarget(booking);
    setCancelReason("");
    setCancelDialogOpen(true);
  };

  const handleCompleteClick = (houses: DisplayBooking[]) => {
    setCompleteTarget(houses);
    setCompleteDialogOpen(true);
  };

  const handleConfirmComplete = async () => {
    if (!completeTarget) return;
    await updateStatus(completeTarget.map((b) => b.id), "completed");
    setCompleteDialogOpen(false);
    setCompleteTarget(null);
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch("/api/bookings/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: cancelTarget.id,
          status: "cancelled",
          reason: cancelReason.trim() || undefined,
          locale,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t("errorUpdate"));
        return;
      }
      const ids: string[] = data.member_ids ?? [cancelTarget.id];
      applyStatus(ids, { status: "cancelled" as BookingStatus, cancelled_by: hostName || "host" });
      toast.success(ids.length > 1 ? t("groupCancelled", { count: ids.length }) : t("cancel") + "!");
    } catch {
      toast.error(t("errorUpdate"));
    } finally {
      setUpdatingStatus(false);
    }
    setCancelDialogOpen(false);
    setCancelTarget(null);
    setCancelReason("");
  };

  const handleApproveDateChange = async (dcr: DateChangeRequestRow) => {
    setSubmittingDateChange(true);
    try {
      const res = await fetch("/api/bookings/change-dates/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: dcr.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "DATES_UNAVAILABLE") {
          toast.error(t("dateChangeDatesUnavailable"));
        } else if (data.error === "DATES_BLOCKED") {
          toast.error(t("dateChangeDatesBlocked"));
        } else {
          toast.error(data.error || t("dateChangeApproveFailed"));
        }
        return;
      }
      toast.success(t("dateChangeApproved"));
      // Update local state
      setBookings((prev) =>
        prev.map((b) =>
          b.id === dcr.booking_id
            ? { ...b, check_in: dcr.new_check_in, check_out: dcr.new_check_out, total_price: dcr.new_total_price }
            : b
        )
      );
      setDateChangeRequests((prev) => {
        const next = { ...prev };
        delete next[dcr.booking_id];
        return next;
      });
      logClientEvent({
        homestay_id: bookings.find((b) => b.id === dcr.booking_id)?.homestay_id,
        entity_type: "booking",
        entity_id: dcr.booking_id,
        event_type: "BOOKING_DATE_CHANGE_APPROVED",
        data: { request_id: dcr.id },
      });
    } catch {
      toast.error(t("dateChangeApproveFailed"));
    } finally {
      setSubmittingDateChange(false);
    }
  };

  const handleRejectDateChange = async () => {
    if (!rejectTarget) return;
    setSubmittingDateChange(true);
    try {
      const res = await fetch("/api/bookings/change-dates/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: rejectTarget.id, reason: rejectReason.trim() || undefined }),
      });
      if (!res.ok) {
        toast.error(t("dateChangeRejectFailed"));
        return;
      }
      toast.success(t("dateChangeRejected"));
      setDateChangeRequests((prev) => {
        const next = { ...prev };
        delete next[rejectTarget.booking_id];
        return next;
      });
      logClientEvent({
        homestay_id: bookings.find((b) => b.id === rejectTarget.booking_id)?.homestay_id,
        entity_type: "booking",
        entity_id: rejectTarget.booking_id,
        event_type: "BOOKING_DATE_CHANGE_REJECTED",
        data: { request_id: rejectTarget.id, reason: rejectReason.trim() || undefined },
      });
    } catch {
      toast.error(t("dateChangeRejectFailed"));
    } finally {
      setSubmittingDateChange(false);
      setRejectDialogOpen(false);
      setRejectTarget(null);
      setRejectReason("");
    }
  };

  // Shared by a card's header and its house lines: a cart shows these once while
  // its houses agree, and on each house once they drift apart (housesDiffer).
  const renderStatusBadges = (b: DisplayBooking) => {
    const config = statusConfig[b.status];
    const StatusIcon = config.icon;
    return (
      <>
        <Badge variant="secondary" className={config.color}>
          <StatusIcon className="mr-1 h-3 w-3" />
          {t(config.labelKey)}
        </Badge>
        {b.status === "cancelled" && b.cancelled_by && (
          <Badge variant="secondary" className={`${statusToneClass("cancelled")} text-[11px]`}>
            {b.cancelled_by === b.guest_name ? t("cancelledByGuest") : t("cancelledByHost")}
          </Badge>
        )}
      </>
    );
  };

  const renderStayBadges = (b: DisplayBooking) => (
    <>
      {b.checked_in_at && (
        <Badge variant="secondary" className={statusToneClass("active")}>
          <CheckCircle2 className="mr-1 h-3 w-3" />
          {t("guestCheckedIn")}
        </Badge>
      )}
      {b.checked_out_at && (
        <Badge variant="secondary" className={statusToneClass("completed")}>
          <CheckCircle2 className="mr-1 h-3 w-3" />
          {t("guestCheckedOut")}
        </Badge>
      )}
    </>
  );

  const renderDates = (b: DisplayBooking) => (
    <span className="flex items-center gap-1">
      <CalendarDays className="h-3.5 w-3.5" />
      {fmtDateStr(b.check_in, "d MMM yyyy", locale)} → {fmtDateStr(b.check_out, "d MMM yyyy", locale)}
    </span>
  );

  // Pending date change request banner. Requests are per house, so a cart shows
  // each one under its own house.
  const renderDateChange = (booking: DisplayBooking) =>
    dateChangeRequests[booking.id] && (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 mt-1">
        <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700 mb-1">
          <ArrowRightLeft className="h-3.5 w-3.5" />
          {t("dateChangeRequest")}
          <span className="text-blue-500 font-normal">({dateChangeRequests[booking.id].requested_by})</span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-blue-600 mb-2">
          <span>{t("dateChangeFrom")}: {fmtDateStr(dateChangeRequests[booking.id].old_check_in, "d MMM yyyy", locale)}</span>
          <span>{t("dateChangeTo")}: {fmtDateStr(dateChangeRequests[booking.id].new_check_in, "d MMM yyyy", locale)} → {fmtDateStr(dateChangeRequests[booking.id].new_check_out, "d MMM yyyy", locale)}</span>
          {dateChangeRequests[booking.id].old_room_id && dateChangeRequests[booking.id].new_room_id && dateChangeRequests[booking.id].old_room_id !== dateChangeRequests[booking.id].new_room_id && (
            <span>{t("dateChangeRoom")}: {dateChangeRequests[booking.id].old_room_name ?? "—"} → {dateChangeRequests[booking.id].new_room_name ?? "—"}</span>
          )}
          {dateChangeRequests[booking.id].price_difference !== 0 && (
            <span className={dateChangeRequests[booking.id].price_difference > 0 ? "text-red-600 font-medium" : "text-green-600 font-medium"}>
              {t("dateChangePriceDiff")}: {dateChangeRequests[booking.id].price_difference > 0 ? "+" : ""}฿{dateChangeRequests[booking.id].price_difference.toLocaleString()}
            </span>
          )}
          {dateChangeRequests[booking.id].easyslip_verified && (
            <Badge variant="secondary" className="bg-brand-50 text-brand text-[10px] py-0">
              <ShieldCheck className="mr-0.5 h-2.5 w-2.5" />
              {t("dateChangeSlipVerified")}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 hover:brightness-90 text-white bg-brand"
            onClick={() => handleApproveDateChange(dateChangeRequests[booking.id])}
            disabled={submittingDateChange}
          >
            {submittingDateChange ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
            {t("dateChangeApprove")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => {
              setRejectTarget(dateChangeRequests[booking.id]);
              setRejectReason("");
              setRejectDialogOpen(true);
            }}
            disabled={submittingDateChange}
          >
            <XCircle className="mr-1 h-3 w-3" />
            {t("dateChangeReject")}
          </Button>
        </div>
      </div>
    );

  // The open popup's cart. Its first house carries what the houses share:
  // guest, slip, homestay.
  const detail = detailTarget?.[0] ?? null;
  const detailIsGroup = (detailTarget?.length ?? 0) > 1;
  const detailPerHouse = housesDiffer(detailTarget ?? []);
  const detailMoney = cartMoney(detailTarget ?? []);
  const { pending: detailPending, completable: detailCompletable } = cartActionTargets(detailTarget ?? [], new Date());

  if (loading) {
    return (
      <div>
        <Skeleton className="h-7 w-48 mb-6" />
        <Skeleton className="h-10 w-80 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <Skeleton className="h-20 w-20 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-earth-900">{t("allBookings")}</h1>
        {firstHomestayId && quickBookingRooms.length > 0 && (
          <Button
            size="sm"
            className="rounded-full bg-brand text-white hover:brightness-90"
            onClick={() => setQuickBookingOpen(true)}
          >
            <Zap className="mr-1.5 h-4 w-4" />
            {t("quickBooking")}
          </Button>
        )}
      </div>

      {firstHomestayId && (
        <QuickBookingDialog
          open={quickBookingOpen}
          onOpenChange={setQuickBookingOpen}
          homestayId={firstHomestayId}
          rooms={quickBookingRooms}
          onSuccess={() => fetchBookings()}
        />
      )}

      <Tabs defaultValue="all">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="all">
              {t("allBookings")} ({filtersActive ? filteredCount : totalCount})
            </TabsTrigger>
            <TabsTrigger value="pending">
              {t("pending")} ({totalPendingCount + Object.keys(dateChangeRequests).filter(bid => { const b = bookings.find(bk => bk.id === bid); return b && b.status !== "pending" && b.status !== "verified"; }).length})
            </TabsTrigger>
            <TabsTrigger value="confirmed">
              {t("confirmedTab")} ({totalConfirmedCount})
            </TabsTrigger>
          </TabsList>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex flex-col gap-1 sm:max-w-xs sm:flex-1">
              <Input
                type="search"
                placeholder={t("searchGuestPlaceholder")}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              {showSearchHint && (
                <p className="text-xs text-earth-600">{t("searchMinCharsHint")}</p>
              )}
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as BookingStatus | "all")}
            >
              <SelectTrigger className="sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filterAllStatuses")}</SelectItem>
                <SelectItem value="pending">{t("statusPending")}</SelectItem>
                <SelectItem value="verified">{t("statusVerified")}</SelectItem>
                <SelectItem value="confirmed">{t("statusConfirmed")}</SelectItem>
                <SelectItem value="rejected">{t("statusRejected")}</SelectItem>
                <SelectItem value="cancelled">{t("statusCancelled")}</SelectItem>
                <SelectItem value="completed">{t("statusCompleted")}</SelectItem>
              </SelectContent>
            </Select>
            {filtersDirty && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchInput("");
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
              >
                {t("clearFilters")}
              </Button>
            )}
          </div>
        </div>

        {(["all", "pending", "confirmed"] as const).map((tab) => {
          const sourceList = filtersActive ? filteredBookings : bookings;
          // A cart shows in a tab when any of its houses belongs there, and always whole.
          const carts = groupIntoCarts(sourceList).filter((cart) =>
            cart.some(
              (b) => tab === "all" || b.status === tab || (tab === "pending" && b.status === "verified") || (tab === "pending" && dateChangeRequests[b.id])
            )
          );
          return (
            <TabsContent key={tab} value={tab} className="mt-4 space-y-3">
              {carts.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-earth-200 py-12 text-center">
                  <CalendarDays className="h-10 w-10 text-earth-300" />
                  <p className="mt-3 text-sm font-medium text-earth-600">
                    {filtersActive ? t("noFilterResults") : t("noBookings")}
                  </p>
                </div>
              ) : (
                <>
                {carts.map((cart) => {
                  // The first house carries what a cart's houses share: guest,
                  // slip, homestay, source.
                  const booking = cart[0];
                  const isGroup = cart.length > 1;
                  const perHouse = housesDiffer(cart);
                  const money = cartMoney(cart);
                  const { pending, confirmed, completable } = cartActionTargets(cart, new Date());
                  const attachmentCount = cart.reduce((n, b) => n + (attachmentCounts[b.id] ?? 0), 0);

                  return (
                    <Card key={booking.group_id ?? booking.id} className="overflow-hidden py-0 gap-0">
                      <div className="flex">
                        {/* Slip image — full left side */}
                        <div className="relative w-28 shrink-0 sm:w-36">
                          {booking.payment_slip_url ? (
                            <button
                              className="group relative h-full w-full overflow-hidden"
                              onClick={() => openDetail(cart)}
                            >
                              <Image
                                src={booking.payment_slip_url}
                                alt="Payment slip"
                                fill
                                sizes="144px"
                                className="object-cover transition-opacity group-hover:opacity-75"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                                <Eye className="h-5 w-5 text-white" />
                              </div>
                            </button>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-earth-100">
                              <ImageIcon className="h-6 w-6 text-earth-300" />
                              <span className="sr-only">{t("noSlip")}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-1 min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-start">
                          <div className="flex-1 min-w-0 space-y-1">
                            <h3 className="font-semibold text-earth-900">
                              {booking.guest_name}
                            </h3>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {!perHouse && renderStatusBadges(booking)}
                              {booking.group_id && (
                                <Badge variant="secondary" className="bg-indigo-50 text-indigo-700">
                                  {t("groupBadge")}
                                </Badge>
                              )}
                              {booking.booking_source && booking.booking_source !== "guest" ? (
                                <Badge
                                  variant="secondary"
                                  className="bg-indigo-50 text-indigo-600"
                                >
                                  ⚡ {t(`source${booking.booking_source.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("")}` as Parameters<typeof t>[0])}
                                </Badge>
                              ) : booking.easyslip_verified ? (
                                <Badge
                                  variant="secondary"
                                  className="bg-brand/5 text-brand"
                                >
                                  ✓ {t("paymentVerified")}
                                </Badge>
                              ) : null}
                              {isQuickPending(booking) && (
                                <Badge variant="secondary" className="bg-amber-50 text-amber-700">
                                  <MessageCircle className="mr-1 h-3 w-3" />
                                  {t("quickPendingBadge")}
                                </Badge>
                              )}
                              {!perHouse && renderStayBadges(booking)}
                              {/* Cart totals: a cart's deposit is split across its
                                  houses by price, so one house's share means nothing. */}
                              {money.deposit && money.paid < money.total ? (
                                <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                                  {t("paymentDeposit")}
                                </Badge>
                              ) : money.paid >= money.total ? (
                                <Badge variant="secondary" className="bg-brand-50 text-brand">
                                  {t("paymentFull")}
                                </Badge>
                              ) : null}
                              {/* The half that actually solves forgetting: the
                                  host sees at a glance that this booking has
                                  agreed requests sitting behind it. */}
                              {attachmentCount > 0 && (
                                <Badge
                                  variant="secondary"
                                  className="bg-slate-100 text-slate-700"
                                  title={t("attachmentsTitle")}
                                >
                                  <Paperclip className="mr-1 h-3 w-3" />
                                  {attachmentCount}
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-earth-600">
                              <span className="flex items-center gap-1">
                                <Home className="h-3.5 w-3.5" />
                                {booking.homestay_name}
                              </span>
                              {!isGroup && <span>{booking.room_name}</span>}
                              {!perHouse && renderDates(booking)}
                              <span className="font-medium text-brand">
                                ฿{money.total.toLocaleString()}
                              </span>
                              {money.paid < money.total && (
                                <span className="font-medium text-amber-600">
                                  {t("balanceDue", { amount: (money.total - money.paid).toLocaleString() })}
                                </span>
                              )}
                              {booking.guest_province && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5" />
                                  {getProvinceLabel(booking.guest_province, locale)}
                                </span>
                              )}
                            </div>
                            {isGroup && (
                              <ul className="space-y-1 text-sm text-earth-800">
                                {cart.map((b) => (
                                  <li key={b.id}>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                      <span className="font-medium">• {b.room_name}</span>
                                      {perHouse && (
                                        <>
                                          <span className="text-earth-600">{renderDates(b)}</span>
                                          {renderStatusBadges(b)}
                                          {renderStayBadges(b)}
                                        </>
                                      )}
                                    </div>
                                    {renderDateChange(b)}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <p className="text-xs text-earth-600">
                              ID: {(booking.group_id ?? booking.id).slice(0, 8)}… ·{" "}
                              {booking.guest_email} · {booking.guest_phone}
                            </p>

                            {!isGroup && renderDateChange(booking)}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openDetail(cart)}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" />
                              {t("viewDetails")}
                            </Button>
                            {/* update-status cascades to every house, so one eligible house is enough. */}
                            {pending && (
                              <>
                                <Button
                                  size="sm"
                                  className="hover:brightness-90 bg-brand"
                                  onClick={async () => {
                                    setUpdatingStatus(true);
                                    try {
                                      const res = await fetch("/api/bookings/update-status", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          booking_id: pending.id,
                                          status: "confirmed",
                                          locale,
                                        }),
                                      });
                                      const data = await res.json();
                                      if (!res.ok) {
                                        toast.error(data.error || t("errorUpdate"));
                                        return;
                                      }
                                      const ids: string[] = data.member_ids ?? [pending.id];
                                      applyStatus(ids, { status: "confirmed" as BookingStatus });
                                      toast.success(ids.length > 1 ? t("groupConfirmed", { count: ids.length }) : t("confirm") + "!");
                                    } catch {
                                      toast.error(t("errorUpdate"));
                                    } finally {
                                      setUpdatingStatus(false);
                                    }
                                  }}
                                  disabled={updatingStatus}
                                >
                                  {t("confirm")}
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleCancelClick(pending)}
                                >
                                  {t("cancel")}
                                </Button>
                              </>
                            )}
                            {confirmed && (
                              <>
                                {completable.length > 0 && (
                                  <Button
                                    size="sm"
                                    className="hover:brightness-90 text-white bg-brand"
                                    onClick={() => handleCompleteClick(completable)}
                                  >
                                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                    {t("markCompleted")}
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCancelClick(confirmed)}
                                >
                                  {t("cancel")}
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}

                {/* Load More */}
                {tab === "all" && (filtersActive ? hasMoreFiltered : hasMore) && (
                  <div className="flex flex-col items-center gap-2 pt-4">
                    <p className="text-xs text-earth-600">
                      {t("showingCount", {
                        count: filtersActive ? pagedFilteredCount : pagedCount,
                        total: filtersActive ? filteredCount : totalCount,
                      })}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          {t("loadingMore")}
                        </>
                      ) : (
                        t("loadMore")
                      )}
                    </Button>
                  </div>
                )}
                </>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Booking detail dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {t("bookingDetails")}
              {detail && !detailPerHouse && (
                <Badge
                  variant="secondary"
                  className={statusConfig[detail.status].color}
                >
                  {React.createElement(statusConfig[detail.status].icon, { className: "mr-1 h-3 w-3" })}
                  {t(statusConfig[detail.status].labelKey)}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {detailTarget && detail && (
            <div className="space-y-4">
              {/* Payment Slip: one slip pays for the whole cart */}
              {detail.payment_slip_url ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-earth-800 flex items-center gap-1.5">
                      <CreditCard className="h-4 w-4" />
                      {t("paymentSlip")}
                    </h4>
                    {detail.easyslip_verified ? (
                      <Badge variant="secondary" className="bg-brand/5 text-brand">
                        <ShieldCheck className="mr-1 h-3 w-3" />
                        {t("paymentVerified")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-amber-50 text-amber-700">
                        <ShieldAlert className="mr-1 h-3 w-3" />
                        {t("paymentPending")}
                      </Badge>
                    )}
                  </div>
                  <div className="rounded-lg border bg-earth-50 p-2">
                    <Image
                      src={detail.payment_slip_url}
                      alt="Payment slip"
                      width={400}
                      height={320}
                      className="mx-auto max-h-80 rounded-lg object-contain"
                    />
                  </div>
                </div>
              ) : isQuickPending(detail) ? (
                <div role="note" className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {t("quickPendingHint")}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-earth-200 p-4 text-sm text-earth-600">
                  <ImageIcon className="h-5 w-5" />
                  {t("noSlip")}
                </div>
              )}

              {/* Attachments are saved per house, so a cart gets one panel per house. */}
              {detailTarget.map((b) => (
                <div key={b.id}>
                  {detailIsGroup && (
                    <p className="mb-1 text-xs font-medium text-earth-600">{b.room_name}</p>
                  )}
                  <BookingAttachments
                    bookingId={b.id}
                    onCountChange={handleAttachmentCountChange}
                  />
                </div>
              ))}

              {/* Booking Info */}
              <div className="rounded-lg border bg-earth-50 p-4 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-earth-600" />
                  <span className="font-medium text-earth-900">{detail.guest_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-earth-600" />
                  <span className="text-earth-700">{detail.guest_email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-earth-600" />
                  <span className="text-earth-700">{detail.guest_phone}</span>
                </div>
                {detail.guest_province && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-earth-600" />
                    <span className="text-earth-700">{getProvinceLabel(detail.guest_province, locale)}</span>
                  </div>
                )}
                <div className="border-t border-earth-200 pt-2 mt-2 space-y-1">
                  {detailIsGroup && !detailPerHouse && (
                    <div className="flex justify-between">
                      <span className="text-earth-600">{t("dates")}</span>
                      <span>{fmtDateStr(detail.check_in, "d MMM yyyy", locale)} → {fmtDateStr(detail.check_out, "d MMM yyyy", locale)}</span>
                    </div>
                  )}
                  {detailTarget.map((b) => (
                    <div key={b.id} className={detailIsGroup ? "space-y-1 pt-1" : "space-y-1"}>
                      {detailIsGroup ? (
                        // The house's own price: total_price carries its share of
                        // the cart promo, which the discount line takes off once.
                        <div className="flex justify-between font-medium text-earth-900">
                          <span>{b.room_name}</span>
                          <span>฿{(b.total_price + (b.discount_amount ?? 0)).toLocaleString()}</span>
                        </div>
                      ) : (
                        <div className="flex justify-between">
                          <span className="text-earth-600">{t("room")}</span>
                          <span className="font-medium">{b.room_name}</span>
                        </div>
                      )}
                      {detailPerHouse && (
                        <div className="flex flex-wrap gap-1.5">
                          {renderStatusBadges(b)}
                          {renderStayBadges(b)}
                        </div>
                      )}
                      {(!detailIsGroup || detailPerHouse) && (
                        <div className="flex justify-between">
                          <span className="text-earth-600">{t("dates")}</span>
                          <span>{fmtDateStr(b.check_in, "d MMM yyyy", locale)} → {fmtDateStr(b.check_out, "d MMM yyyy", locale)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-earth-600">{t("guests")}</span>
                        {/* Headcount always leads: in stepper mode the label names only the
                            EXTRA guests, so showing it alone would hide the real party size. */}
                        <span>{b.num_guests}{b.guest_pricing_label ? ` (${b.guest_pricing_label})` : ""}</span>
                      </div>
                      {b.selected_options && b.selected_options.length > 0 && (
                        <div>
                          <span className="text-earth-600">{t("options")}</span>
                          <div className="mt-1 space-y-0.5">
                            {b.selected_options.map((o: { name: string; price: number }, i: number) => (
                              <div key={i} className="flex justify-between text-xs">
                                <span className="text-earth-700">{o.name}</span>
                                <span className="font-medium text-brand">+฿{o.price.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {/* Cart totals: a cart's deposit is split across its houses by
                      price, so one house's share means nothing to the host. */}
                  {detailMoney.discount > 0 && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-earth-600">{t("subtotal")}</span>
                        <span className="font-medium text-earth-900">฿{(detailMoney.total + detailMoney.discount).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-emerald-700">{t("promoDiscount")}</span>
                        <span className="font-medium text-emerald-700">−฿{detailMoney.discount.toLocaleString()}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-earth-600">{t("total")}</span>
                    <span className="font-bold text-brand">฿{detailMoney.total.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-earth-600">{t("amountPaid")}</span>
                    <span className="font-medium text-earth-900">฿{detailMoney.paid.toLocaleString()}</span>
                  </div>
                  {detailMoney.paid < detailMoney.total && (
                    <div className="flex justify-between">
                      <span className="text-amber-600">{t("balanceDue", { amount: "" }).replace(/[:\s฿]+$/, "")}</span>
                      <span className="font-medium text-amber-600">฿{(detailMoney.total - detailMoney.paid).toLocaleString()}</span>
                    </div>
                  )}
                </div>
                {/* A cart goes by its group id, the one the guest's email and the host's LINE message show. */}
                <p className="text-xs text-earth-600 pt-1">ID: {detail.group_id ?? detail.id}</p>
              </div>

              {/* Action buttons */}
              {detailPending && (
                <DialogFooter className="gap-2">
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setDetailDialogOpen(false);
                      handleCancelClick(detailPending);
                    }}
                  >
                    {t("cancel")}
                  </Button>
                  <Button
                    className="hover:brightness-90 bg-brand"
                    disabled={updatingStatus}
                    onClick={async () => {
                      if (detailPending.status === "pending" || detailPending.status === "verified") {
                        setUpdatingStatus(true);
                        try {
                          const res = await fetch("/api/bookings/update-status", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              booking_id: detailPending.id,
                              status: "confirmed",
                              locale,
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            toast.error(data.error || t("errorUpdate"));
                            return;
                          }
                          const ids: string[] = data.member_ids ?? [detailPending.id];
                          applyStatus(ids, { status: "confirmed" as BookingStatus });
                          setDetailTarget((prev) => prev && prev.map((b) => (ids.includes(b.id) ? { ...b, status: "confirmed" as BookingStatus } : b)));
                          toast.success(ids.length > 1 ? t("groupConfirmed", { count: ids.length }) : t("confirm") + "!");
                        } catch {
                          toast.error(t("errorUpdate"));
                        } finally {
                          setUpdatingStatus(false);
                        }
                      } else {
                        await updateStatus([detailPending.id], "confirmed");
                        setDetailTarget((prev) => prev && prev.map((b) => (b.id === detailPending.id ? { ...b, status: "confirmed" as BookingStatus } : b)));
                      }
                      setDetailDialogOpen(false);
                    }}
                  >
                    {t("confirm")}
                  </Button>
                </DialogFooter>
              )}
              {detailCompletable.length > 0 && (
                <DialogFooter>
                  <Button
                    className="hover:brightness-90 text-white bg-brand"
                    onClick={() => {
                      setDetailDialogOpen(false);
                      handleCompleteClick(detailCompletable);
                    }}
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                    {t("markCompleted")}
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              {t("cancelConfirmTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("cancelConfirmDesc", { guest: cancelTarget?.guest_name || "" })}
            </DialogDescription>
          </DialogHeader>
          {hostPlanType === "commission" && cancelTarget?.status === "confirmed" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-xs text-amber-800">{t("cancelCommissionNotice")}</p>
            </div>
          )}
          {cancelTarget?.group_id && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5">
              <p className="text-xs text-indigo-800">{t("groupCancelNote")}</p>
            </div>
          )}
          <div>
            <Label htmlFor="cancel-reason">{t("cancelReason")}</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t("cancelReasonPlaceholder")}
              rows={2}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-earth-600">{t("cancelReasonHint")}</p>
          </div>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={updatingStatus}
            >
              {t("cancelKeep")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={updatingStatus}
            >
              {updatingStatus && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t("cancelConfirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Date change reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              {t("dateChangeReject")}
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label>{t("dateChangeRejectReason")}</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t("dateChangeRejectReasonPlaceholder")}
              rows={2}
              className="mt-1"
            />
          </div>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => { setRejectDialogOpen(false); setRejectTarget(null); }}
              disabled={submittingDateChange}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectDateChange}
              disabled={submittingDateChange}
            >
              {submittingDateChange && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t("dateChangeReject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete confirmation dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-brand" />
              {t("completeConfirmTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("completeConfirmDesc", { guest: completeTarget?.[0]?.guest_name || "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setCompleteDialogOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              className="hover:brightness-90 text-white bg-brand"
              onClick={handleConfirmComplete}
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              {t("completeConfirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
