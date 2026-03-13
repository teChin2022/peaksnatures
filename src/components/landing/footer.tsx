import { Instagram, Facebook, Twitter } from "lucide-react";
import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="bg-zinc-100 text-zinc-900 pt-24 pb-12 border-t border-zinc-200">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-12 mb-24">
          <div className="col-span-2">
            <h2 className="text-3xl font-serif mb-6 text-zinc-900">
              Peaksnature
            </h2>
            <p className="text-zinc-600 max-w-sm mb-8">
              คัดสรรที่พักกลางธรรมชาติ
              <br />
              ในมุมที่เงียบสงบและน่าค้นพบ
            </p>
            <div className="flex gap-4">
              <span className="w-10 h-10 rounded-full border border-zinc-300 flex items-center justify-center hover:border-zinc-900 hover:text-zinc-900 text-zinc-500 cursor-pointer transition-colors">
                <Instagram size={18} />
              </span>
              <span className="w-10 h-10 rounded-full border border-zinc-300 flex items-center justify-center hover:border-zinc-900 hover:text-zinc-900 text-zinc-500 cursor-pointer transition-colors">
                <Facebook size={18} />
              </span>
              <span className="w-10 h-10 rounded-full border border-zinc-300 flex items-center justify-center hover:border-zinc-900 hover:text-zinc-900 text-zinc-500 cursor-pointer transition-colors">
                <Twitter size={18} />
              </span>
            </div>
          </div>

          <div>
            <h4 className="text-[14px] font-bold uppercase tracking-widest text-zinc-600 mb-6">
              ค้นพบ
            </h4>
            <ul className="space-y-4 text-sm text-zinc-600">
              <li className="hover:text-zinc-900 cursor-pointer transition-colors">
                ที่พักทั้งหมด
              </li>
              <li>
                <Link href="/register" className="hover:text-zinc-900 transition-colors">
                  ลงทะเบียบสำหรับเจ้าของที่พัก
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-zinc-900 transition-colors">
                  เข้าสู่ระบบสำหรับเจ้าของที่พัก
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-[14px] font-bold uppercase tracking-widest text-zinc-600 mb-6">
              เชื่อต่อ
            </h4>
            <ul className="space-y-4 text-sm text-zinc-600">
              <li className="hover:text-zinc-900 cursor-pointer transition-colors">
                ติดต่อเรา
              </li>
              <li className="hover:text-zinc-900 cursor-pointer transition-colors">
                คำถามที่พบบ่อย
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-12 border-t border-zinc-200 flex flex-col md:flex-row justify-between items-center gap-6 text-[12px] font-bold uppercase tracking-widest text-zinc-600">
          <p>&copy; {new Date().getFullYear()} PEAKSNATURE.COM ALL RIGHTS RESERVED</p>
          <div className="flex gap-8">
            <Link href="/legal#privacy" className="hover:text-zinc-900 transition-colors">
              นโยบายความเป็นส่วนตัว
            </Link>
            <Link href="/legal#terms" className="hover:text-zinc-900 transition-colors">
              ข้อกำหนดการให้บริการ
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
