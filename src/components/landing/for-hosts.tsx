"use client";

import Link from "next/link";
import { Users, CalendarCheck, HandCoins, BadgeCheck } from "lucide-react";
import { motion } from "motion/react";

export function ForHosts() {
  const benefits = [
    {
      icon: <Users className="text-gray-600" size={24} />,
      title: "เข้าถึงนักท่องเที่ยวสายธรรมชาติ",
      description:
        "เชื่อมต่อโฮมสเตย์ของคุณกับนักเดินทางที่กำลังมองหาที่พักกลางภูเขาและธรรมชาติ",
    },
    {
      icon: <CalendarCheck className="text-gray-600" size={24} />,
      title: "ระบบจองที่ใช้งานง่าย",
      description:
        "จัดการห้องพัก ราคา และการจองได้สะดวกในที่เดียว",
    },
    {
      icon: <HandCoins className="text-gray-600" size={24} />,
      title: "ค่าบริการที่ยุติธรรม",
      description:
        "เราเก็บค่าบริการเป็นแบบทั้งค่าคอมมิชชั่นและรายเดือน ออกแบบมาเพื่อสนับสนุนโฮมสเตย์ท้องถิ่น",
    },
  ];

  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            className="text-sm font-bold uppercase tracking-[0.3em] text-gray-400 block mb-4"
          >
            เป็นเจ้าของโฮมสเตย์?
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-serif text-gray-900 mb-6"
          >
            ลงประกาศ<span className="italic">โฮมสเตย์</span>ของคุณ
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-gray-600 leading-relaxed text-lg"
          >
            เปิดโฮมสเตย์ของคุณให้นักเดินทางสายธรรมชาติได้ค้นพบ
          </motion.p>
        </div>

        <div className="grid md:grid-cols-3 gap-12 mb-20">
          {benefits.map((benefit, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="group p-8 rounded-3xl hover:bg-gray-50 transition-colors"
            >
              <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-white transition-colors shadow-sm">
                {benefit.icon}
              </div>
              <h3 className="text-xl font-serif text-gray-900 mb-3">
                {benefit.title}
              </h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                {benefit.description}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="max-w-2xl mx-auto text-center border border-gray-100 rounded-3xl p-10 md:p-14 bg-gray-50/50"
        >
          <div className="flex items-center justify-center gap-2 mb-4">
            <BadgeCheck size={20} className="text-gray-500" />
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-gray-400">
              ไม่มีค่าลงประกาศ
            </span>
          </div>
          <h3 className="text-3xl md:text-4xl font-serif text-gray-900 mb-4">
            สมัคร<span className="italic">ฟรี</span>
          </h3>
          <p className="text-gray-500 leading-relaxed mb-8">
            จ่ายค่าคอมมิชชั่นเฉพาะเมื่อมีการจอง
          </p>
          <Link
            href="/register"
            className="inline-block bg-brand text-white px-10 py-4 rounded-full font-bold text-sm tracking-widest uppercase hover:bg-brand-hover transition-all shadow-lg hover:shadow-xl"
          >
            ลงทะเบียนเจ้าของที่พัก
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
