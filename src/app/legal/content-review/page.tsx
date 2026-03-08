import Link from "next/link";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Content & Review Policy — Peaksnature",
  description: "Peaksnature content and review policy.",
};

export default async function ContentReviewPage() {
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
            <MessageSquare className="h-5 w-5 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{t("contentReview")}</h1>
        </div>
        <div className="mt-6 space-y-4 text-sm text-gray-600">
          <p>Peaksnature ให้ความสำคัญกับเนื้อหาที่ถูกต้อง เป็นจริง และเป็นประโยชน์สำหรับผู้ใช้ทุกคน</p>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">นโยบายเนื้อหาที่พัก</h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>ข้อมูลที่พักต้องเป็นข้อมูลจริงและถูกต้อง</li>
            <li>รูปภาพต้องเป็นภาพจริงของที่พักและสะท้อนสภาพปัจจุบัน</li>
            <li>ราคาที่แสดงต้องเป็นราคาจริงที่ผู้เข้าพักต้องชำระ</li>
            <li>ห้ามใช้เนื้อหาที่ทำให้เข้าใจผิดหรือเกินจริง</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">นโยบายรีวิว</h2>

          <h3 className="font-semibold text-gray-800 pt-2">การเขียนรีวิว</h3>
          <ul className="ml-6 list-disc space-y-2">
            <li>เฉพาะผู้เข้าพักที่เข้าพักจริงเท่านั้นที่สามารถเขียนรีวิวได้</li>
            <li>รีวิวควรเป็นข้อมูลที่เป็นจริงตามประสบการณ์จริง</li>
            <li>รีวิวควรเป็นประโยชน์และให้ข้อมูลที่เป็นกลาง</li>
          </ul>

          <h3 className="font-semibold text-gray-800 pt-2">เนื้อหาที่ไม่เหมาะสม</h3>
          <p>รีวิวหรือเนื้อหาต่อไปนี้อาจถูกลบโดยแพลตฟอร์ม:</p>
          <ul className="ml-6 list-disc space-y-2">
            <li>เนื้อหาที่เป็นเท็จหรือหลอกลวง</li>
            <li>เนื้อหาที่ใช้ภาษาหยาบคายหรือไม่เหมาะสม</li>
            <li>เนื้อหาที่เป็นสแปมหรือโฆษณา</li>
            <li>เนื้อหาที่ละเมิดความเป็นส่วนตัวของผู้อื่น</li>
            <li>รีวิวที่ไม่เกี่ยวข้องกับการเข้าพัก</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">การแจ้งเนื้อหาที่ไม่เหมาะสม</h2>
          <p>หากคุณพบเนื้อหาที่ไม่เหมาะสม กรุณาแจ้ง Peaksnature เพื่อดำเนินการตรวจสอบ</p>

          <p className="text-gray-500 italic pt-4">Peaksnature ขอสงวนสิทธิ์ในการลบเนื้อหาที่ไม่เป็นไปตามนโยบาย</p>
        </div>
      </div>
    </section>
  );
}
