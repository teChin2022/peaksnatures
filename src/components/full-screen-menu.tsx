"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

export interface MenuItem {
  label: string;
  /** A path, or "#id" to scroll to a section of this page. */
  href?: string;
  /** Runs on tap instead of following a link; the menu closes first. */
  onSelect?: () => void;
}

interface FullScreenMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The menu dialog's title, for screen readers. */
  title: string;
  items: MenuItem[];
  /** Smaller links under the main list. */
  secondaryItems?: MenuItem[];
  /** Radix's focus return as the menu closes; preventDefault it when handing off to a dialog. */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * The phone menu of the public pages: a full-screen panel with one centered
 * list. Latin labels get spaced capitals; Thai stays unspaced, because
 * letter-spacing breaks its vowel and tone marks.
 */
export function FullScreenMenu({ open, onOpenChange, title, items, secondaryItems = [], onCloseAutoFocus }: FullScreenMenuProps) {
  const t = useTranslations("bookingMenu");
  const latin = useLocale() === "en";

  const renderItem = (item: MenuItem, className: string) => {
    const { onSelect, href = "/" } = item;
    if (onSelect) {
      return (
        <button
          key={item.label}
          type="button"
          className={className}
          onClick={() => {
            onOpenChange(false);
            onSelect();
          }}
        >
          {item.label}
        </button>
      );
    }
    if (href.startsWith("#")) {
      return (
        <a
          key={item.label}
          href={href}
          className={className}
          onClick={(e) => {
            e.preventDefault();
            onOpenChange(false);
            // Scroll once the sheet lets go of the page (as MobileBookingBar does).
            setTimeout(() => document.querySelector(href)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
          }}
        >
          {item.label}
        </a>
      );
    }
    return (
      <Link key={item.label} href={href} className={className} onClick={() => onOpenChange(false)}>
        {item.label}
      </Link>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="top"
        showCloseButton={false}
        onCloseAutoFocus={onCloseAutoFocus}
        className="h-[100svh] items-center justify-center border-none bg-earth-50 px-6"
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <SheetDescription className="sr-only">{title}</SheetDescription>
        <SheetClose
          aria-label={t("close")}
          className="absolute right-4 top-5 inline-flex h-11 w-11 items-center justify-center rounded-full text-earth-900 transition-colors hover:bg-earth-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <X size={22} />
        </SheetClose>
        {/* 44px rows; the gap is trimmed so the spacing between labels looks as before. */}
        <div className="flex flex-col items-center gap-5 text-center">
          {items.map((item) =>
            renderItem(
              item,
              `inline-flex min-h-11 items-center font-semibold text-earth-900 transition-colors hover:text-brand ${latin ? "text-sm uppercase tracking-[0.25em]" : "text-lg"}`,
            ),
          )}
        </div>
        {secondaryItems.length > 0 && (
          <div className="mt-14 flex flex-col items-center gap-1 text-center text-sm text-earth-600">
            {secondaryItems.map((item) => renderItem(item, "inline-flex min-h-11 items-center transition-colors hover:text-earth-900"))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
