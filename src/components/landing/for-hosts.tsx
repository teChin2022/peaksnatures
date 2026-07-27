"use client";

import Link from "next/link";
import { Users, CalendarCheck, ShieldCheck, BadgeCheck } from "lucide-react";
import { motion } from "motion/react";

export function ForHosts() {
  const benefits = [
    {
      icon: <Users className="text-brand" size={22} />,
      title: "เข้าถึงนักท่องเที่ยวสายธรรมชาติ",
      description:
        "เชื่อมต่อโฮมสเตย์ของคุณกับนักเดินทางที่กำลังมองหาที่พักกลางภูเขาและธรรมชาติ",
    },
    {
      icon: <CalendarCheck className="text-brand" size={22} />,
      title: "จัดการจองได้ง่ายในที่เดียว",
      description:
        "รวมบ้านพัก ราคา วันเข้าพัก และสถานะการจองไว้ในที่เดียว ช่วยให้ตอบกลับง่ายขึ้น",
    },
    {
      icon: <ShieldCheck className="text-brand" size={22} />,
      title: "ลดความเสี่ยง คัดกรองก่อนตอบรับ",
      description:
        "ตรวจสอบรายละเอียดก่อนรับเข้าพัก พร้อมระบบช่วยลดปัญหาสลิปปลอมและการโอนที่ไม่ตรงกัน",
    },
  ];

  return (
    <>
      {/* Audience transition */}
      <div className="py-3 bg-earth-50 text-center">
        <span className="text-xs uppercase tracking-[0.3em] text-earth-400">
          สำหรับเจ้าของที่พัก
        </span>
      </div>

      <section className="py-24 md:py-32 bg-[#FEFDFB]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left — heading + benefits */}
            <div>
              <motion.span
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400 block mb-4"
              >
                เป็นเจ้าของโฮมสเตย์?
              </motion.span>
              <div className="overflow-hidden pt-2 -mt-2">
                <motion.h2
                  initial={{ y: "100%" }}
                  whileInView={{ y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, ease: [0.33, 1, 0.68, 1] }}
                  className="text-3xl md:text-4xl lg:text-5xl font-serif text-earth-900 mb-4 tracking-tight leading-[1.15]"
                >
                  ลงประกาศ<span className="italic text-brand">โฮมสเตย์</span>ของคุณ
                </motion.h2>
              </div>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="text-earth-600 leading-[1.8] text-base mb-10"
              >
                เปิดโฮมสเตย์ของคุณให้นักเดินทางสายธรรมชาติได้ค้นพบ
              </motion.p>

              <div className="space-y-0">
                {benefits.map((benefit, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ delay: idx * 0.12, duration: 0.5, ease: [0.25, 0.1, 0, 1] }}
                    className={`flex items-start gap-5 py-6 ${
                      idx < benefits.length - 1 ? "border-b border-earth-200" : ""
                    }`}
                  >
                    <div className="w-11 h-11 shrink-0 bg-brand-50 rounded-xl flex items-center justify-center">
                      {benefit.icon}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-earth-800 mb-1">
                        {benefit.title}
                      </h3>
                      <p className="text-earth-500 text-sm leading-relaxed">
                        {benefit.description}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Right — CTA card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="text-center border border-brand/10 rounded-3xl p-10 md:p-14 bg-gradient-to-br from-brand-50 to-earth-50"
            >
              <div className="flex items-center justify-center gap-2 mb-4">
                <BadgeCheck size={20} className="text-brand" />
                <span className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400">
                  ไม่มีค่าลงประกาศ
                </span>
              </div>
              <h3 className="text-3xl md:text-4xl font-serif text-earth-900 mb-4 tracking-tight">
                สมัคร<span className="italic">ฟรี</span>
              </h3>
              <p className="text-earth-500 leading-relaxed mb-4">
                จ่ายเป็นค่าคอมมิชชั่นหรือจ่ายเป็นรายเดือน
              </p>
              <p className="text-earth-400 text-sm leading-relaxed mb-8">
                ออกแบบมาเพื่อสนับสนุนโฮมสเตย์ท้องถิ่น ค่าบริการยุติธรรม
              </p>
              <Link
                href="/register"
                className="inline-block bg-gradient-to-r from-brand to-brand-700 text-white px-12 py-5 rounded-full font-bold text-sm tracking-[0.15em] uppercase hover:from-brand-hover hover:to-brand transition-all shadow-lg hover:shadow-brand/25 hover:-translate-y-0.5"
              >
                ลงทะเบียนเจ้าของที่พัก
              </Link>
            </motion.div>
          </div>
        </div>
      </section>
    </>
  );
}
