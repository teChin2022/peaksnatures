"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
  isToday,
  startOfWeek,
  endOfWeek,
  parseISO,
  isBefore,
  startOfDay,
} from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { useUserRole } from "@/components/dashboard/dashboard-shell";
import { fmtDate, fmtDateStr } from "@/lib/format-date";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Ban,
  Unlock,
  Loader2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useThemeColor } from "@/components/dashboard/theme-context";
import type { BookingStatus } from "@/types/database";

interface BookingRow {
  id: string;
  homestay_id: string;
  room_id: string | null;
  guest_name: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  total_price: number;
  amount_paid: number;
  payment_type: string;
  status: BookingStatus;
}

interface BlockedDateRow {
  id: string;
  homestay_id: string;
  date: string;
  reason: string | null;
  room_id: string | null;
}

type BookingPosition = "start" | "middle" | "end" | "single";

interface DayBookingInfo {
  booking: BookingRow;
  position: BookingPosition;
}

interface DayInfo {
  date: Date;
  dateStr: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isBlocked: boolean;
  blockedReason: string | null;
  bookings: DayBookingInfo[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

export default function CalendarPage() {
  const t = useTranslations("dashboardCalendar");
  const themeColor = useThemeColor();

  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [homestayId, setHomestayId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDateRow[]>([]);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [unblockDialogOpen, setUnblockDialogOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [roomMap, setRoomMap] = useState<Record<string, string>>({});
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([]);
  const [locale, setLocale] = useState("en");
  const [detailDay, setDetailDay] = useState<DayInfo | null>(null);
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>("all");

  // Detect locale
  useEffect(() => {
    const html = document.documentElement.lang;
    if (html === "th") setLocale("th");
  }, []);

  const { role, hostId: contextHostId } = useUserRole();
  const isAssistant = role === "assistant";

  // Fetch data
  const fetchData = useCallback(async () => {
    if (role === null) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    let hostQuery = supabase.from("hosts").select("id");
    if (isAssistant && contextHostId) {
      hostQuery = hostQuery.eq("id", contextHostId);
    } else {
      hostQuery = hostQuery.eq("user_id", user.id);
    }
    const { data: hostRow } = await hostQuery.maybeSingle();
    const host = hostRow as { id: string } | null;
    if (!host) {
      setLoading(false);
      return;
    }

    const { data: homestayRow } = await supabase
      .from("homestays")
      .select("id")
      .eq("host_id", host.id)
      .limit(1)
      .single();
    const homestay = homestayRow as { id: string } | null;
    if (!homestay) {
      setLoading(false);
      return;
    }

    setHomestayId(homestay.id);

    // Fetch rooms for name lookup
    const { data: roomRows } = await supabase
      .from("rooms")
      .select("id, name")
      .eq("homestay_id", homestay.id);
    const roomList = (roomRows as { id: string; name: string }[]) || [];
    const rMap = Object.fromEntries(
      roomList.map((r) => [r.id, r.name])
    );
    setRoomMap(rMap);
    setRooms(roomList);

    // Fetch bookings (non-cancelled)
    const { data: bookingRows } = await supabase
      .from("bookings")
      .select("id, homestay_id, room_id, guest_name, check_in, check_out, num_guests, total_price, amount_paid, payment_type, status")
      .eq("homestay_id", homestay.id)
      .not("status", "in", '("cancelled","rejected")')
      .order("check_in", { ascending: true });
    setBookings((bookingRows as unknown as BookingRow[]) || []);

    // Fetch blocked dates
    const { data: blockedRows } = await supabase
      .from("blocked_dates")
      .select("*")
      .eq("homestay_id", homestay.id);
    setBlockedDates((blockedRows as unknown as BlockedDateRow[]) || []);

    setLoading(false);
  }, [role, isAssistant, contextHostId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build blocked date set (filtered by selected room)
  const blockedDateMap = useMemo(() => {
    const map = new Map<string, BlockedDateRow>();
    blockedDates.forEach((bd) => {
      if (selectedRoomFilter === "all") {
        // Show all blocks: homestay-wide + any room-specific
        // If multiple blocks exist for the same date, homestay-wide takes priority
        const existing = map.get(bd.date);
        if (!existing || bd.room_id === null) {
          map.set(bd.date, bd);
        }
      } else {
        // Show blocks that apply to the selected room:
        // homestay-wide (room_id=null) OR matching room_id
        if (bd.room_id === null || bd.room_id === selectedRoomFilter) {
          const existing = map.get(bd.date);
          if (!existing || bd.room_id === null) {
            map.set(bd.date, bd);
          }
        }
      }
    });
    return map;
  }, [blockedDates, selectedRoomFilter]);

  // Build booking date map (date string -> bookings with position info)
  const bookingDateMap = useMemo(() => {
    const map = new Map<string, DayBookingInfo[]>();
    bookings.forEach((b) => {
      try {
        const start = parseISO(b.check_in);
        const end = parseISO(b.check_out);
        const days = eachDayOfInterval({ start, end });
        const lastIdx = days.length - 1;
        days.forEach((d, idx) => {
          const key = format(d, "yyyy-MM-dd");
          const existing = map.get(key) || [];
          let position: BookingPosition;
          if (lastIdx === 0) position = "single";
          else if (idx === 0) position = "start";
          else if (idx === lastIdx) position = "end";
          else position = "middle";
          existing.push({ booking: b, position });
          map.set(key, existing);
        });
      } catch {
        // Skip malformed dates
      }
    });
    return map;
  }, [bookings]);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    const today = startOfDay(new Date());

    const days = eachDayOfInterval({ start: calStart, end: calEnd });
    return days.map((date): DayInfo => {
      const dateStr = format(date, "yyyy-MM-dd");
      const blocked = blockedDateMap.get(dateStr);
      return {
        date,
        dateStr,
        isCurrentMonth: isSameMonth(date, currentMonth),
        isToday: isToday(date),
        isPast: isBefore(date, today),
        isBlocked: !!blocked,
        blockedReason: blocked?.reason || null,
        bookings: bookingDateMap.get(dateStr) || [],
      };
    });
  }, [currentMonth, blockedDateMap, bookingDateMap]);

  // Stats for current month
  const monthStats = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    let booked = 0;
    let blocked = 0;
    daysInMonth.forEach((d) => {
      const key = format(d, "yyyy-MM-dd");
      if (blockedDateMap.has(key)) blocked++;
      else if (bookingDateMap.has(key)) booked++;
    });
    const total = daysInMonth.length;
    const available = total - booked - blocked;
    const pct = Math.round((available / total) * 100);
    return { booked, blocked, available, total, pct };
  }, [currentMonth, blockedDateMap, bookingDateMap]);

  // Selection handling
  const toggleDateSelection = (dateStr: string, dayInfo: DayInfo) => {
    // If the date has bookings, open the detail modal instead of toggling selection
    if (dayInfo.bookings.length > 0 && dayInfo.isCurrentMonth) {
      setDetailDay(dayInfo);
      return;
    }

    if (dayInfo.isPast && !dayInfo.isBlocked) return;

    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) {
        next.delete(dateStr);
      } else {
        next.add(dateStr);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedDates(new Set());

  // Determine if selection is all blocked, all unblocked, or mixed
  const selectionType = useMemo(() => {
    if (selectedDates.size === 0) return "none";
    let hasBlocked = false;
    let hasUnblocked = false;
    selectedDates.forEach((d) => {
      if (blockedDateMap.has(d)) hasBlocked = true;
      else hasUnblocked = true;
    });
    if (hasBlocked && hasUnblocked) return "mixed";
    if (hasBlocked) return "blocked";
    return "unblocked";
  }, [selectedDates, blockedDateMap]);

  // Block dates
  const handleBlockDates = async () => {
    if (!homestayId || selectedDates.size === 0) return;
    setSaving(true);

    // Only block dates that aren't already blocked
    const datesToBlock = Array.from(selectedDates).filter(
      (d) => !blockedDateMap.has(d)
    );

    if (datesToBlock.length === 0) {
      setSaving(false);
      setBlockDialogOpen(false);
      return;
    }

    const roomId = selectedRoomFilter === "all" ? null : selectedRoomFilter;

    try {
      const res = await fetch("/api/blocked-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homestay_id: homestayId,
          dates: datesToBlock,
          reason: blockReason || undefined,
          room_id: roomId,
        }),
      });

      if (!res.ok) throw new Error("Failed to block dates");

      const { blocked } = await res.json();
      setBlockedDates((prev) => [...prev, ...(blocked as BlockedDateRow[])]);
      toast.success(t("blockSuccess"));
      clearSelection();
      setBlockReason("");
      setBlockDialogOpen(false);
    } catch {
      toast.error(t("errorBlock"));
    } finally {
      setSaving(false);
    }
  };

  // Unblock dates
  const handleUnblockDates = async () => {
    if (!homestayId || selectedDates.size === 0) return;
    setSaving(true);

    const datesToUnblock = Array.from(selectedDates).filter((d) =>
      blockedDateMap.has(d)
    );

    if (datesToUnblock.length === 0) {
      setSaving(false);
      setUnblockDialogOpen(false);
      return;
    }

    // Determine room_id from the blocked entries being unblocked
    // All selected blocked dates should share the same room_id context from the filter
    const roomId = selectedRoomFilter === "all" ? null : selectedRoomFilter;

    try {
      const res = await fetch("/api/blocked-dates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homestay_id: homestayId,
          dates: datesToUnblock,
          room_id: roomId,
        }),
      });

      if (!res.ok) throw new Error("Failed to unblock dates");

      setBlockedDates((prev) =>
        prev.filter((bd) => {
          if (!datesToUnblock.includes(bd.date)) return true;
          // Only remove entries matching the room_id we unblocked
          if (roomId === null) return bd.room_id !== null;
          return bd.room_id !== roomId;
        })
      );
      toast.success(t("unblockSuccess"));
      clearSelection();
      setUnblockDialogOpen(false);
    } catch {
      toast.error(t("errorBlock"));
    } finally {
      setSaving(false);
    }
  };

  // Navigation
  const goToPrevMonth = () => setCurrentMonth((m) => subMonths(m, 1));
  const goToNextMonth = () => setCurrentMonth((m) => addMonths(m, 1));
  const goToToday = () => setCurrentMonth(startOfMonth(new Date()));

  const weekdayLabels = locale === "th" ? WEEKDAYS_TH : WEEKDAYS;

  if (loading) {
    return (
      <div>
        <Skeleton className="h-7 w-48 mb-6" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-7 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-8 w-48 mx-auto mb-6" />
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!homestayId) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
        <CalendarDays className="h-10 w-10 text-gray-300" />
        <p className="mt-3 text-sm font-medium text-gray-500">{t("noHomestay")}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">{t("title")}</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">{t("available")}</p>
            <p className="text-2xl font-bold" style={{ color: themeColor }}>
              {monthStats.available}
            </p>
            <p className="text-xs text-gray-400">{monthStats.pct}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">{t("booked")}</p>
            <p className="text-2xl font-bold text-blue-600">{monthStats.booked}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">{t("blocked")}</p>
            <p className="text-2xl font-bold text-red-500">{monthStats.blocked}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">{t("pending")}</p>
            <p className="text-2xl font-bold text-yellow-600">
              {bookings.filter((b) => b.status === "pending").length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action bar */}
      {selectedDates.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-gray-50 p-3">
          <Badge variant="secondary">
            {selectedDates.size} {t("datesSelected")}
          </Badge>
          {rooms.length > 0 && (
            <Select value={selectedRoomFilter} onValueChange={setSelectedRoomFilter}>
              <SelectTrigger className="h-8 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allRooms")}</SelectItem>
                {rooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(selectionType === "unblocked" || selectionType === "mixed") && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setBlockDialogOpen(true)}
            >
              <Ban className="mr-1.5 h-3.5 w-3.5" />
              {t("blockDate")}
            </Button>
          )}
          {(selectionType === "blocked" || selectionType === "mixed") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setUnblockDialogOpen(true)}
            >
              <Unlock className="mr-1.5 h-3.5 w-3.5" />
              {t("unblockDate")}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            {t("clearSelection")}
          </Button>
        </div>
      )}

      {/* Calendar */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={goToPrevMonth}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg">
                {fmtDate(currentMonth, "MMMM yyyy", locale)}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={goToToday}>
                {t("today")}
              </Button>
            </div>
            <Button variant="ghost" size="icon" onClick={goToNextMonth}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {weekdayLabels.map((day) => (
              <div
                key={day}
                className="py-2 text-center text-xs font-medium text-gray-500"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((dayInfo) => {
              const isSelected = selectedDates.has(dayInfo.dateStr);
              const hasBookings = dayInfo.bookings.length > 0;
              const hasConfirmed = dayInfo.bookings.some(
                (bi) => bi.booking.status === "confirmed" || bi.booking.status === "completed" || bi.booking.status === "verified"
              );
              const hasPending = dayInfo.bookings.some(
                (bi) => bi.booking.status === "pending"
              );

              let bgClass = "bg-white hover:bg-gray-50";
              let textClass = "text-gray-900";

              if (!dayInfo.isCurrentMonth) {
                bgClass = "bg-gray-50/50";
                textClass = "text-gray-300";
              } else if (dayInfo.isBlocked) {
                bgClass = "bg-red-50 hover:bg-red-100";
                textClass = "text-red-700";
              }

              if (isSelected) {
                bgClass += " ring-2 ring-offset-1";
              }

              // Range bar style helper
              const getRangeBarClass = (pos: BookingPosition) => {
                switch (pos) {
                  case "start": return "rounded-l-full rounded-r-none ml-0 mr-[-2px]";
                  case "middle": return "rounded-none mx-[-2px]";
                  case "end": return "rounded-r-full rounded-l-none mr-0 ml-[-2px]";
                  case "single": return "rounded-full";
                }
              };

              const dayContent = (
                <button
                  type="button"
                  onClick={() => toggleDateSelection(dayInfo.dateStr, dayInfo)}
                  disabled={!dayInfo.isCurrentMonth}
                  className={`
                    relative flex h-14 sm:h-24 w-full flex-col items-start rounded-lg border p-1 sm:p-1.5 text-left transition-all overflow-hidden
                    ${bgClass} ${textClass}
                    ${dayInfo.isCurrentMonth ? "cursor-pointer" : "cursor-default opacity-40"}
                    ${dayInfo.isPast && !dayInfo.isBlocked ? "opacity-60" : ""}
                    ${dayInfo.isBlocked && dayInfo.isCurrentMonth ? "border-red-200" : ""}
                    ${hasConfirmed && dayInfo.isCurrentMonth && !dayInfo.isBlocked ? "border-2" : ""}
                    ${hasPending && !hasConfirmed && dayInfo.isCurrentMonth && !dayInfo.isBlocked ? "border-yellow-300 border-2" : ""}
                  `}
                  style={{
                    borderColor: isSelected
                      ? themeColor
                      : hasConfirmed && dayInfo.isCurrentMonth && !dayInfo.isBlocked
                      ? themeColor
                      : undefined,
                  }}
                >
                  <span
                    className={`text-xs font-medium sm:text-sm ${
                      dayInfo.isToday
                        ? "flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-white"
                        : ""
                    }`}
                    style={dayInfo.isToday ? { backgroundColor: themeColor } : undefined}
                  >
                    {format(dayInfo.date, "d")}
                  </span>

                  {/* Booking range bars */}
                  {dayInfo.isCurrentMonth && hasBookings && (
                    <div className="mt-auto flex w-full flex-col gap-0.5">
                      {dayInfo.bookings.slice(0, 2).map((bi) => {
                        const isPending = bi.booking.status === "pending";
                        const barColor = isPending ? "#eab308" : themeColor;
                        const barBg = isPending ? "rgba(234,179,8,0.15)" : `${themeColor}18`;
                        return (
                          <div
                            key={bi.booking.id + bi.position}
                            className={`flex items-center h-3.5 sm:h-4 px-1 text-[8px] sm:text-[10px] font-medium leading-none truncate ${getRangeBarClass(bi.position)}`}
                            style={{ backgroundColor: barBg, color: barColor }}
                            title={`${bi.booking.guest_name} (${bi.booking.check_in} → ${bi.booking.check_out})`}
                          >
                            {(bi.position === "start" || bi.position === "single") && (
                              <span className="truncate">
                                <span className="hidden sm:inline">{bi.booking.guest_name}</span>
                                <span className="sm:hidden">IN</span>
                              </span>
                            )}
                            {bi.position === "end" && (
                              <span className="truncate">
                                <span className="hidden sm:inline">{t("checkOut")}</span>
                                <span className="sm:hidden">OUT</span>
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {dayInfo.bookings.length > 2 && (
                        <p className="text-[8px] text-gray-400 pl-0.5">+{dayInfo.bookings.length - 2}</p>
                      )}
                    </div>
                  )}

                  {/* Blocked indicator */}
                  {dayInfo.isCurrentMonth && dayInfo.isBlocked && !hasBookings && (
                    <div className="mt-auto">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" title={dayInfo.blockedReason || t("blocked")} />
                    </div>
                  )}
                </button>
              );

              return <div key={dayInfo.dateStr}>{dayContent}</div>;
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t pt-4 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: themeColor }}
              />
              {t("legendBooked")}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full bg-yellow-400" />
              {t("legendPending")}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full bg-red-400" />
              {t("legendBlocked")}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full border border-gray-300 bg-white" />
              {t("legendAvailable")}
            </div>
            <div className="ml-auto flex items-center gap-1 text-gray-400">
              <Info className="h-3.5 w-3.5" />
              {t("clickToSelect")}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Block Dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-500" />
              {t("blockDate")}
            </DialogTitle>
            <DialogDescription>
              {t("confirmBlockDesc", { count: Array.from(selectedDates).filter((d) => !blockedDateMap.has(d)).length })}
              {selectedRoomFilter !== "all" && roomMap[selectedRoomFilter] && (
                <span className="block mt-1 font-medium text-gray-700">
                  {t("forRoom")}: {roomMap[selectedRoomFilter]}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="reason">{t("reason")}</Label>
            <Input
              id="reason"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder={t("reasonPlaceholder")}
              className="mt-1"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {Array.from(selectedDates)
              .filter((d) => !blockedDateMap.has(d))
              .sort()
              .map((d) => (
                <Badge key={d} variant="secondary" className="text-xs">
                  {d}
                </Badge>
              ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>
              {t("cancelAction")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleBlockDates}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Ban className="mr-2 h-4 w-4" />
              )}
              {t("confirmBlock")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking Detail Modal */}
      <Dialog open={!!detailDay} onOpenChange={(open) => !open && setDetailDay(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" style={{ color: themeColor }} />
              {detailDay && fmtDate(detailDay.date, "EEE, d MMM yyyy", locale)}
            </DialogTitle>
            <DialogDescription>
              {detailDay && detailDay.bookings.length > 0
                ? t("bookingDetailDesc", { count: detailDay.bookings.length })
                : ""}
            </DialogDescription>
          </DialogHeader>

          {detailDay && detailDay.isBlocked && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              <Ban className="h-4 w-4 shrink-0" />
              <div>
                <span className="font-medium">{t("blocked")}</span>
                {detailDay.blockedReason && (
                  <span className="text-red-500"> — {detailDay.blockedReason}</span>
                )}
              </div>
            </div>
          )}

          {detailDay && detailDay.bookings.length > 0 && (
            <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
              {detailDay.bookings.map((bi) => (
                <div
                  key={bi.booking.id}
                  className="rounded-lg border p-3 text-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-900">
                      {bi.booking.guest_name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${
                          bi.position === "start"
                            ? "border-green-300 text-green-700 bg-green-50"
                            : bi.position === "end"
                            ? "border-orange-300 text-orange-700 bg-orange-50"
                            : "border-blue-300 text-blue-700 bg-blue-50"
                        }`}
                      >
                        {bi.position === "start" ? t("checkIn") : bi.position === "end" ? t("checkOut") : t("staying")}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 ${
                          bi.booking.status === "confirmed" || bi.booking.status === "verified"
                            ? "bg-green-100 text-green-700"
                            : bi.booking.status === "pending"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {bi.booking.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-green-50 px-2.5 py-1.5">
                      <p className="text-green-600 font-medium mb-0.5">{t("checkIn")}</p>
                      <p className="text-gray-900 font-semibold">{fmtDateStr(bi.booking.check_in, "d MMM yyyy", locale)}</p>
                    </div>
                    <div className="rounded-md bg-orange-50 px-2.5 py-1.5">
                      <p className="text-orange-600 font-medium mb-0.5">{t("checkOut")}</p>
                      <p className="text-gray-900 font-semibold">{fmtDateStr(bi.booking.check_out, "d MMM yyyy", locale)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                    <span>
                      {bi.booking.room_id ? roomMap[bi.booking.room_id] || "—" : "—"} · {bi.booking.num_guests} {t("guests")}
                    </span>
                    <div className="text-right">
                      <span className="font-semibold text-sm" style={{ color: themeColor }}>
                        ฿{bi.booking.total_price.toLocaleString()}
                      </span>
                      {bi.booking.payment_type === "deposit" && bi.booking.amount_paid < bi.booking.total_price && (
                        <span className="ml-1.5 text-[10px] font-medium text-amber-600">
                          (มัดจำ ฿{bi.booking.amount_paid.toLocaleString()})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDay(null)}>
              {t("cancelAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unblock Dialog */}
      <Dialog open={unblockDialogOpen} onOpenChange={setUnblockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5 text-green-600" />
              {t("unblockDate")}
            </DialogTitle>
            <DialogDescription>
              {t("confirmUnblockDesc", { count: Array.from(selectedDates).filter((d) => blockedDateMap.has(d)).length })}
              {selectedRoomFilter !== "all" && roomMap[selectedRoomFilter] && (
                <span className="block mt-1 font-medium text-gray-700">
                  {t("forRoom")}: {roomMap[selectedRoomFilter]}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1">
            {Array.from(selectedDates)
              .filter((d) => blockedDateMap.has(d))
              .sort()
              .map((d) => (
                <Badge key={d} variant="secondary" className="bg-red-50 text-red-700 text-xs">
                  {d}
                </Badge>
              ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setUnblockDialogOpen(false)}>
              {t("cancelAction")}
            </Button>
            <Button
              onClick={handleUnblockDates}
              disabled={saving}
              className="hover:brightness-90"
              style={{ backgroundColor: themeColor }}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unlock className="mr-2 h-4 w-4" />
              )}
              {t("confirmUnblock")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
