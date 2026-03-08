import Link from "next/link";
import { ArrowLeft, Handshake } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dispute Resolution Policy — Peaksnature",
  description: "Peaksnature dispute resolution policy.",
};

export default async function DisputeResolutionPage() {
  const t = await getTranslations("legalPage");

  return (
    <section className="py-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/legal">
              <ArrowLeft className="mr-1 h-4 w-4" />
              {t("title")}
            </Link>
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-green-100 p-2.5">
            <Handshake className="h-5 w-5 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{t("disputeResolution")}</h1>
        </div>
        <div className="mt-6 space-y-4 text-sm text-gray-600">
          <p>Peaksnature มีกระบวนการจัดการข้อพิพาทเพื่อช่วยแก้ไขปัญหาระหว่างผู้เข้าพักและเจ้าของที่พักอย่างเป็นธรรม</p>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">ขั้นตอนการแจ้งข้อพิพาท</h2>
          <ul className="ml-6 list-decimal space-y-2">
            <li>ผู้เข้าพักหรือเจ้าของที่พักสามารถแจ้งปัญหาผ่านช่องทางติดต่อของ Peaksnature</li>
            <li>ทีมงานจะตรวจสอบข้อมูลและรายละเอียดของการจอง</li>
            <li>ทีมงานจะติดต่อทั้งสองฝ่ายเพื่อรวบรวมข้อเท็จจริง</li>
            <li>Peaksnature จะพิจารณาและเสนอแนวทางแก้ไข</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">ประเภทข้อพิพาทที่พบบ่อย</h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>ที่พักไม่ตรงกับข้อมูลที่แสดง</li>
            <li>ปัญหาเรื่องความสะอาดหรือความปลอดภัย</li>
            <li>ข้อพิพาทเกี่ยวกับการชำระเงินหรือการคืนเงิน</li>
            <li>ปัญหาเกี่ยวกับการเช็คอินหรือเช็คเอาท์</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">แนวทางการแก้ไข</h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>การเจรจาไกล่เกลี่ยระหว่างทั้งสองฝ่าย</li>
            <li>การคืนเงินบางส่วนหรือทั้งหมดตามความเหมาะสม</li>
            <li>การปรับปรุงข้อมูลที่พักให้ถูกต้อง</li>
            <li>ในกรณีร้ายแรง อาจมีการระงับบัญชีของฝ่ายที่ทำผิด</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">ระยะเวลาดำเนินการ</h2>
          <p>Peaksnature จะพยายามตอบกลับภายใน 48 ชั่วโมงหลังจากได้รับแจ้ง และจะดำเนินการแก้ไขให้เร็วที่สุด</p>

          <p className="text-gray-500 italic pt-4">หากต้องการแจ้งข้อพิพาท กรุณาติดต่อ support@peaksnature.com พร้อมรหัสการจองของคุณ</p>
        </div>
      </div>
    </section>
  );
}
