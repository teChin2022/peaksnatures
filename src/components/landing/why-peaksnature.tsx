"use client";

import { Leaf, Shield, Compass } from "lucide-react";
import { motion } from "motion/react";

export function WhyPeaksnature() {
  const features = [
    {
      icon: <Leaf className="text-gray-600" size={24} />,
      title: "Sustainable Luxury",
      description:
        "Eco-conscious architecture that blends seamlessly with the surrounding wilderness.",
    },
    {
      icon: <Shield className="text-gray-600" size={24} />,
      title: "Absolute Privacy",
      description:
        "Secluded locations designed for deep reconnection and undisturbed peace.",
    },
    {
      icon: <Compass className="text-gray-600" size={24} />,
      title: "Curated Discovery",
      description:
        "Hand-picked experiences that reveal the hidden secrets of the natural world.",
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
              className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400 block mb-4"
            >
              The Peaksnature Philosophy
            </motion.span>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-5xl font-serif text-gray-900 mb-6"
            >
              Why we choose <span className="italic">the wild</span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-gray-600 leading-relaxed text-lg"
            >
              We believe that true luxury isn&apos;t found in excess, but in the
              rare opportunity to be fully present. Our spaces are crafted to
              facilitate this connection.
            </motion.p>
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
