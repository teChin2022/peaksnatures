"use client";

import { useState } from "react";
import { Instagram, Facebook, Twitter } from "lucide-react";
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
    <footer className="bg-section-alt text-[#111111] pt-24 pb-12 border-t border-gray-200">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-12 mb-24">
          <div className="col-span-2">
            <h2 className="text-3xl font-serif mb-6 text-[#111111]">
              Peaksnature
            </h2>
            <p className="text-[#6B7280] max-w-sm mb-8">
              คัดสรรที่พักกลางธรรมชาติ
              <br />
              ในมุมที่เงียบสงบและน่าค้นพบ
            </p>
            {/* <div className="flex gap-4">
              <span className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center hover:border-[#111111] hover:text-[#111111] text-[#6B7280] cursor-pointer transition-colors">
                <Instagram size={18} />
              </span>
              <span className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center hover:border-[#111111] hover:text-[#111111] text-[#6B7280] cursor-pointer transition-colors">
                <Facebook size={18} />
              </span>
              <span className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center hover:border-[#111111] hover:text-[#111111] text-[#6B7280] cursor-pointer transition-colors">
                <Twitter size={18} />
              </span>
            </div> */}
          </div>

          <div>
            <h4 className="text-[14px] font-bold uppercase tracking-widest text-[#6B7280] mb-6">
              ค้นพบ
            </h4>
            <ul className="space-y-4 text-sm text-[#6B7280]">
              <li className="hover:text-[#111111] cursor-pointer transition-colors">
                ที่พักทั้งหมด
              </li>
              <li>
                <Link href="/register" className="hover:text-[#111111] transition-colors">
                  ลงทะเบียบเจ้าของที่พัก
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-[#111111] transition-colors">
                  เข้าสู่ระบบเจ้าของที่พัก
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-[14px] font-bold uppercase tracking-widest text-[#6B7280] mb-6">
              เชื่อต่อ
            </h4>
            <ul className="space-y-4 text-sm text-[#6B7280]">
              <li>
                <button
                  onClick={() => setContactOpen(true)}
                  className="hover:text-[#111111] cursor-pointer transition-colors"
                >
                  ติดต่อเรา
                </button>
              </li>
              <li className="hover:text-[#111111] cursor-pointer transition-colors">
                คำถามที่พบบ่อย
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-12 border-t border-gray-200 flex flex-col md:flex-row justify-between items-center gap-6 text-[12px] tracking-widest text-[#6B7280]">
          <p>&copy; {new Date().getFullYear()} Peaksnature.com all rights reserved</p>
          <div className="flex gap-8">
            <Link href="/legal#privacy" className="hover:text-[#111111] transition-colors">
              นโยบายความเป็นส่วนตัว
            </Link>
            <Link href="/legal#terms" className="hover:text-[#111111] transition-colors">
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
