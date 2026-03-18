"use client";

import { Star } from "lucide-react";
import { motion } from "motion/react";

const testimonials = [
  {
    name: "Elena Richardson",
    role: "Architect",
    content:
      "The attention to detail in the Glass Observatory is staggering. It's rare to find a place that respects nature so profoundly while offering such uncompromising luxury.",
    rating: 5,
  },
  {
    name: "Marcus Thorne",
    role: "Travel Journalist",
    content:
      "Peaksnature has redefined what it means to be 'off-grid'. It's not about what you lose, but what you gain—clarity, peace, and a renewed sense of wonder.",
    rating: 5,
  },
  {
    name: "Sarah Jenkins",
    role: "Photographer",
    content:
      "The lighting, the atmosphere, the sheer isolation. It's a dream for anyone looking to capture the raw beauty of the wilderness without sacrificing comfort.",
    rating: 5,
  },
  {
    name: "David Chen",
    role: "Software Engineer",
    content:
      "A perfect escape from the digital world. The eco-dome was incredibly comfortable, and the stargazing experience was something I'll never forget.",
    rating: 5,
  },
];

export function LandingReviews() {
  return (
    <section id="reviews" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-16">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#6B7280] block mb-4">
            Guest Perspectives
          </span>
          <h2 className="text-4xl md:text-5xl font-serif text-[#111111]">
            Voices of <span className="italic">the Wild</span>
          </h2>
        </div>

        <div className="flex overflow-x-auto gap-8 pb-8 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
          {testimonials.map((t, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              className="bg-section-alt p-8 md:p-12 rounded-[3rem] relative min-w-[85vw] md:min-w-[500px] snap-center shrink-0"
            >
              <div className="flex gap-1 mb-6">
                {[...Array(t.rating)].map((_, i) => (
                  <Star
                    key={i}
                    size={16}
                    className="fill-[#111111] text-[#111111]"
                  />
                ))}
              </div>
              <p className="text-2xl font-serif text-[#111111] mb-8 leading-relaxed italic">
                &ldquo;{t.content}&rdquo;
              </p>
              <div>
                <p className="font-bold text-[#111111]">{t.name}</p>
                <p className="text-[#6B7280] text-sm">{t.role}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
