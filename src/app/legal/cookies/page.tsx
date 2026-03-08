import Link from "next/link";
import { ArrowLeft, Cookie } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy — Peaksnature",
  description: "Peaksnature cookie policy.",
};

export default async function CookiePolicyPage() {
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
            <Cookie className="h-5 w-5 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{t("cookiePolicy")}</h1>
        </div>
        <div className="mt-6 space-y-4 text-sm text-gray-600">
          <p>Peaksnature ใช้คุกกี้และเทคโนโลยีที่คล้ายกันเพื่อปรับปรุงประสบการณ์การใช้งานของคุณ</p>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">คุกกี้คืออะไร</h2>
          <p>คุกกี้คือไฟล์ข้อมูลขนาดเล็กที่ถูกจัดเก็บไว้ในเบราว์เซอร์ของคุณเมื่อเยี่ยมชมเว็บไซต์ คุกกี้ช่วยให้เว็บไซต์จดจำการตั้งค่าและกิจกรรมของคุณ</p>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">ประเภทคุกกี้ที่เราใช้</h2>

          <h3 className="font-semibold text-gray-800 pt-2">คุกกี้ที่จำเป็น</h3>
          <p>คุกกี้เหล่านี้จำเป็นสำหรับการทำงานของแพลตฟอร์ม เช่น การเข้าสู่ระบบ การจัดการเซสชัน และการรักษาความปลอดภัย</p>

          <h3 className="font-semibold text-gray-800 pt-2">คุกกี้เพื่อประสิทธิภาพ</h3>
          <p>คุกกี้เหล่านี้ช่วยให้เราเข้าใจว่าผู้ใช้โต้ตอบกับแพลตฟอร์มอย่างไร เพื่อนำไปปรับปรุงบริการ</p>

          <h3 className="font-semibold text-gray-800 pt-2">คุกกี้เพื่อฟังก์ชันการทำงาน</h3>
          <p>คุกกี้เหล่านี้จดจำการตั้งค่าของคุณ เช่น ภาษาที่เลือก เพื่อมอบประสบการณ์ที่เหมาะสม</p>

          <h2 className="text-lg font-semibold text-gray-900 pt-4">การจัดการคุกกี้</h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>คุณสามารถยอมรับหรือปฏิเสธคุกกี้ได้เมื่อได้รับแจ้งจากแพลตฟอร์ม</li>
            <li>คุณสามารถลบคุกกี้ผ่านการตั้งค่าเบราว์เซอร์ได้ตลอดเวลา</li>
            <li>การปิดใช้งานคุกกี้บางประเภทอาจส่งผลต่อการทำงานของแพลตฟอร์ม</li>
          </ul>

          <p className="text-gray-500 italic pt-4">หากมีคำถามเกี่ยวกับนโยบายคุกกี้ กรุณาติดต่อเราที่ support@peaksnature.com</p>
        </div>
      </div>
    </section>
  );
}
