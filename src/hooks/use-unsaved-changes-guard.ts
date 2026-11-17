"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** pendingHref value when the host pressed the browser's Back. */
export const BACK = "__back__";

/**
 * Warns before unsaved edits are lost. While `dirty`:
 * - reload / tab close shows the browser's own prompt (beforeunload);
 * - a click on an in-app link to another page is held, and `pendingHref`
 *   is set so the page can ask; `leave()` then navigates, `stay()` cancels;
 * - browser Back (and mobile swipe-back) is caught with a guard history entry,
 *   the same way booking-section.tsx does it: armed outside popstate, never
 *   re-pushed inside it (that makes the App Router reload the page).
 *
 * shortcut: once the edits are saved the guard entry stays in history, so the
 * next Back is a no-op on this page; drop it if hosts notice.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const armedRef = useRef(false);
  const leavingRef = useRef(false);

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // older Chromium/Safari still need it
    };

    // Capture phase on document runs before React's root listeners, so
    // next/link never starts the navigation.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(url.pathname + url.search + url.hash);
    };

    // Back pops the guard entry: the page stays, and we ask.
    const onPopState = () => {
      if (leavingRef.current) return;
      armedRef.current = false;
      setPendingHref(BACK);
    };

    if (!armedRef.current) {
      window.history.pushState(null, "");
      armedRef.current = true;
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [dirty]);

  return {
    pendingHref,
    stay: () => {
      // Re-arm for the next Back, from a click, never from inside popstate.
      if (pendingHref === BACK && !armedRef.current) {
        window.history.pushState(null, "");
        armedRef.current = true;
      }
      setPendingHref(null);
    },
    leave: () => {
      const href = pendingHref;
      setPendingHref(null);
      if (href === BACK) {
        leavingRef.current = true;
        window.history.back(); // the guard entry is already gone: this is the real Back
      } else if (href) {
        router.push(href);
      }
    },
  };
}
