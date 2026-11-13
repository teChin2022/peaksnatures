"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ContactForm } from "@/components/contact-form";

export function LandingFooter() {
  const t = useTranslations("home.footer");
  const tc = useTranslations("common");
  const [contactOpen, setContactOpen] = useState(false);
  return (
    <>
    <footer className="bg-earth-900 text-earth-100 pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-2">
            <p className="text-3xl font-serif mb-2 text-earth-50">
              Peaksnature
            </p>
            <p className="text-xs uppercase tracking-[0.2em] text-earth-300 mb-6">
              Discover Nature. Stay Local.
            </p>
            <p className="text-earth-300 max-w-sm mb-8">
              {t("tagline")}
            </p>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-earth-50 mb-6">
              {t("discover")}
            </h2>
            <ul className="space-y-4 text-sm text-earth-300">
              <li>
                <a href="#unique-homestays" className="hover:text-white transition-colors">
                  {t("allHomestays")}
                </a>
              </li>
              <li>
                <Link href="/register" className="hover:text-white transition-colors">
                  {tc("hostRegister")}
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-white transition-colors">
                  {tc("hostLogin")}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-earth-50 mb-6">
              {t("connect")}
            </h2>
            <ul className="space-y-4 text-sm text-earth-300">
              <li>
                <button
                  onClick={() => setContactOpen(true)}
                  className="hover:text-white cursor-pointer transition-colors"
                >
                  {t("contact")}
                </button>
              </li>
              <li>
                {/* Was a second "FAQ" button that opened the contact form; the real answers live on /trust-safety. */}
                <Link href="/trust-safety" className="hover:text-white transition-colors">
                  {t("trustSafety")}
                </Link>
              </li>
              <li>
                <Link href="/recommender" className="hover:text-white transition-colors">
                  {t("referrerStats")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-12 border-t border-earth-800 flex flex-col md:flex-row justify-between items-center gap-6 text-xs text-earth-300">
          <p>&copy; {new Date().getFullYear()} Peaksnature.com {t("rights")}</p>
          <div className="flex gap-8">
            <Link href="/legal#privacy" className="hover:text-white transition-colors">
              {t("privacy")}
            </Link>
            <Link href="/legal#terms" className="hover:text-white transition-colors">
              {t("terms")}
            </Link>
          </div>
        </div>
      </div>
    </footer>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("contact")}</DialogTitle>
            <DialogDescription>
              {t("contactDesc")}
            </DialogDescription>
          </DialogHeader>
          <ContactForm onSuccess={() => setContactOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
