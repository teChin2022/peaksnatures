"use client";

import { useState, useEffect } from "react";
import { Mountain, Globe, Menu, User } from "lucide-react";

export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? "glass-nav py-3 shadow-sm" : "bg-transparent py-6"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center text-white">
            <Mountain size={20} />
          </div>
          <span
            className={`text-xl font-serif font-semibold tracking-tight ${
              scrolled ? "text-gray-900" : "text-white"
            }`}
          >
            Peaksnature
          </span>
        </div>

        <div
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
        </div>

        <div className="flex items-center gap-4">
          <button
            className={`p-2 rounded-full hover:bg-white/10 transition-colors ${
              scrolled ? "text-gray-900" : "text-white"
            }`}
          >
            <Globe size={20} />
          </button>
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
              scrolled
                ? "bg-white border-gray-200 text-gray-900"
                : "bg-white/10 border-white/20 text-white"
            }`}
          >
            <Menu size={18} />
            <div className="w-7 h-7 bg-gray-400 rounded-full flex items-center justify-center text-white">
              <User size={14} />
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
