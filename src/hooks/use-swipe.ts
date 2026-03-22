import { useEffect, useRef } from "react";

interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
}

export function useSwipe<T extends HTMLElement>(
  element: T | null,
  { onSwipeLeft, onSwipeRight, threshold = 50 }: UseSwipeOptions
) {
  const startX = useRef(0);
  const startY = useRef(0);
  const cbRef = useRef({ onSwipeLeft, onSwipeRight });
  cbRef.current = { onSwipeLeft, onSwipeRight };

  useEffect(() => {
    if (!element) return;

    function handleTouchStart(e: TouchEvent) {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    }

    function handleTouchEnd(e: TouchEvent) {
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;

      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
        if (dx < 0) cbRef.current.onSwipeLeft?.();
        else cbRef.current.onSwipeRight?.();
      }
    }

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchend", handleTouchEnd);
    };
  }, [element, threshold]);
}
