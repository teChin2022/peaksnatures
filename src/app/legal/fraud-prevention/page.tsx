import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fraud Prevention Policy — Peaksnature",
  description: "Peaksnature fraud prevention policy.",
};

export default async function FraudPreventionPage() {
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
            <AlertTriangle className="h-5 w-5 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{t("fraudPrevention")}</h1>
        </div>
        <div className="mt-6 space-y-4 text-sm text-gray-600">
          <p>Peaksnature มุ่งมั่นป้องกันการทุจริตและปกป้องทั้งผู้เข้าพักและเจ้าของที่พัก</p>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">มาตรการป้องกันการทุจริต</h2>

          <h3 className="font-semibold text-gray-800 pt-2">การตรวจสอบสลิปการชำระเงิน</h3>
          <ul className="ml-6 list-disc space-y-2">
            <li>ระบบตรวจจับสลิปที่ถูกใช้งานซ้ำโดยอัตโนมัติ</li>
            <li>ตรวจสอบข้อมูลการโอนเงินกับยอดที่ต้องชำระ</li>
            <li>การตรวจสอบเพิ่มเติมโดยเจ้าของที่พักหรือผู้ดูแลระบบ</li>
          </ul>

          <h3 className="font-semibold text-gray-800 pt-2">การตรวจสอบบัญชีผู้ใช้</h3>
          <ul className="ml-6 list-disc space-y-2">
            <li>การยืนยันตัวตนผ่านอีเมล</li>
            <li>ระบบ CAPTCHA ป้องกันบอท</li>
            <li>การตรวจสอบเจ้าของที่พักก่อนอนุมัติบัญชี</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">พฤติกรรมที่ถือว่าเป็นการทุจริต</h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>การใช้สลิปการชำระเงินปลอมหรือซ้ำ</li>
            <li>การให้ข้อมูลเท็จเกี่ยวกับที่พัก</li>
            <li>การสร้างบัญชีปลอมเพื่อหลอกลวง</li>
            <li>การรีวิวเท็จเพื่อสร้างความเสียหาย</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">การดำเนินการเมื่อตรวจพบการทุจริต</h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>ระงับการจองที่น่าสงสัยชั่วคราว</li>
            <li>แจ้งเตือนเจ้าของที่พักหรือผู้เข้าพักที่เกี่ยวข้อง</li>
            <li>ระงับหรือยกเลิกบัญชีที่ทำผิดกฎ</li>
          </ul>

          <p className="text-gray-500 italic pt-4">หากคุณพบพฤติกรรมที่น่าสงสัย กรุณาแจ้งเราที่ support@peaksnature.com</p>
        </div>
      </div>
    </section>
  );
}
