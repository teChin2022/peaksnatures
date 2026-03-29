import { Scale, Shield, FileText, Cookie, AlertTriangle, Handshake, MessageSquare, ScrollText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export const revalidate = 3600;

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
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
            <Scale className="h-7 w-7 text-gray-900" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">{t("title")}</h1>
          <p className="mt-2 text-gray-600">{t("subtitle")}</p>
        </div>

        <div className="mt-12 space-y-16">

          {/* 1. Privacy Policy */}
          <div id="privacy">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-gray-100 p-2.5">
                <Shield className="h-5 w-5 text-gray-900" />
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
                <li>จังหวัด</li>
                <li>ข้อมูลการจอง เช่น วันที่เช็คอิน / เช็คเอาท์</li>
                <li>ไฟล์สลิปหรือหลักฐานการชำระเงิน</li>
                <li>ข้อมูลบัญชีธนาคารของเจ้าของที่พัก เช่น ชื่อธนาคาร หมายเลขบัญชี และชื่อบัญชี (สำหรับรับชำระเงินจากผู้เข้าพัก)</li>
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
                <li>ระบบจะตรวจสอบข้อมูลผู้รับเงินในสลิป โดยเปรียบเทียบกับหมายเลข PromptPay หรือหมายเลขบัญชีธนาคารของเจ้าของที่พัก</li>
                <li>สลิปจะถูกเก็บรักษาอย่างปลอดภัยในระบบ</li>
                <li>การเข้าถึงข้อมูลดังกล่าวจะจำกัดเฉพาะผู้ดูแลระบบที่เกี่ยวข้อง</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">4.1 การแสดงข้อมูลบัญชีธนาคารของเจ้าของที่พัก</h3>
              <p>เจ้าของที่พักสามารถเลือกแสดงข้อมูลการชำระเงินให้ผู้เข้าพักเห็นได้ 2 รูปแบบ</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>QR Code PromptPay — ระบบจะสร้าง QR Code จากหมายเลข PromptPay ของเจ้าของที่พัก</li>
                <li>โอนผ่านบัญชีธนาคาร — ระบบจะแสดงชื่อธนาคาร หมายเลขบัญชี และชื่อบัญชีของเจ้าของที่พัก</li>
              </ul>
              <p>ข้อมูลบัญชีธนาคารที่แสดงต่อผู้เข้าพักเป็นข้อมูลที่เจ้าของที่พักเลือกเปิดเผยโดยสมัครใจ เพื่อให้ผู้เข้าพักสามารถชำระเงินได้</p>

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
              <div className="rounded-lg bg-gray-100 p-2.5">
                <FileText className="h-5 w-5 text-gray-900" />
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
              <p>ช่องทางการชำระเงินขึ้นอยู่กับการตั้งค่าของเจ้าของที่พัก โดยอาจเป็น</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>โอนเงินผ่าน PromptPay (สแกน QR Code)</li>
                <li>โอนเงินผ่านบัญชีธนาคารของเจ้าของที่พัก</li>
                <li>ชำระเงินสด ณ ที่พัก (สำหรับยอดค้างชำระ)</li>
              </ul>
              <p>ในกรณีที่มีการชำระมัดจำ</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ยอดเงินคงเหลือต้องชำระเมื่อเข้าพัก</li>
                <li>วิธีการชำระอาจเป็นเงินสดหรือการโอนเงินตามที่เจ้าของที่พักกำหนด</li>
              </ul>
              <p>Peaksnature ไม่ได้เป็นผู้รับเงินโดยตรง การชำระเงินเป็นการทำธุรกรรมระหว่างผู้เข้าพักและเจ้าของที่พัก ผู้เข้าพักควรตรวจสอบข้อมูลบัญชีผู้รับเงินให้ถูกต้องก่อนทำการโอน</p>

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
                <li>เลือกวิธีแสดงข้อมูลการรับชำระเงิน (PromptPay QR หรือบัญชีธนาคาร)</li>
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
              <div className="rounded-lg bg-gray-100 p-2.5">
                <ScrollText className="h-5 w-5 text-gray-900" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("cancellationPolicy")}</h2>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <p>นโยบายการยกเลิกการจองของ Peaksnature มีวัตถุประสงค์เพื่อสร้างความชัดเจนระหว่างผู้เข้าพักและเจ้าของที่พัก โดยมีเงื่อนไขดังต่อไปนี้</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">1. การยกเลิกโดยผู้เข้าพัก</h3>
              <p>ผู้เข้าพักสามารถยกเลิกการจองได้ตามเงื่อนไขที่เจ้าของที่พักกำหนด ซึ่งอาจแตกต่างกันไปในแต่ละที่พัก</p>
              <p>ตัวอย่างเงื่อนไขที่พักอาจกำหนด เช่น</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ยกเลิกก่อนเข้าพัก 7 วัน — คืนเงินเต็มจำนวน</li>
                <li>ยกเลิกก่อนเข้าพัก 3 วัน — คืนเงินบางส่วน</li>
                <li>ยกเลิกน้อยกว่า 3 วัน — ไม่คืนเงินมัดจำ</li>
              </ul>
              <p>ผู้เข้าพักควรตรวจสอบนโยบายของแต่ละที่พักก่อนทำการจอง</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">2. การยกเลิกโดยเจ้าของที่พัก</h3>
              <p>ในบางกรณี เจ้าของที่พักอาจจำเป็นต้องยกเลิกการจอง เช่น</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ที่พักไม่พร้อมให้บริการ</li>
                <li>เหตุสุดวิสัย เช่น ภัยธรรมชาติ</li>
                <li>ปัญหาด้านความปลอดภัย</li>
              </ul>
              <p>ในกรณีดังกล่าว เจ้าของที่พักควรแจ้งผู้เข้าพักโดยเร็วที่สุด และดำเนินการคืนเงินตามที่ตกลงกัน</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">3. การยกเลิกโดยระบบ</h3>
              <p>Peaksnature อาจยกเลิกการจองในกรณีต่อไปนี้</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ตรวจพบสลิปปลอมหรือสลิปซ้ำ</li>
                <li>ไม่ชำระเงินภายในเวลาที่กำหนด</li>
                <li>ตรวจพบพฤติกรรมที่เข้าข่ายการทุจริต</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">4. การคืนเงิน</h3>
              <p>การคืนเงิน (ถ้ามี) จะเป็นไปตามเงื่อนไขของเจ้าของที่พัก และอาจใช้ระยะเวลาในการดำเนินการตามช่องทางการชำระเงิน</p>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* 4. Cookie Policy */}
          <div id="cookies">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-gray-100 p-2.5">
                <Cookie className="h-5 w-5 text-gray-900" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("cookiePolicy")}</h2>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <p>เว็บไซต์ Peaksnature ใช้คุกกี้และเทคโนโลยีที่คล้ายกันเพื่อปรับปรุงประสบการณ์ของผู้ใช้งาน</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">1. คุกกี้คืออะไร</h3>
              <p>คุกกี้คือไฟล์ขนาดเล็กที่ถูกบันทึกลงในอุปกรณ์ของผู้ใช้งานเมื่อเข้าชมเว็บไซต์ เพื่อช่วยให้เว็บไซต์สามารถจดจำการตั้งค่าหรือพฤติกรรมการใช้งานได้</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">2. ประเภทของคุกกี้ที่เราใช้</h3>
              <p><strong>1. Essential Cookies</strong></p>
              <p>จำเป็นสำหรับการทำงานของเว็บไซต์ เช่น การเข้าสู่ระบบและการจองที่พัก</p>
              <p><strong>2. Analytics Cookies</strong></p>
              <p>ใช้เพื่อวิเคราะห์การใช้งานเว็บไซต์ เช่น จำนวนผู้เข้าชม หรือหน้าที่ได้รับความนิยม</p>
              <p><strong>3. Preference Cookies</strong></p>
              <p>ใช้จดจำการตั้งค่าของผู้ใช้งาน เช่น ภาษา หรือการตั้งค่าคุกกี้</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">3. การจัดการคุกกี้</h3>
              <p>ผู้ใช้สามารถ</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ยอมรับคุกกี้ทั้งหมด</li>
                <li>ปฏิเสธคุกกี้บางประเภท</li>
                <li>ปิดคุกกี้ผ่านการตั้งค่าของเว็บเบราว์เซอร์</li>
              </ul>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* 5. Fraud Prevention Policy */}
          <div id="fraud-prevention">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-gray-100 p-2.5">
                <AlertTriangle className="h-5 w-5 text-gray-900" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("fraudPrevention")}</h2>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <p>Peaksnature ให้ความสำคัญกับความปลอดภัยของผู้ใช้งานทุกฝ่าย จึงมีมาตรการป้องกันการทุจริตในการใช้งานแพลตฟอร์ม</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">1. การตรวจสอบการชำระเงิน</h3>
              <p>เพื่อป้องกันการทุจริต ระบบอาจทำการตรวจสอบหลักฐานการชำระเงินโดย</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>การตรวจสอบด้วยระบบอัตโนมัติ</li>
                <li>การตรวจสอบโดยผู้ดูแลระบบ</li>
                <li>การตรวจสอบโดยเจ้าของที่พัก</li>
              </ul>
              <p>ระบบอาจตรวจจับ</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>สลิปที่ถูกใช้งานซ้ำ</li>
                <li>สลิปที่ถูกแก้ไข</li>
                <li>สลิปที่ไม่ตรงกับยอดเงิน</li>
                <li>สลิปที่ผู้รับเงินไม่ตรงกับหมายเลข PromptPay หรือบัญชีธนาคารของเจ้าของที่พัก</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">2. การใช้งานที่ถือเป็นการทุจริต</h3>
              <p>การกระทำต่อไปนี้ถือว่าเป็นการละเมิดนโยบาย</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>อัปโหลดสลิปปลอม</li>
                <li>ใช้สลิปซ้ำกับหลายการจอง</li>
                <li>ใช้บัญชีหลายบัญชีเพื่อหลีกเลี่ยงกฎของระบบ</li>
                <li>พยายามแฮกระบบหรือเข้าถึงข้อมูลโดยไม่ได้รับอนุญาต</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">3. มาตรการของแพลตฟอร์ม</h3>
              <p>หากตรวจพบการกระทำที่เข้าข่ายทุจริต Peaksnature มีสิทธิ์</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ระงับหรือยกเลิกการจอง</li>
                <li>ระงับบัญชีผู้ใช้งาน</li>
                <li>ปฏิเสธการใช้บริการในอนาคต</li>
                <li>แจ้งหน่วยงานที่เกี่ยวข้องตามกฎหมาย</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">4. การตรวจสอบเพิ่มเติม</h3>
              <p>ในบางกรณี ระบบอาจขอข้อมูลเพิ่มเติม เช่น</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>หลักฐานการโอนเงินเพิ่มเติม</li>
                <li>การยืนยันตัวตน</li>
              </ul>
              <p>เพื่อปกป้องความปลอดภัยของแพลตฟอร์มและผู้ใช้งาน</p>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* 6. Dispute Resolution Policy */}
          <div id="dispute-resolution">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-gray-100 p-2.5">
                <Handshake className="h-5 w-5 text-gray-900" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("disputeResolution")}</h2>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <p>Peaksnature มีระบบช่วยเหลือในการแก้ไขปัญหาระหว่างผู้เข้าพักและเจ้าของที่พัก</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">1. การติดต่อกันโดยตรง</h3>
              <p>หากเกิดปัญหา ผู้เข้าพักและเจ้าของที่พักควรพยายามแก้ไขปัญหาร่วมกันก่อน</p>
              <p>ตัวอย่างปัญหา เช่น</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ที่พักไม่ตรงกับรายละเอียด</li>
                <li>ปัญหาการเช็คอิน</li>
                <li>ความเข้าใจผิดเกี่ยวกับการชำระเงิน</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">2. การแจ้งแพลตฟอร์ม</h3>
              <p>หากไม่สามารถแก้ไขปัญหาได้ ผู้ใช้สามารถแจ้งปัญหากับ Peaksnature โดย</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ส่งข้อความผ่านระบบ</li>
                <li>ติดต่อผู้ดูแลแพลตฟอร์ม</li>
              </ul>
              <p>Peaksnature อาจช่วยตรวจสอบข้อมูล เช่น</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>หลักฐานการจอง</li>
                <li>สลิปการชำระเงิน</li>
                <li>บันทึกการใช้งานระบบ</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">3. บทบาทของแพลตฟอร์ม</h3>
              <p>Peaksnature ทำหน้าที่เป็น ผู้ประสานงาน (Mediator) เท่านั้น</p>
              <p>แพลตฟอร์มจะช่วย</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ตรวจสอบข้อมูล</li>
                <li>ให้คำแนะนำในการแก้ไขปัญหา</li>
              </ul>
              <p>แต่ไม่รับประกันผลลัพธ์ของการตกลงระหว่างคู่กรณี</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">4. กรณีข้อพิพาทร้ายแรง</h3>
              <p>หากข้อพิพาทไม่สามารถแก้ไขได้</p>
              <p>คู่กรณีอาจต้องดำเนินการตามกระบวนการทางกฎหมายตามกฎหมายที่เกี่ยวข้อง</p>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* 7. Content & Review Policy */}
          <div id="content-review">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-gray-100 p-2.5">
                <MessageSquare className="h-5 w-5 text-gray-900" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("contentReview")}</h2>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <p>เพื่อให้แพลตฟอร์มมีข้อมูลที่ถูกต้องและเป็นประโยชน์ต่อผู้ใช้งาน Peaksnature มีข้อกำหนดเกี่ยวกับเนื้อหาและรีวิวดังต่อไปนี้</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">1. เนื้อหาที่เจ้าของที่พักเผยแพร่</h3>
              <p>เจ้าของที่พักต้องรับรองว่า</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>รูปภาพที่พักเป็นภาพจริง</li>
                <li>รายละเอียดที่พักถูกต้อง</li>
                <li>ราคาและสิ่งอำนวยความสะดวกถูกต้อง</li>
              </ul>
              <p>ห้าม</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ใช้รูปภาพที่ไม่ใช่ของที่พัก</li>
                <li>ใช้ภาพที่คัดลอกจากอินเทอร์เน็ต</li>
                <li>โฆษณาเกินจริง</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">2. รีวิวจากผู้เข้าพัก</h3>
              <p>ผู้เข้าพักสามารถให้คะแนนหรือรีวิวหลังจากเข้าพักได้</p>
              <p>รีวิวควรเป็น</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ประสบการณ์จริง</li>
                <li>ข้อมูลที่เป็นประโยชน์ต่อผู้ใช้งานอื่น</li>
                <li>ภาษาที่สุภาพ</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">3. เนื้อหาที่ไม่อนุญาต</h3>
              <p>Peaksnature ไม่อนุญาตเนื้อหาที่</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>หมิ่นประมาท</li>
                <li>มีคำหยาบคาย</li>
                <li>เป็นข้อมูลเท็จ</li>
                <li>ละเมิดลิขสิทธิ์</li>
                <li>ละเมิดความเป็นส่วนตัวของผู้อื่น</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">4. สิทธิ์ของแพลตฟอร์ม</h3>
              <p>Peaksnature มีสิทธิ์</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ลบหรือแก้ไขเนื้อหาที่ไม่เหมาะสม</li>
                <li>ระงับบัญชีผู้ใช้ที่ละเมิดกฎ</li>
              </ul>
              <p>โดยไม่ต้องแจ้งให้ทราบล่วงหน้า</p>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* 8. Host Agreement */}
          <div id="host-agreement">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-gray-100 p-2.5">
                <ScrollText className="h-5 w-5 text-gray-900" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("hostAgreement")}</h2>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <p>เจ้าของที่พักที่ลงทะเบียนในแพลตฟอร์ม Peaksnature ต้องยอมรับข้อตกลงดังต่อไปนี้</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">1. ความถูกต้องของข้อมูล</h3>
              <p>เจ้าของที่พักต้องให้ข้อมูลที่ถูกต้องเกี่ยวกับ</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>รายละเอียดที่พัก</li>
                <li>รูปภาพ</li>
                <li>ราคา</li>
                <li>สิ่งอำนวยความสะดวก</li>
                <li>ข้อมูลการรับชำระเงิน เช่น หมายเลข PromptPay หรือบัญชีธนาคาร (ชื่อธนาคาร หมายเลขบัญชี ชื่อบัญชี)</li>
              </ul>
              <p>ห้ามใช้ข้อมูลเท็จหรือทำให้ผู้เข้าพักเข้าใจผิด</p>
              <p>เจ้าของที่พักต้องรับผิดชอบต่อความถูกต้องของข้อมูลบัญชีธนาคารที่ระบุในระบบ หากข้อมูลไม่ถูกต้องอาจส่งผลให้ผู้เข้าพักโอนเงินไปยังบัญชีที่ผิด ซึ่ง Peaksnature ไม่รับผิดชอบต่อความเสียหายที่เกิดขึ้น</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">2. การจัดการการจอง</h3>
              <p>เจ้าของที่พักต้อง</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>อัปเดตปฏิทินวันว่างให้ถูกต้อง</li>
                <li>ยืนยันการจองตามเงื่อนไขที่กำหนด</li>
                <li>ติดต่อผู้เข้าพักเมื่อจำเป็น</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">3. ความรับผิดชอบต่อผู้เข้าพัก</h3>
              <p>เจ้าของที่พักต้องรับผิดชอบต่อ</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ความสะอาดของที่พัก</li>
                <li>ความปลอดภัยของผู้เข้าพัก</li>
                <li>การให้บริการตามรายละเอียดที่ระบุในระบบ</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">4. การกำหนดราคา</h3>
              <p>เจ้าของที่พักสามารถกำหนด</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ราคาปกติ</li>
                <li>ราคาตามฤดูกาล</li>
                <li>โปรโมชั่น</li>
              </ul>
              <p>แต่ต้องแสดงข้อมูลราคาอย่างชัดเจน</p>

              <h3 className="text-base font-semibold text-gray-900 pt-2">5. การยกเลิกการจอง</h3>
              <p>เจ้าของที่พักไม่ควรยกเลิกการจองโดยไม่มีเหตุผลอันสมควร</p>
              <p>การยกเลิกบ่อยครั้งอาจทำให้แพลตฟอร์ม</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>ลดการมองเห็นที่พัก</li>
                <li>ระงับบัญชีผู้ใช้</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-900 pt-2">6. บทบาทของแพลตฟอร์ม</h3>
              <p>Peaksnature เป็นเพียงแพลตฟอร์มตัวกลางในการเชื่อมต่อผู้เข้าพักกับเจ้าของที่พัก</p>
              <p>Peaksnature ไม่รับผิดชอบต่อความเสียหายที่เกิดขึ้นจากการเข้าพัก</p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
