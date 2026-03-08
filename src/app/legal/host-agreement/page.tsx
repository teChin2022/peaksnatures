import Link from "next/link";
import { ArrowLeft, ScrollText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Host Agreement — Peaksnature",
  description: "Peaksnature host agreement for property owners.",
};

export default async function HostAgreementPage() {
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
            <ScrollText className="h-5 w-5 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{t("hostAgreement")}</h1>
        </div>
        <div className="mt-6 space-y-4 text-sm text-gray-600">
          <p>ข้อตกลงนี้เป็นข้อตกลงระหว่าง Peaksnature กับเจ้าของที่พักที่ลงทะเบียนบนแพลตฟอร์ม</p>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">1. คุณสมบัติของเจ้าของที่พัก</h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>เจ้าของที่พักต้องมีสิทธิ์ตามกฎหมายในการให้บริการที่พัก</li>
            <li>ข้อมูลที่ให้กับแพลตฟอร์มต้องเป็นข้อมูลจริงและถูกต้อง</li>
            <li>เจ้าของที่พักต้องผ่านการตรวจสอบจากทีมงาน Peaksnature</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">2. หน้าที่ของเจ้าของที่พัก</h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>ให้ข้อมูลที่พักที่ถูกต้องและเป็นปัจจุบัน</li>
            <li>อัปเดตปฏิทินวันว่างและราคาอย่างสม่ำเสมอ</li>
            <li>ดูแลที่พักให้สะอาดและปลอดภัย</li>
            <li>ตอบกลับการจองและคำถามจากผู้เข้าพักอย่างรวดเร็ว</li>
            <li>ปฏิบัติตามกฎหมายและข้อบังคับที่เกี่ยวข้อง</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">3. การชำระเงิน</h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>ผู้เข้าพักชำระเงินโดยตรงให้กับเจ้าของที่พักผ่าน PromptPay</li>
            <li>เจ้าของที่พักเป็นผู้รับผิดชอบในการตรวจสอบการชำระเงิน</li>
            <li>เจ้าของที่พักกำหนดราคาและเงื่อนไขการชำระเงินเอง</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">4. การยกเลิกและคืนเงิน</h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>เจ้าของที่พักกำหนดนโยบายการยกเลิกของตนเอง</li>
            <li>ในกรณีที่เจ้าของที่พักยกเลิกการจอง ผู้เข้าพักควรได้รับการคืนเงินเต็มจำนวน</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">5. เนื้อหาและรีวิว</h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>เจ้าของที่พักยินยอมให้ผู้เข้าพักเขียนรีวิวหลังการเข้าพัก</li>
            <li>เจ้าของที่พักไม่สามารถลบรีวิวที่เป็นจริงได้</li>
            <li>รีวิวที่ไม่เหมาะสมสามารถแจ้งให้ Peaksnature ตรวจสอบได้</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">6. การระงับบัญชี</h2>
          <p>Peaksnature อาจระงับหรือยกเลิกบัญชีเจ้าของที่พักในกรณีต่อไปนี้:</p>
          <ul className="ml-6 list-disc space-y-2">
            <li>ให้ข้อมูลเท็จเกี่ยวกับที่พัก</li>
            <li>ไม่ปฏิบัติตามนโยบายของแพลตฟอร์ม</li>
            <li>ได้รับข้อร้องเรียนจากผู้เข้าพักซ้ำแล้วซ้ำเล่า</li>
            <li>มีพฤติกรรมที่เป็นการทุจริต</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">7. การลบบัญชี</h2>
          <p>เจ้าของที่พักสามารถลบบัญชีได้ตลอดเวลาผ่านแดชบอร์ด การลบบัญชีจะลบข้อมูลทั้งหมดรวมถึงที่พัก ห้องพัก และข้อมูลการจอง</p>

          <p className="text-gray-500 italic pt-4">การสมัครเป็นเจ้าของที่พักบน Peaksnature ถือว่าคุณยอมรับข้อตกลงนี้</p>
        </div>
      </div>
    </section>
  );
}
