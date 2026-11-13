"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronDown, Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import { FullScreenMenu } from "@/components/full-screen-menu";
import { LanguageSwitcherIcon } from "@/components/language-switcher-icon";

export function LandingNavbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const t = useTranslations("common");
  const th = useTranslations("home");

  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.15);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    // Esc closes the menu and hands focus back to the button that opened it.
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isMenuOpen]);

  const iconButton = `p-3 rounded-full transition-colors cursor-pointer outline-none focus-visible:ring-2 ${
    scrolled ? "text-earth-900 hover:bg-earth-100 focus-visible:ring-brand" : "text-white hover:bg-white/10 focus-visible:ring-white"
  }`;

  return (
    <nav
      // Solid once scrolled, like the /[slug] header (DESIGN.md: no glass, no shadow on bars).
      className={`fixed top-0 left-0 right-0 z-50 border-b transition-colors duration-300 ${
        scrolled ? "border-earth-200 bg-white py-3" : "border-transparent bg-transparent py-6"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <Link
          href="/"
          className={`rounded-sm text-2xl font-serif font-bold tracking-tight outline-none focus-visible:ring-2 ${
            scrolled ? "text-earth-900 focus-visible:ring-brand" : "text-white focus-visible:ring-white"
          }`}
        >
          Peaksnature
        </Link>

        <div className="flex items-center gap-1 lg:gap-2">
          <LanguageSwitcherIcon scrolled={scrolled} />
          <button
            type="button"
            aria-label={t("menu")}
            onClick={() => setMobileMenuOpen(true)}
            className={`lg:hidden ${iconButton}`}
          >
            <Menu size={20} aria-hidden="true" />
          </button>

          <div className="relative hidden lg:block" ref={menuRef}>
            {/* Visible words, like Booking.com's "List your property": a bare User glyph read as a guest login. */}
            <button
              ref={menuButtonRef}
              type="button"
              // A disclosure, not role="menu": two plain links that Tab reaches.
              aria-expanded={isMenuOpen}
              aria-controls="landing-host-menu"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors cursor-pointer outline-none focus-visible:ring-2 ${
                scrolled ? "text-earth-900 hover:bg-earth-100 focus-visible:ring-brand" : "text-white hover:bg-white/10 focus-visible:ring-white"
              }`}
            >
              {th("hosts.audience")}
              <ChevronDown size={16} aria-hidden="true" className={isMenuOpen ? "rotate-180" : ""} />
            </button>

            <AnimatePresence>
              {isMenuOpen && (
                <motion.div
                  id="landing-host-menu"
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-md border border-earth-200 overflow-hidden py-1"
                >
                  <Link
                    href="/register"
                    className="block px-4 py-3 text-sm font-medium text-earth-900 hover:bg-earth-50 outline-none focus-visible:bg-earth-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand transition-colors"
                  >
                    {t("hostRegister")}
                  </Link>
                  <Link
                    href="/login"
                    className="block px-4 py-3 text-sm font-medium text-earth-900 hover:bg-earth-50 outline-none focus-visible:bg-earth-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand transition-colors"
                  >
                    {t("hostLogin")}
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      {/* Below lg: the page's sections, then the host links. */}
      <FullScreenMenu
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        title="Peaksnature"
        items={[
          { label: th("featured"), href: "#unique-homestays" },
          { label: th("whyTitle"), href: "#why-peaksnature" },
        ]}
        secondaryItems={[
          { label: t("hostRegister"), href: "/register" },
          { label: t("hostLogin"), href: "/login" },
        ]}
      />
    </nav>
  );
}
