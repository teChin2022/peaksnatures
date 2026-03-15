"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { User } from "lucide-react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "motion/react";

export function LandingNavbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const t = useTranslations("common");

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? "glass-nav py-3 shadow-sm" : "bg-transparent py-6"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center text-white">
            <Mountain size={20} />
          </div> */}
          <span
            className={`text-2xl font-serif font-bold tracking-tight ${
              scrolled ? "text-gray-900" : "text-white"
            }`}
          >
            Peaksnature
          </span>
        </div>

        {/* <div
          className={`hidden md:flex items-center gap-8 font-medium text-sm ${
            scrolled ? "text-gray-700" : "text-white/90"
          }`}
        >
          <a
            href="#unique-homestays"
            className="hover:text-gray-500 transition-colors"
          >
            Destinations
          </a>
          <a
            href="#experience"
            className="hover:text-gray-500 transition-colors"
          >
            Experiences
          </a>
          <a
            href="#why-peaksnature"
            className="hover:text-gray-500 transition-colors"
          >
            Sustainability
          </a>
        </div> */}

        <div className="flex items-center gap-4">
          {/* <button
            className={`p-2 rounded-full hover:bg-white/10 transition-colors ${
              scrolled ? "text-gray-900" : "text-white"
            }`}
          >
            <Globe size={20} />
          </button> */}

          <div className="relative" ref={menuRef}>
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer ${scrolled ? 'text-[#111111]' : 'text-white'}`}
            >
              <User size={20} />
            </button>
            
            <AnimatePresence>
              {isMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden py-2"
                >
                  <button className="w-full text-left px-4 py-3 text-sm font-medium text-[#111111] hover:bg-gray-50 transition-colors">
                    <Link href="/register" className="cursor-pointer">
                      {t("hostRegister")}
                    </Link>
                  </button>
                  <button className="w-full text-left px-4 py-3 text-sm font-medium text-[#111111] hover:bg-gray-50 transition-colors">
                    <Link href="/login" className="cursor-pointer">
                      {t("hostLogin")}
                    </Link>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>
    </nav>
  );
}
