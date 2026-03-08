import Link from "next/link";
import { ArrowLeft, ScrollText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cancellation Policy — Peaksnature",
  description: "Peaksnature cancellation policy for bookings.",
};

export default async function CancellationPolicyPage() {
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
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{t("cancellationPolicy")}</h1>
        </div>
        <div className="mt-6 space-y-4 text-sm text-gray-600">
          <p>Peaksnature ให้ความสำคัญกับความยืดหยุ่นในการจองสำหรับผู้เข้าพัก ขณะเดียวกันก็คำนึงถึงผลกระทบต่อเจ้าของที่พัก</p>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">การยกเลิกโดยผู้เข้าพัก</h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>ผู้เข้าพักสามารถยกเลิกการจองได้ภายในระยะเวลาที่เจ้าของที่พักกำหนด (เช่น ก่อนเช็คอิน X วัน)</li>
            <li>หากยกเลิกภายในระยะเวลาที่กำหนด จะได้รับการคืนเงินตามเงื่อนไขของที่พัก</li>
            <li>หากยกเลิกหลังระยะเวลาที่กำหนด อาจไม่ได้รับการคืนเงิน</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">การยกเลิกโดยเจ้าของที่พัก</h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>เจ้าของที่พักสามารถยกเลิกการจองได้ โดยจะแจ้งเหตุผลให้ผู้เข้าพักทราบ</li>
            <li>ในกรณีที่เจ้าของที่พักยกเลิก ผู้เข้าพักจะได้รับการคืนเงินเต็มจำนวน</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">นโยบายการคืนเงิน</h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>การคืนเงินจะดำเนินการผ่านช่องทางเดียวกับที่ชำระเงิน</li>
            <li>ระยะเวลาการคืนเงินอาจแตกต่างกันขึ้นอยู่กับช่องทางการชำระเงิน</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">กรณีพิเศษ</h2>
          <p>ในกรณีเหตุสุดวิสัย เช่น ภัยธรรมชาติหรือสถานการณ์ฉุกเฉิน Peaksnature อาจพิจารณาการยกเลิกและคืนเงินเป็นกรณีพิเศษ</p>

          <p className="text-gray-500 italic pt-4">นโยบายการยกเลิกอาจแตกต่างกันในแต่ละที่พัก กรุณาตรวจสอบรายละเอียดกับเจ้าของที่พักก่อนทำการจอง</p>
        </div>
      </div>
    </section>
  );
}
