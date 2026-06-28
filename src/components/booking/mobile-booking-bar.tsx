"use client";

import { useState, useEffect, useMemo } from "react";
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
  mostBookedRoomId: string | null;
  hasConfirmedBookings: boolean;
  bookingDisabled?: boolean;
}

type BookingStep = "dates" | "details" | "payment";

export function MobileBookingBar({
  rooms,
  seasonalPrices,
  mostBookedRoomId,
  hasConfirmedBookings,
  bookingDisabled = false,
}: MobileBookingBarProps) {
  const t = useTranslations("common");
  const isMobile = useIsMobile();
  const [visible, setVisible] = useState(false);
  const [bookingStep, setBookingStep] = useState<BookingStep>("dates");
  const [cartCount, setCartCount] = useState(0);

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

  const focusedRoom = useMemo(
    () => rooms.find((r) => r.id === mostBookedRoomId) ?? rooms[0],
    [mostBookedRoomId, rooms]
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const { step } = (e as CustomEvent<{ step: BookingStep }>).detail;
      setBookingStep(step);
    };
    document.addEventListener("booking-step", handler);
    return () => document.removeEventListener("booking-step", handler);
  }, []);

  // Cart size, broadcast by BookingSection as rooms are added/removed.
  useEffect(() => {
    const handler = (e: Event) => {
      const { count } = (e as CustomEvent<{ count: number }>).detail;
      setCartCount(count);
    };
    document.addEventListener("cart-count", handler);
    return () => document.removeEventListener("cart-count", handler);
  }, []);

  useEffect(() => {
    if (!isMobile) return;

    const roomsEl = document.getElementById("rooms-section");
    const footerEl = document.querySelector("footer");

    let roomsInView = false;
    let footerInView = false;
    let scrolledPastThreshold = false;

    const updateVisibility = () => {
      setVisible(
        scrolledPastThreshold &&
          !roomsInView &&
          !footerInView &&
          bookingStep === "dates"
      );
    };

    const onScroll = () => {
      scrolledPastThreshold = window.scrollY > window.innerHeight * 0.4;
      updateVisibility();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const roomsObserver = new IntersectionObserver(
      ([entry]) => {
        roomsInView = entry.isIntersecting;
        updateVisibility();
      },
      { threshold: 0 }
    );

    const footerObserver = new IntersectionObserver(
      ([entry]) => {
        footerInView = entry.isIntersecting;
        updateVisibility();
      },
      { threshold: 0 }
    );

    if (roomsEl) roomsObserver.observe(roomsEl);
    if (footerEl) footerObserver.observe(footerEl);

    return () => {
      window.removeEventListener("scroll", onScroll);
      roomsObserver.disconnect();
      footerObserver.disconnect();
    };
  }, [isMobile, bookingStep]);

  const handleBookNow = () => {
    if (!focusedRoom) return;
    document.dispatchEvent(
      new CustomEvent("book-room", { detail: { roomId: focusedRoom.id } })
    );
  };

  // With rooms in the cart, the CTA jumps to the panel to review/continue;
  // otherwise it kicks off a fresh booking for the focused room.
  const handleCta = () => {
    if (cartCount > 0) {
      document.getElementById("booking-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      handleBookNow();
    }
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
              {hasConfirmedBookings && (
                <span className="text-[10px] font-bold text-brand uppercase tracking-wider leading-none mb-0.5">
                  {t("mostPopular")}
                </span>
              )}
              <span className="text-xs text-earth-500 truncate">{focusedRoom?.name}</span>
              <span className="text-lg font-bold text-earth-900">
                ฿{cheapestPrice.toLocaleString()}
                <span className="text-sm font-normal text-earth-500">{t("perNight")}</span>
              </span>
            </div>
            <Button
              onClick={handleCta}
              disabled={bookingDisabled}
              className="relative shrink-0 bg-brand text-white px-6 py-3 h-auto font-bold text-sm tracking-wider uppercase rounded-full hover:bg-brand-hover border-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
              {bookingDisabled ? t("unavailable") : t("bookNow")}
              {cartCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-brand shadow">
                  {cartCount}
                </span>
              )}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
