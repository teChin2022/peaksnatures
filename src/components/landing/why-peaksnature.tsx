"use client";

import { Leaf, Shield, Compass } from "lucide-react";
import { motion } from "motion/react";

export function WhyPeaksnature() {
  const features = [
    {
      icon: <Leaf className="text-gray-600" size={24} />,
      title: "ความหรูหราที่เคารพธรรมชาติ",
      description:
        "ที่พักที่ออกแบบให้กลมกลืนกับภูเขา ป่า และธรรมชาติ เพื่อให้คุณได้พักผ่อนอย่างสงบและยั่งยืน",
    },
    {
      icon: <Shield className="text-gray-600" size={24} />,
      title: "ความเป็นส่วนตัวอย่างแท้จริง",
      description:
        "สถานที่พักผ่อนในทำเลเงียบสงบ ให้คุณได้หลีกหนีความวุ่นวายของเมือง",
    },
    {
      icon: <Compass className="text-gray-600" size={24} />,
      title: "ประสบการณ์ที่คัดสรรแล้ว",
      description:
        "โฮมสเตย์และสถานที่พักที่เราคัดเลือก เพื่อให้คุณได้ค้นพบธรรมชาติในมุมที่พิเศษ",
    },
  ];

  return (
    <section id="why-peaksnature" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid md:grid-row-2 gap-16 items-center">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              className="text-sm font-bold uppercase tracking-[0.3em] text-gray-400 block mb-4"
            >
              ปรัชญาของ Peaksnature
            </motion.span>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-5xl font-serif text-gray-900 mb-6"
            >
              ทำไมเราถึงเลือก<span className="italic">ธรรมชาติ</span>
            </motion.h2>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-gray-600 leading-relaxed text-lg space-y-4"
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
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            {features.map((feature, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="group p-8 rounded-3xl hover:bg-gray-50 transition-colors"
              >
                <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-white transition-colors shadow-sm">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-serif text-gray-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
