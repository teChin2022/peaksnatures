"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ContactForm } from "@/components/contact-form";

export function LandingFooter() {
  const [contactOpen, setContactOpen] = useState(false);
  return (
    <>
    <footer className="bg-earth-900 text-earth-100 pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-12 mb-24">
          <div className="col-span-2">
            <h2 className="text-3xl font-serif mb-2 text-earth-50">
              Peaksnature
            </h2>
            <p className="text-xs uppercase tracking-[0.2em] text-earth-500 mb-6">
              Nature Homestays in Thailand
            </p>
            <p className="text-earth-400 max-w-sm mb-8">
              คัดสรรที่พักกลางธรรมชาติ
              <br />
              ในมุมที่เงียบสงบและน่าค้นพบ
            </p>
          </div>

          <div>
            <h4 className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-500 mb-6">
              ค้นพบ
            </h4>
            <ul className="space-y-4 text-sm text-earth-400">
              <li>
                <a href="#unique-homestays" className="hover:text-white transition-colors">
                  ที่พักทั้งหมด
                </a>
              </li>
              <li>
                <Link href="/register" className="hover:text-white transition-colors">
                  ลงทะเบียนเจ้าของที่พัก
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-white transition-colors">
                  เข้าสู่ระบบเจ้าของที่พัก
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-500 mb-6">
              เชื่อมต่อ
            </h4>
            <ul className="space-y-4 text-sm text-earth-400">
              <li>
                <button
                  onClick={() => setContactOpen(true)}
                  className="hover:text-white cursor-pointer transition-colors"
                >
                  ติดต่อเรา
                </button>
              </li>
              <li>
                <button
                  onClick={() => setContactOpen(true)}
                  className="hover:text-white cursor-pointer transition-colors"
                >
                  คำถามที่พบบ่อย
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-12 border-t border-earth-800 flex flex-col md:flex-row justify-between items-center gap-6 text-[12px] tracking-widest text-earth-500">
          <p>&copy; {new Date().getFullYear()} Peaksnature.com all rights reserved</p>
          <div className="flex gap-8">
            <Link href="/legal#privacy" className="hover:text-white transition-colors">
              นโยบายความเป็นส่วนตัว
            </Link>
            <Link href="/legal#terms" className="hover:text-white transition-colors">
              ข้อกำหนดการให้บริการ
            </Link>
          </div>
        </div>
      </div>
    </footer>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>ติดต่อเรา</DialogTitle>
            <DialogDescription>
              ส่งข้อความถึงเรา แล้วเราจะตอบกลับโดยเร็วที่สุด
            </DialogDescription>
          </DialogHeader>
          <ContactForm onSuccess={() => setContactOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
