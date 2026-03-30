"use client";

import { Leaf, Shield, Compass } from "lucide-react";
import { motion } from "motion/react";

export function WhyPeaksnature() {
  const features = [
    {
      icon: <Leaf className="text-brand" size={22} />,
      title: "ความหรูหราที่เคารพธรรมชาติ",
      description:
        "ที่พักที่ออกแบบให้กลมกลืนกับภูเขา ป่า และธรรมชาติ เพื่อให้คุณได้พักผ่อนอย่างสงบและยั่งยืน",
    },
    {
      icon: <Shield className="text-brand" size={22} />,
      title: "ความเป็นส่วนตัวอย่างแท้จริง",
      description:
        "สถานที่พักผ่อนในทำเลเงียบสงบ ให้คุณได้หลีกหนีความวุ่นวายของเมือง",
    },
    {
      icon: <Compass className="text-brand" size={22} />,
      title: "ประสบการณ์ที่คัดสรรแล้ว",
      description:
        "โฮมสเตย์และสถานที่พักที่เราคัดเลือก เพื่อให้คุณได้ค้นพบธรรมชาติในมุมที่พิเศษ",
    },
  ];

  return (
    <section id="why-peaksnature" className="py-24 md:py-32 bg-[#FEFDFB]">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid lg:grid-cols-5 gap-12 lg:gap-20 items-start">
          {/* Left column — philosophy text */}
          <div className="lg:col-span-2 lg:sticky lg:top-32">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400 block mb-4"
            >
              ปรัชญาของ Peaksnature
            </motion.span>
            <div className="overflow-hidden pt-2 -mt-2">
              <motion.h2
                initial={{ y: "100%" }}
                whileInView={{ y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, ease: [0.33, 1, 0.68, 1] }}
                className="text-3xl md:text-4xl lg:text-5xl font-serif text-earth-900 mb-6 tracking-tight leading-[1.15]"
              >
                ทำไมเราถึงเลือก<span className="italic text-brand">ธรรมชาติ</span>
              </motion.h2>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-earth-600 leading-[1.8] text-base space-y-4"
            >
              <p>
                เพราะเรามองว่าความหรูหราที่แท้จริง
                ไม่ได้อยู่ในความฟุ่มเฟือย
              </p>
              <p>
                แต่อยู่ในช่วงเวลาที่เราได้หยุดพัก
                สูดอากาศบริสุทธิ์ และใช้เวลากับธรรมชาติอย่างแท้จริง
              </p>
              <p>
                ที่พักของเราถูกสร้างขึ้น
                เพื่อให้คุณได้พักผ่อนอย่างเรียบง่าย
                ท่ามกลางภูเขา ป่า และความเงียบสงบ
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="mt-8"
            >
              <div className="w-12 h-0.5 bg-brand" />
            </motion.div>
          </div>

          {/* Right column — feature list */}
          <div className="lg:col-span-3 space-y-0">
            {features.map((feature, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: idx * 0.12, duration: 0.5, ease: [0.25, 0.1, 0, 1] }}
                className={`group flex items-start gap-6 py-8 ${
                  idx < features.length - 1 ? "border-b border-earth-200" : ""
                }`}
              >
                <div className="w-12 h-12 shrink-0 bg-brand-50 rounded-2xl flex items-center justify-center group-hover:bg-brand-100 transition-colors">
                  {feature.icon}
                </div>
                <div>
                  <h3 className="text-lg font-serif text-earth-800 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-earth-500 text-base leading-[1.8]">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
