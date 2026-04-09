"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CalendarDays } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/lib/use-is-mobile";
import { getPriceRange } from "@/lib/calculate-price";
import type { Room, RoomSeasonalPrice } from "@/types/database";

interface MobileBookingBarProps {
  rooms: Room[];
  seasonalPrices: RoomSeasonalPrice[];
}

export function MobileBookingBar({ rooms, seasonalPrices }: MobileBookingBarProps) {
  const t = useTranslations("common");
  const isMobile = useIsMobile();
  const [visible, setVisible] = useState(false);
  const [focusedRoomId, setFocusedRoomId] = useState<string | null>(null);
  const focusedRoomIdRef = useRef<string | null>(null);
  const explicitSelectRef = useRef(false);

  // Calculate cheapest price across all rooms
  const cheapestPrice = useMemo(() => {
    if (!rooms.length) return 0;
    let min = Infinity;
    for (const room of rooms) {
      const seasons = seasonalPrices.filter((s) => s.room_id === room.id);
      const range = getPriceRange(room.price_per_night, seasons);
      if (range.min < min) min = range.min;
    }
    return min;
  }, [rooms, seasonalPrices]);

  // Visibility: show when scrolled past hero area, but NOT in rooms or booking sections
  useEffect(() => {
    if (!isMobile) return;

    const roomsEl = document.getElementById("rooms-section");
    const bookingEl = document.getElementById("booking-section");

    let roomsInView = false;
    let bookingInView = false;
    let scrolledPastThreshold = false;

    const updateVisibility = () => {
      setVisible(scrolledPastThreshold && !roomsInView && !bookingInView);
    };

    // Show bar once user scrolls past 40% of viewport height (past hero)
    const onScroll = () => {
      scrolledPastThreshold = window.scrollY > window.innerHeight * 0.4;
      updateVisibility();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const roomsObserver = new IntersectionObserver(
      ([entry]) => {
        roomsInView = entry.isIntersecting;
        // Reset explicit lock when user scrolls back to rooms
        if (roomsInView) explicitSelectRef.current = false;
        updateVisibility();
      },
      { threshold: 0 }
    );

    const bookingObserver = new IntersectionObserver(
      ([entry]) => {
        bookingInView = entry.isIntersecting;
        updateVisibility();
      },
      { threshold: 0 }
    );

    if (roomsEl) roomsObserver.observe(roomsEl);
    if (bookingEl) bookingObserver.observe(bookingEl);

    return () => {
      window.removeEventListener("scroll", onScroll);
      roomsObserver.disconnect();
      bookingObserver.disconnect();
    };
  }, [isMobile]);

  // Sync with explicit room selection (from card buttons or this bar)
  useEffect(() => {
    const handler = (e: Event) => {
      const { roomId } = (e as CustomEvent<{ roomId: string }>).detail;
      if (roomId) {
        explicitSelectRef.current = true;
        focusedRoomIdRef.current = roomId;
        setFocusedRoomId(roomId);
      }
    };
    document.addEventListener("book-room", handler);
    return () => document.removeEventListener("book-room", handler);
  }, []);

  // Track which room card is most visible (for auto-select)
  // Only updates when user is naturally scrolling, not after an explicit book-room click
  useEffect(() => {
    if (!isMobile) return;

    const roomCards = document.querySelectorAll<HTMLElement>("[data-room-id]");
    if (!roomCards.length) return;

    const ratios = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        // Skip observer updates while an explicit selection is active
        if (explicitSelectRef.current) return;

        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.roomId;
          if (id) ratios.set(id, entry.intersectionRatio);
        }
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of ratios) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        if (bestId && bestId !== focusedRoomIdRef.current) {
          focusedRoomIdRef.current = bestId;
          setFocusedRoomId(bestId);
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    roomCards.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [isMobile]);

  const focusedRoom = useMemo(() => {
    if (focusedRoomId) return rooms.find((r) => r.id === focusedRoomId) ?? rooms[0];
    return rooms[0];
  }, [focusedRoomId, rooms]);

  const handleBookNow = () => {
    if (!focusedRoom) return;
    document.dispatchEvent(
      new CustomEvent("book-room", { detail: { roomId: focusedRoom.id } })
    );
  };

  if (!isMobile || !rooms.length) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-0 inset-x-0 z-40 border-t border-earth-200 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-earth-500 truncate">{focusedRoom?.name}</span>
              <span className="text-lg font-bold text-earth-900">
                ฿{cheapestPrice.toLocaleString()}
                <span className="text-sm font-normal text-earth-500">{t("perNight")}</span>
              </span>
            </div>
            <Button
              onClick={handleBookNow}
              className="shrink-0 bg-brand text-white px-6 py-3 h-auto font-bold text-sm tracking-wider uppercase rounded-full hover:bg-brand-hover border-0"
            >
              <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
              {t("bookNow")}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
