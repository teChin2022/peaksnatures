"use client";

import { useEffect, useRef, type ReactNode } from "react";

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** True when any part of the element is inside the viewport. A hidden (display: none) element counts as off screen. */
const onScreen = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight && r.height > 0;
};

/**
 * Runs the landing's scroll entrances (globals.css, "Landing motion") for every
 * descendant with a `data-reveal-kind`. Only elements still below the fold are
 * set back to "pending", so the server HTML, a visitor without JavaScript and
 * whatever is on screen at load all show the final state. Reduced motion skips
 * it entirely. `display: contents`, so it adds no box to the layout.
 */
export function RevealScope({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined" || prefersReducedMotion()) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.reveal = "in";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
    );
    root.querySelectorAll<HTMLElement>("[data-reveal-kind]").forEach((el) => {
      if (onScreen(el)) return;
      el.dataset.reveal = "pending";
      observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}

const COUNT_MS = 1300;

/**
 * A figure that counts up from zero the first time it scrolls into view. The
 * markup always carries the real value; only a figure below the fold is reset
 * to zero, and never under reduced motion.
 */
export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  // As many decimals as the value has: 4.9 counts in tenths, 126 in whole numbers.
  const decimals = (String(value).split(".")[1] ?? "").length;
  const text = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || prefersReducedMotion() || onScreen(el)) return;
    const show = (n: number) => {
      el.textContent = n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    };
    let frame = 0;
    show(0);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / COUNT_MS);
          show(value * (1 - Math.pow(1 - t, 4)));
          if (t < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      show(value);
    };
  }, [value, decimals]);

  // Tabular figures: the width holds still while the digits change.
  return (
    <span ref={ref} className="[font-variant-numeric:lining-nums_tabular-nums]">
      {text(value)}
    </span>
  );
}
