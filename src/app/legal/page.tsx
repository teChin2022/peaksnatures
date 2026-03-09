import { Scale, Shield, FileText, Cookie, AlertTriangle, Handshake, MessageSquare, ScrollText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Legal & Policies — Peaksnature",
  description: "Important policies and agreements governing the use of Peaksnature.",
};

export default async function LegalPage() {
  const t = await getTranslations("legalPage");

  return (
    <section className="py-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <Scale className="h-7 w-7 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">{t("title")}</h1>
          <p className="mt-2 text-gray-600">{t("subtitle")}</p>
        </div>

        <div className="mt-12 space-y-16">

          {/* 1. Privacy Policy */}
          <div id="privacy">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-green-100 p-2.5">
                <Shield className="h-5 w-5 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("privacyPolicy")}</h2>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <p>ความเป็นส่วนตัวของผู้ใช้งานมีความสำคัญอย่างยิ่งสำหรับเรา เรามุ่งมั่นในการปกป้องข้อมูลส่วนบุคคลของคุณ และดำเนินการเก็บรวบรวม ใช้ และเก็บรักษาข้อมูลตามหลักความปลอดภัยและกฎหมายที่เกี่ยวข้อง โดยรายละเอียดการจัดการข้อมูลมีดังนี้</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">1. ข้อมูลที่เราเก็บรวบรวม</h3>
              <p>เราเก็บรวบรวมเฉพาะข้อมูลที่จำเป็นต่อการให้บริการจองที่พักและการติดต่อกับผู้ใช้บริการ ได้แก่</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ชื่อ – นามสกุล</li>
                <li>อีเมล</li>
                <li>หมายเลขโทรศัพท์</li>
                <li>จังหวัด (ไม่บังคับ)</li>
                <li>ข้อมูลการจอง เช่น วันที่เช็คอิน / เช็คเอาท์</li>
                <li>ไฟล์สลิปหรือหลักฐานการชำระเงิน</li>
                <li>ข้อมูลการใช้งานเว็บไซต์ เช่น IP Address, ประเภทอุปกรณ์ และข้อมูลคุกกี้</li>
              </ul>
              <p>ข้อมูลดังกล่าวถูกใช้เพื่อดำเนินการจองที่พัก ติดต่อยืนยันการจอง และปรับปรุงการให้บริการ</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">2. วัตถุประสงค์ในการใช้ข้อมูล</h3>
              <p>ข้อมูลของคุณจะถูกใช้เพื่อวัตถุประสงค์ต่อไปนี้</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>เพื่อดำเนินการจองที่พักและยืนยันการชำระเงิน</li>
                <li>เพื่อให้เจ้าของที่พักสามารถติดต่อผู้จองได้เมื่อจำเป็น</li>
                <li>เพื่อจัดการการเข้าพัก เช่น การเช็คอินและเช็คเอาท์</li>
                <li>เพื่อปรับปรุงคุณภาพการให้บริการและประสบการณ์ผู้ใช้งาน</li>
                <li>เพื่อป้องกันการทุจริต เช่น การตรวจสอบสลิปการชำระเงินที่ซ้ำ</li>
              </ul>
              <p>เราจะไม่ใช้ข้อมูลของคุณเพื่อวัตถุประสงค์อื่นโดยไม่ได้รับความยินยอมจากคุณ</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">3. การเปิดเผยข้อมูลแก่บุคคลที่สาม</h3>
              <p>เราจะไม่ขาย ให้เช่า หรือเปิดเผยข้อมูลส่วนบุคคลของคุณแก่บุคคลที่สามเพื่อวัตถุประสงค์ทางการตลาด</p>
              <p>อย่างไรก็ตาม ข้อมูลบางส่วนอาจถูกเปิดเผยเฉพาะเท่าที่จำเป็น เช่น</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>เจ้าของที่พักหรือผู้ให้บริการที่เกี่ยวข้องกับการจอง</li>
                <li>ผู้ให้บริการระบบชำระเงิน</li>
                <li>หน่วยงานภาครัฐหรือหน่วยงานที่มีอำนาจตามกฎหมาย</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">4. การตรวจสอบและจัดเก็บสลิปการชำระเงิน</h3>
              <p>สลิปการชำระเงินที่ผู้ใช้ส่งเข้ามาจะถูกใช้เพื่อยืนยันการชำระเงินเท่านั้น โดย</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ระบบอาจใช้เทคโนโลยีตรวจจับสลิปที่ซ้ำกันเพื่อป้องกันการทุจริต</li>
                <li>สลิปจะถูกเก็บรักษาอย่างปลอดภัยในระบบ</li>
                <li>การเข้าถึงข้อมูลดังกล่าวจะจำกัดเฉพาะผู้ดูแลระบบที่เกี่ยวข้อง</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">5. การใช้คุกกี้ (Cookies)</h3>
              <p>เว็บไซต์ของเราอาจใช้คุกกี้เพื่อ</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>จดจำการตั้งค่าของผู้ใช้งาน</li>
                <li>วิเคราะห์การใช้งานเว็บไซต์</li>
                <li>ปรับปรุงประสบการณ์การใช้งาน</li>
              </ul>
              <p>ผู้ใช้สามารถเลือกยอมรับหรือปฏิเสธการใช้คุกกี้ได้ผ่านการตั้งค่าบราวเซอร์หรือผ่านข้อความแจ้งเตือนคุกกี้ของเว็บไซต์</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">6. การเก็บข้อมูลผ่าน QR Code</h3>
              <p>ระบบของเราอาจใช้ QR Code สำหรับการ</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>เช็คอิน</li>
                <li>เช็คเอาท์</li>
                <li>การให้คะแนนหรือรีวิวการเข้าพัก</li>
              </ul>
              <p>ข้อมูลที่ได้จากการสแกน QR Code จะถูกใช้เพื่อบริหารจัดการการเข้าพักและปรับปรุงคุณภาพบริการเท่านั้น</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">7. การรักษาความปลอดภัยของข้อมูล</h3>
              <p>เราใช้มาตรการด้านเทคนิคและการจัดการเพื่อปกป้องข้อมูลของคุณ เช่น</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>การเข้ารหัสข้อมูลในการส่งผ่านเครือข่าย (HTTPS)</li>
                <li>การจำกัดสิทธิ์การเข้าถึงข้อมูล</li>
                <li>การจัดเก็บข้อมูลในระบบที่มีความปลอดภัย</li>
              </ul>
              <p>แม้เราจะพยายามอย่างเต็มที่ในการปกป้องข้อมูล แต่การส่งข้อมูลผ่านอินเทอร์เน็ตอาจมีความเสี่ยงที่อยู่นอกเหนือการควบคุมของเรา</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">8. ระยะเวลาการเก็บรักษาข้อมูล</h3>
              <p>ข้อมูลส่วนบุคคลจะถูกเก็บรักษาไว้เฉพาะระยะเวลาที่จำเป็นต่อการให้บริการ เช่น</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ข้อมูลการจองและสลิปการชำระเงิน อาจถูกเก็บไว้เพื่อการตรวจสอบและบัญชี</li>
                <li>เมื่อข้อมูลไม่จำเป็นต่อการใช้งานแล้ว ข้อมูลจะถูกลบหรือทำให้ไม่สามารถระบุตัวตนได้</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">9. สิทธิของเจ้าของข้อมูล</h3>
              <p>ผู้ใช้มีสิทธิในการ</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ขอเข้าถึงข้อมูลส่วนบุคคลของตน</li>
                <li>ขอแก้ไขข้อมูลที่ไม่ถูกต้อง</li>
                <li>ขอให้ลบหรือจำกัดการใช้ข้อมูล</li>
                <li>ถอนความยินยอมในการใช้ข้อมูล</li>
              </ul>
              <p>ผู้ใช้สามารถติดต่อเราเพื่อใช้สิทธิ์ดังกล่าวได้ผ่านช่องทางติดต่อที่ระบุในเว็บไซต์</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">10. การเปลี่ยนแปลงนโยบาย</h3>
              <p>เราอาจปรับปรุงนโยบายความเป็นส่วนตัวเป็นครั้งคราว โดยการเปลี่ยนแปลงจะประกาศบนเว็บไซต์</p>
              <p>การใช้งานเว็บไซต์ต่อไปหลังจากมีการเปลี่ยนแปลงถือว่าผู้ใช้ยอมรับนโยบายที่ปรับปรุงแล้ว</p>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* 2. Terms of Service */}
          <div id="terms">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-green-100 p-2.5">
                <FileText className="h-5 w-5 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("termsOfService")}</h2>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <p>การเข้าใช้งานเว็บไซต์หรือบริการของ Peaksnature ถือว่าคุณได้อ่าน เข้าใจ และยอมรับข้อกำหนดและเงื่อนไขต่อไปนี้</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">1. การยืนยันการจอง</h3>
              <ul className="ml-6 list-disc space-y-1">
                <li>การจองที่พักจะถือว่าสมบูรณ์เมื่อระบบได้รับและตรวจสอบการชำระเงินเรียบร้อยแล้ว</li>
                <li>หลักฐานการชำระเงิน (สลิป) อาจถูกตรวจสอบโดยระบบอัตโนมัติหรือโดยเจ้าของที่พัก</li>
                <li>หากระบบตรวจพบสลิปที่ซ้ำหรือผิดปกติ การจองอาจถูกระงับหรือยกเลิก</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">2. การชำระเงิน</h3>
              <p>ผู้เข้าพักสามารถเลือกวิธีชำระเงินตามที่ที่พักกำหนด เช่น</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ชำระเงินเต็มจำนวนล่วงหน้า</li>
                <li>ชำระเงินมัดจำล่วงหน้า</li>
              </ul>
              <p>ในกรณีที่มีการชำระมัดจำ</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ยอดเงินคงเหลือต้องชำระเมื่อเข้าพัก</li>
                <li>วิธีการชำระอาจเป็นเงินสดหรือการโอนเงินตามที่เจ้าของที่พักกำหนด</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">3. การจองชั่วคราว</h3>
              <p>เมื่อผู้ใช้เลือกวันที่เข้าพัก ระบบจะทำการจองวันดังกล่าวไว้ชั่วคราว</p>
              <p>หากไม่มีการชำระเงินภายในระยะเวลาที่กำหนด</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>การจองชั่วคราวจะถูกยกเลิกโดยอัตโนมัติ</li>
                <li>วันที่ดังกล่าวจะกลับมาเปิดให้ผู้ใช้งานอื่นจองได้</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">4. บทบาทของแพลตฟอร์ม</h3>
              <p>Peaksnature เป็นแพลตฟอร์มตัวกลาง (Marketplace Platform) ที่เชื่อมต่อระหว่างผู้เข้าพัก (Guest) และเจ้าของที่พัก (Host)</p>
              <p>Peaksnature ไม่ได้เป็นเจ้าของหรือผู้ดำเนินการที่พักโดยตรง และไม่รับผิดชอบต่อ</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>คุณภาพของที่พัก</li>
                <li>ความปลอดภัยของสถานที่</li>
                <li>การบริการของเจ้าของที่พัก</li>
              </ul>
              <p>ความรับผิดชอบในการให้บริการที่พักเป็นของเจ้าของที่พักโดยตรง</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">5. ความรับผิดชอบของผู้เข้าพัก</h3>
              <p>ผู้เข้าพักตกลงที่จะ</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ให้ข้อมูลส่วนตัวและข้อมูลติดต่อที่ถูกต้อง</li>
                <li>ปฏิบัติตามกฎของที่พักที่กำหนดโดยเจ้าของที่พัก</li>
                <li>ใช้ QR Code หรือระบบที่แพลตฟอร์มกำหนดสำหรับการเช็คอินและเช็คเอาท์</li>
                <li>ไม่ใช้บริการเพื่อวัตถุประสงค์ที่ผิดกฎหมาย</li>
              </ul>
              <p>หากมีการละเมิดกฎของที่พัก เจ้าของที่พักอาจปฏิเสธการเข้าพักหรือยกเลิกการจองได้</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">6. สิทธิ์ของเจ้าของที่พัก</h3>
              <p>เจ้าของที่พักมีสิทธิ์ในการ</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>กำหนดราคาที่พัก</li>
                <li>กำหนดวันว่างและปฏิทินการจอง</li>
                <li>กำหนดราคาตามฤดูกาลหรือช่วงเวลา</li>
                <li>กำหนดกฎของที่พัก เช่น เวลาเช็คอิน เช็คเอาท์ จำนวนผู้เข้าพักสูงสุด เป็นต้น</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">7. การยกเลิกการจอง</h3>
              <p>นโยบายการยกเลิกการจองอาจแตกต่างกันไปตามแต่ละที่พัก โดย</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ผู้เข้าพักควรตรวจสอบเงื่อนไขการยกเลิกก่อนทำการจอง</li>
                <li>การคืนเงิน (ถ้ามี) จะเป็นไปตามนโยบายที่เจ้าของที่พักกำหนด</li>
                <li>Peaksnature ทำหน้าที่เป็นตัวกลางในการสื่อสารเท่านั้น</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">8. รีวิวและความคิดเห็น</h3>
              <ul className="ml-6 list-disc space-y-1">
                <li>หลังการเข้าพัก ผู้ใช้สามารถให้คะแนนหรือรีวิวที่พักได้</li>
                <li>รีวิวควรเป็นความคิดเห็นที่สุภาพและเป็นความจริง</li>
                <li>ห้ามโพสต์ข้อมูลเท็จ หมิ่นประมาท หรือเนื้อหาที่ไม่เหมาะสม</li>
                <li>Peaksnature มีสิทธิ์ลบหรือแก้ไขรีวิวที่ไม่เหมาะสม</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">9. การใช้งานที่ไม่เหมาะสม</h3>
              <p>ผู้ใช้ตกลงที่จะไม่</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ใช้งานระบบเพื่อการทุจริต</li>
                <li>ใช้สลิปปลอมหรือสลิปซ้ำ</li>
                <li>พยายามเข้าถึงระบบโดยไม่ได้รับอนุญาต</li>
                <li>ใช้งานแพลตฟอร์มในลักษณะที่สร้างความเสียหายต่อผู้อื่น</li>
              </ul>
              <p>หากพบการกระทำดังกล่าว Peaksnature อาจ</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ระงับบัญชีผู้ใช้</li>
                <li>ยกเลิกการจอง</li>
                <li>ดำเนินการตามกฎหมาย</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">10. ข้อจำกัดความรับผิด</h3>
              <p>Peaksnature จะไม่รับผิดชอบต่อ</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ความเสียหายที่เกิดขึ้นระหว่างการเข้าพัก</li>
                <li>ความขัดแย้งระหว่างผู้เข้าพักและเจ้าของที่พัก</li>
                <li>ความเสียหายจากเหตุสุดวิสัย เช่น ภัยธรรมชาติ หรือเหตุการณ์ที่อยู่นอกเหนือการควบคุม</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">11. การเปลี่ยนแปลงข้อกำหนด</h3>
              <p>Peaksnature อาจปรับปรุงหรือแก้ไขข้อกำหนดและเงื่อนไขนี้ได้ตามความเหมาะสม</p>
              <p>การใช้งานแพลตฟอร์มหลังจากมีการแก้ไขถือว่าผู้ใช้ยอมรับข้อกำหนดฉบับใหม่</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">12. การติดต่อ</h3>
              <p>หากมีคำถามเกี่ยวกับข้อกำหนดและเงื่อนไข สามารถติดต่อผู้ดูแลแพลตฟอร์มผ่านช่องทางที่ระบุในเว็บไซต์</p>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* 3. Cancellation Policy */}
          <div id="cancellation">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-green-100 p-2.5">
                <ScrollText className="h-5 w-5 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("cancellationPolicy")}</h2>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <p>Peaksnature ให้ความสำคัญกับความยืดหยุ่นในการจองสำหรับผู้เข้าพัก ขณะเดียวกันก็คำนึงถึงผลกระทบต่อเจ้าของที่พัก</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">การยกเลิกโดยผู้เข้าพัก</h3>
              <ul className="ml-6 list-disc space-y-2">
                <li>ผู้เข้าพักสามารถยกเลิกการจองได้ภายในระยะเวลาที่เจ้าของที่พักกำหนด (เช่น ก่อนเช็คอิน X วัน)</li>
                <li>หากยกเลิกภายในระยะเวลาที่กำหนด จะได้รับการคืนเงินตามเงื่อนไขของที่พัก</li>
                <li>หากยกเลิกหลังระยะเวลาที่กำหนด อาจไม่ได้รับการคืนเงิน</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">การยกเลิกโดยเจ้าของที่พัก</h3>
              <ul className="ml-6 list-disc space-y-2">
                <li>เจ้าของที่พักสามารถยกเลิกการจองได้ โดยจะแจ้งเหตุผลให้ผู้เข้าพักทราบ</li>
                <li>ในกรณีที่เจ้าของที่พักยกเลิก ผู้เข้าพักจะได้รับการคืนเงินเต็มจำนวน</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">นโยบายการคืนเงิน</h3>
              <ul className="ml-6 list-disc space-y-2">
                <li>การคืนเงินจะดำเนินการผ่านช่องทางเดียวกับที่ชำระเงิน</li>
                <li>ระยะเวลาการคืนเงินอาจแตกต่างกันขึ้นอยู่กับช่องทางการชำระเงิน</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">กรณีพิเศษ</h3>
              <p>ในกรณีเหตุสุดวิสัย เช่น ภัยธรรมชาติหรือสถานการณ์ฉุกเฉิน Peaksnature อาจพิจารณาการยกเลิกและคืนเงินเป็นกรณีพิเศษ</p>

              <p className="text-gray-500 italic pt-2">นโยบายการยกเลิกอาจแตกต่างกันในแต่ละที่พัก กรุณาตรวจสอบรายละเอียดกับเจ้าของที่พักก่อนทำการจอง</p>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* 4. Cookie Policy */}
          <div id="cookies">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-green-100 p-2.5">
                <Cookie className="h-5 w-5 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("cookiePolicy")}</h2>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <p>Peaksnature ใช้คุกกี้และเทคโนโลยีที่คล้ายกันเพื่อปรับปรุงประสบการณ์การใช้งานของคุณ</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">คุกกี้คืออะไร</h3>
              <p>คุกกี้คือไฟล์ข้อมูลขนาดเล็กที่ถูกจัดเก็บไว้ในเบราว์เซอร์ของคุณเมื่อเยี่ยมชมเว็บไซต์ คุกกี้ช่วยให้เว็บไซต์จดจำการตั้งค่าและกิจกรรมของคุณ</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">ประเภทคุกกี้ที่เราใช้</h3>

              <p><strong>คุกกี้ที่จำเป็น</strong> — คุกกี้เหล่านี้จำเป็นสำหรับการทำงานของแพลตฟอร์ม เช่น การเข้าสู่ระบบ การจัดการเซสชัน และการรักษาความปลอดภัย</p>
              <p><strong>คุกกี้เพื่อประสิทธิภาพ</strong> — คุกกี้เหล่านี้ช่วยให้เราเข้าใจว่าผู้ใช้โต้ตอบกับแพลตฟอร์มอย่างไร เพื่อนำไปปรับปรุงบริการ</p>
              <p><strong>คุกกี้เพื่อฟังก์ชันการทำงาน</strong> — คุกกี้เหล่านี้จดจำการตั้งค่าของคุณ เช่น ภาษาที่เลือก เพื่อมอบประสบการณ์ที่เหมาะสม</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">การจัดการคุกกี้</h3>
              <ul className="ml-6 list-disc space-y-2">
                <li>คุณสามารถยอมรับหรือปฏิเสธคุกกี้ได้เมื่อได้รับแจ้งจากแพลตฟอร์ม</li>
                <li>คุณสามารถลบคุกกี้ผ่านการตั้งค่าเบราว์เซอร์ได้ตลอดเวลา</li>
                <li>การปิดใช้งานคุกกี้บางประเภทอาจส่งผลต่อการทำงานของแพลตฟอร์ม</li>
              </ul>

              <p className="text-gray-500 italic pt-2">หากมีคำถามเกี่ยวกับนโยบายคุกกี้ กรุณาติดต่อเราที่ support@peaksnature.com</p>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* 5. Fraud Prevention Policy */}
          <div id="fraud-prevention">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-green-100 p-2.5">
                <AlertTriangle className="h-5 w-5 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("fraudPrevention")}</h2>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <p>Peaksnature มุ่งมั่นป้องกันการทุจริตและปกป้องทั้งผู้เข้าพักและเจ้าของที่พัก</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">มาตรการป้องกันการทุจริต</h3>

              <p><strong>การตรวจสอบสลิปการชำระเงิน</strong></p>
              <ul className="ml-6 list-disc space-y-2">
                <li>ระบบตรวจจับสลิปที่ถูกใช้งานซ้ำโดยอัตโนมัติ</li>
                <li>ตรวจสอบข้อมูลการโอนเงินกับยอดที่ต้องชำระ</li>
                <li>การตรวจสอบเพิ่มเติมโดยเจ้าของที่พักหรือผู้ดูแลระบบ</li>
              </ul>

              <p><strong>การตรวจสอบบัญชีผู้ใช้</strong></p>
              <ul className="ml-6 list-disc space-y-2">
                <li>การยืนยันตัวตนผ่านอีเมล</li>
                <li>ระบบ CAPTCHA ป้องกันบอท</li>
                <li>การตรวจสอบเจ้าของที่พักก่อนอนุมัติบัญชี</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">พฤติกรรมที่ถือว่าเป็นการทุจริต</h3>
              <ul className="ml-6 list-disc space-y-2">
                <li>การใช้สลิปการชำระเงินปลอมหรือซ้ำ</li>
                <li>การให้ข้อมูลเท็จเกี่ยวกับที่พัก</li>
                <li>การสร้างบัญชีปลอมเพื่อหลอกลวง</li>
                <li>การรีวิวเท็จเพื่อสร้างความเสียหาย</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">การดำเนินการเมื่อตรวจพบการทุจริต</h3>
              <ul className="ml-6 list-disc space-y-2">
                <li>ระงับการจองที่น่าสงสัยชั่วคราว</li>
                <li>แจ้งเตือนเจ้าของที่พักหรือผู้เข้าพักที่เกี่ยวข้อง</li>
                <li>ระงับหรือยกเลิกบัญชีที่ทำผิดกฎ</li>
              </ul>

              <p className="text-gray-500 italic pt-2">หากคุณพบพฤติกรรมที่น่าสงสัย กรุณาแจ้งเราที่ support@peaksnature.com</p>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* 6. Dispute Resolution Policy */}
          <div id="dispute-resolution">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-green-100 p-2.5">
                <Handshake className="h-5 w-5 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("disputeResolution")}</h2>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <p>Peaksnature มีกระบวนการจัดการข้อพิพาทเพื่อช่วยแก้ไขปัญหาระหว่างผู้เข้าพักและเจ้าของที่พักอย่างเป็นธรรม</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">ขั้นตอนการแจ้งข้อพิพาท</h3>
              <ul className="ml-6 list-decimal space-y-2">
                <li>ผู้เข้าพักหรือเจ้าของที่พักสามารถแจ้งปัญหาผ่านช่องทางติดต่อของ Peaksnature</li>
                <li>ทีมงานจะตรวจสอบข้อมูลและรายละเอียดของการจอง</li>
                <li>ทีมงานจะติดต่อทั้งสองฝ่ายเพื่อรวบรวมข้อเท็จจริง</li>
                <li>Peaksnature จะพิจารณาและเสนอแนวทางแก้ไข</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">ประเภทข้อพิพาทที่พบบ่อย</h3>
              <ul className="ml-6 list-disc space-y-2">
                <li>ที่พักไม่ตรงกับข้อมูลที่แสดง</li>
                <li>ปัญหาเรื่องความสะอาดหรือความปลอดภัย</li>
                <li>ข้อพิพาทเกี่ยวกับการชำระเงินหรือการคืนเงิน</li>
                <li>ปัญหาเกี่ยวกับการเช็คอินหรือเช็คเอาท์</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">แนวทางการแก้ไข</h3>
              <ul className="ml-6 list-disc space-y-2">
                <li>การเจรจาไกล่เกลี่ยระหว่างทั้งสองฝ่าย</li>
                <li>การคืนเงินบางส่วนหรือทั้งหมดตามความเหมาะสม</li>
                <li>การปรับปรุงข้อมูลที่พักให้ถูกต้อง</li>
                <li>ในกรณีร้ายแรง อาจมีการระงับบัญชีของฝ่ายที่ทำผิด</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">ระยะเวลาดำเนินการ</h3>
              <p>Peaksnature จะพยายามตอบกลับภายใน 48 ชั่วโมงหลังจากได้รับแจ้ง และจะดำเนินการแก้ไขให้เร็วที่สุด</p>

              <p className="text-gray-500 italic pt-2">หากต้องการแจ้งข้อพิพาท กรุณาติดต่อ support@peaksnature.com พร้อมรหัสการจองของคุณ</p>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* 7. Content & Review Policy */}
          <div id="content-review">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-green-100 p-2.5">
                <MessageSquare className="h-5 w-5 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("contentReview")}</h2>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <p>Peaksnature ให้ความสำคัญกับเนื้อหาที่ถูกต้อง เป็นจริง และเป็นประโยชน์สำหรับผู้ใช้ทุกคน</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">นโยบายเนื้อหาที่พัก</h3>
              <ul className="ml-6 list-disc space-y-2">
                <li>ข้อมูลที่พักต้องเป็นข้อมูลจริงและถูกต้อง</li>
                <li>รูปภาพต้องเป็นภาพจริงของที่พักและสะท้อนสภาพปัจจุบัน</li>
                <li>ราคาที่แสดงต้องเป็นราคาจริงที่ผู้เข้าพักต้องชำระ</li>
                <li>ห้ามใช้เนื้อหาที่ทำให้เข้าใจผิดหรือเกินจริง</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">นโยบายรีวิว</h3>

              <p><strong>การเขียนรีวิว</strong></p>
              <ul className="ml-6 list-disc space-y-2">
                <li>เฉพาะผู้เข้าพักที่เข้าพักจริงเท่านั้นที่สามารถเขียนรีวิวได้</li>
                <li>รีวิวควรเป็นข้อมูลที่เป็นจริงตามประสบการณ์จริง</li>
                <li>รีวิวควรเป็นประโยชน์และให้ข้อมูลที่เป็นกลาง</li>
              </ul>

              <p><strong>เนื้อหาที่ไม่เหมาะสม</strong> — รีวิวหรือเนื้อหาต่อไปนี้อาจถูกลบโดยแพลตฟอร์ม:</p>
              <ul className="ml-6 list-disc space-y-2">
                <li>เนื้อหาที่เป็นเท็จหรือหลอกลวง</li>
                <li>เนื้อหาที่ใช้ภาษาหยาบคายหรือไม่เหมาะสม</li>
                <li>เนื้อหาที่เป็นสแปมหรือโฆษณา</li>
                <li>เนื้อหาที่ละเมิดความเป็นส่วนตัวของผู้อื่น</li>
                <li>รีวิวที่ไม่เกี่ยวข้องกับการเข้าพัก</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">การแจ้งเนื้อหาที่ไม่เหมาะสม</h3>
              <p>หากคุณพบเนื้อหาที่ไม่เหมาะสม กรุณาแจ้ง Peaksnature เพื่อดำเนินการตรวจสอบ</p>

              <p className="text-gray-500 italic pt-2">Peaksnature ขอสงวนสิทธิ์ในการลบเนื้อหาที่ไม่เป็นไปตามนโยบาย</p>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* 8. Host Agreement */}
          <div id="host-agreement">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-green-100 p-2.5">
                <ScrollText className="h-5 w-5 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("hostAgreement")}</h2>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <p>ข้อตกลงนี้เป็นข้อตกลงระหว่าง Peaksnature กับเจ้าของที่พักที่ลงทะเบียนบนแพลตฟอร์ม</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">1. คุณสมบัติของเจ้าของที่พัก</h3>
              <ul className="ml-6 list-disc space-y-2">
                <li>เจ้าของที่พักต้องมีสิทธิ์ตามกฎหมายในการให้บริการที่พัก</li>
                <li>ข้อมูลที่ให้กับแพลตฟอร์มต้องเป็นข้อมูลจริงและถูกต้อง</li>
                <li>เจ้าของที่พักต้องผ่านการตรวจสอบจากทีมงาน Peaksnature</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">2. หน้าที่ของเจ้าของที่พัก</h3>
              <ul className="ml-6 list-disc space-y-2">
                <li>ให้ข้อมูลที่พักที่ถูกต้องและเป็นปัจจุบัน</li>
                <li>อัปเดตปฏิทินวันว่างและราคาอย่างสม่ำเสมอ</li>
                <li>ดูแลที่พักให้สะอาดและปลอดภัย</li>
                <li>ตอบกลับการจองและคำถามจากผู้เข้าพักอย่างรวดเร็ว</li>
                <li>ปฏิบัติตามกฎหมายและข้อบังคับที่เกี่ยวข้อง</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">3. การชำระเงิน</h3>
              <ul className="ml-6 list-disc space-y-2">
                <li>ผู้เข้าพักชำระเงินโดยตรงให้กับเจ้าของที่พักผ่าน PromptPay</li>
                <li>เจ้าของที่พักเป็นผู้รับผิดชอบในการตรวจสอบการชำระเงิน</li>
                <li>เจ้าของที่พักกำหนดราคาและเงื่อนไขการชำระเงินเอง</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">4. การยกเลิกและคืนเงิน</h3>
              <ul className="ml-6 list-disc space-y-2">
                <li>เจ้าของที่พักกำหนดนโยบายการยกเลิกของตนเอง</li>
                <li>ในกรณีที่เจ้าของที่พักยกเลิกการจอง ผู้เข้าพักควรได้รับการคืนเงินเต็มจำนวน</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">5. เนื้อหาและรีวิว</h3>
              <ul className="ml-6 list-disc space-y-2">
                <li>เจ้าของที่พักยินยอมให้ผู้เข้าพักเขียนรีวิวหลังการเข้าพัก</li>
                <li>เจ้าของที่พักไม่สามารถลบรีวิวที่เป็นจริงได้</li>
                <li>รีวิวที่ไม่เหมาะสมสามารถแจ้งให้ Peaksnature ตรวจสอบได้</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">6. การระงับบัญชี</h3>
              <p>Peaksnature อาจระงับหรือยกเลิกบัญชีเจ้าของที่พักในกรณีต่อไปนี้:</p>
              <ul className="ml-6 list-disc space-y-2">
                <li>ให้ข้อมูลเท็จเกี่ยวกับที่พัก</li>
                <li>ไม่ปฏิบัติตามนโยบายของแพลตฟอร์ม</li>
                <li>ได้รับข้อร้องเรียนจากผู้เข้าพักซ้ำแล้วซ้ำเล่า</li>
                <li>มีพฤติกรรมที่เป็นการทุจริต</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">7. การลบบัญชี</h3>
              <p>เจ้าของที่พักสามารถลบบัญชีได้ตลอดเวลาผ่านแดชบอร์ด การลบบัญชีจะลบข้อมูลทั้งหมดรวมถึงที่พัก ห้องพัก และข้อมูลการจอง</p>

              <p className="text-gray-500 italic pt-2">การสมัครเป็นเจ้าของที่พักบน Peaksnature ถือว่าคุณยอมรับข้อตกลงนี้</p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
