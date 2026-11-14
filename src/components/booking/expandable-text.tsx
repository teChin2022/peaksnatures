"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { HTMLContent } from "@/components/ui/html-content";

interface ExpandableTextProps {
  /** Sanitized rich text (getHomestayData). */
  html: string;
  /** Whole line-clamp classes, e.g. "line-clamp-4 lg:line-clamp-6", so Tailwind generates them. */
  clampClassName: string;
  className?: string;
  /** Whole gradient classes matching the section's background, so the fade is invisible. */
  fadeClassName?: string;
  /** The text's type and colour. */
  textClassName?: string;
}

/**
 * Rich text cut to a few lines. "Read more" opens the rest in place and
 * "Show less" closes it, so a guest on a phone keeps their place on the page.
 */
export function ExpandableText({ html, clampClassName, className = "", fadeClassName = "from-mist via-mist/80", textClassName = "leading-relaxed text-ink-2" }: ExpandableTextProps) {
  const t = useTranslations("common");
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // An observer, not a one-off check: the clamp and the column width change with the breakpoint.
  // Measured only while cut: open, the clamp is off and nothing overflows, so the last answer stands.
  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const observer = new ResizeObserver(() => setOverflows(el.scrollHeight > el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [html, expanded]);

  return (
    <div className={className}>
      <div className="relative overflow-hidden">
        <div ref={ref} className={expanded ? undefined : clampClassName}>
          <HTMLContent content={html} className={textClassName} />
        </div>
        {overflows && !expanded && (
          <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t ${fadeClassName} to-transparent`} />
        )}
      </div>
      {overflows && (
        <button
          type="button"
          aria-expanded={expanded}
          className="mt-1 inline-flex min-h-11 items-center rounded-sm text-[15px] font-medium text-pine underline underline-offset-4 hover:text-pine-hover outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? t("showLess") : t("readMore")}
        </button>
      )}
    </div>
  );
}
