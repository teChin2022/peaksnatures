"use client";

import { motion } from "motion/react";

const images: { src: string; alt: string }[] = [
  {
    src: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&q=80&w=1000",
    alt: "Mountain lake reflecting pine forest at sunrise",
  },
  {
    src: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&q=80&w=1000",
    alt: "Sunlight filtering through a dense green forest canopy",
  },
  {
    src: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&q=80&w=1000",
    alt: "Mountain peaks rising above a misty valley",
  },
  {
    src: "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&q=80&w=1000",
    alt: "Deer standing in an early morning forest clearing",
  },
  {
    src: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=1000",
    alt: "Snow-capped mountain landscape under a clear blue sky",
  },
  {
    src: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&q=80&w=1000",
    alt: "Wildflower meadow with mountains in the distance",
  },
];

export function LandingGallery() {
  return (
    <section id="gallery" className="py-24 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 mb-16 text-center">
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#6B7280] block mb-4">
          Visual Journey
        </span>
        <h2 className="text-4xl md:text-5xl font-serif text-[#111111]">
          Captured <span className="italic">Moments</span>
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4">
        <div className="grid gap-4">
          <motion.img
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            src={images[0].src}
            className="w-full aspect-[3/4] object-cover rounded-3xl"
            referrerPolicy="no-referrer"
            alt={images[0].alt}
          />
          <motion.img
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            src={images[1].src}
            className="w-full aspect-square object-cover rounded-3xl"
            referrerPolicy="no-referrer"
            alt={images[1].alt}
          />
        </div>
        <div className="grid gap-4 md:pt-12">
          <motion.img
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            src={images[2].src}
            className="w-full aspect-square object-cover rounded-3xl"
            referrerPolicy="no-referrer"
            alt={images[2].alt}
          />
          <motion.img
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            src={images[3].src}
            className="w-full aspect-[3/4] object-cover rounded-3xl"
            referrerPolicy="no-referrer"
            alt={images[3].alt}
          />
        </div>
        <div className="grid gap-4">
          <motion.img
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            src={images[4].src}
            className="w-full aspect-[3/4] object-cover rounded-3xl"
            referrerPolicy="no-referrer"
            alt={images[4].alt}
          />
          <motion.img
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            src={images[5].src}
            className="w-full aspect-square object-cover rounded-3xl"
            referrerPolicy="no-referrer"
            alt={images[5].alt}
          />
        </div>
        <div className="grid gap-4 md:pt-12">
          <motion.img
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            src={images[0].src}
            className="w-full aspect-square object-cover rounded-3xl"
            referrerPolicy="no-referrer"
            alt={images[0].alt}
          />
          <motion.img
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            src={images[1].src}
            className="w-full aspect-[3/4] object-cover rounded-3xl"
            referrerPolicy="no-referrer"
            alt={images[1].alt}
          />
        </div>
      </div>
    </section>
  );
}
