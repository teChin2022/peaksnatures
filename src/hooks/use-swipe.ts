import { useEffect, useRef } from "react";

interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
  threshold?: number;
  startThreshold?: number;
}

export function useSwipe<T extends HTMLElement>(
  element: T | null,
  { onSwipeLeft, onSwipeRight, onSwipeStart, onSwipeEnd, threshold = 50, startThreshold = 8 }: UseSwipeOptions
) {
  const startX = useRef(0);
  const startY = useRef(0);
  const startedRef = useRef(false);
  const cbRef = useRef({ onSwipeLeft, onSwipeRight, onSwipeStart, onSwipeEnd });
  cbRef.current = { onSwipeLeft, onSwipeRight, onSwipeStart, onSwipeEnd };

  useEffect(() => {
    if (!element) return;

    function handleTouchStart(e: TouchEvent) {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      startedRef.current = false;
    }

    function handleTouchMove(e: TouchEvent) {
      if (startedRef.current) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > startThreshold) {
        startedRef.current = true;
        cbRef.current.onSwipeStart?.();
      }
    }

    function handleTouchEnd(e: TouchEvent) {
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;

      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
        if (dx < 0) cbRef.current.onSwipeLeft?.();
        else cbRef.current.onSwipeRight?.();
      }

      if (startedRef.current) {
        startedRef.current = false;
        cbRef.current.onSwipeEnd?.();
      }
    }

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: true });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
    };
  }, [element, threshold, startThreshold]);
}
