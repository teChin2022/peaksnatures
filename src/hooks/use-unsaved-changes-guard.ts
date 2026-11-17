"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Warns before unsaved edits are lost. While `dirty`:
 * - reload / tab close shows the browser's own prompt (beforeunload);
 * - a click on an in-app link to another page is held, and `pendingHref`
 *   is set so the page can ask; `leave()` then navigates, `stay()` cancels.
 *
 * shortcut: browser Back is not guarded (the App Router popstate dance in
 * booking-section.tsx is fragile); add it if hosts lose edits that way.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

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

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  return {
    pendingHref,
    stay: () => setPendingHref(null),
    leave: () => {
      const href = pendingHref;
      setPendingHref(null);
      if (href) router.push(href);
    },
  };
}
