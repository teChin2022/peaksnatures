"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

const EASE_OUT = [0.33, 1, 0.68, 1] as const;

/**
 * The "01 ——" mark above a landing section heading. Latin numerals carry the
 * spaced-caps look of the design, since letter-spacing breaks Thai text. A CSS
 * counter reset on the landing's <main> numbers the marks, so a section that
 * renders nothing leaves no gap in the count. The line draws in as the section
 * scrolls into view.
 */
export function SectionMark() {
  return (
    <span
      aria-hidden
      className="flex items-center gap-3 font-sans text-xs tracking-[0.3em] text-earth-400 [counter-increment:landing-section] before:content-[counter(landing-section,decimal-leading-zero)]"
    >
      <motion.span
        className="h-px w-10 origin-left bg-earth-300"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: EASE_OUT }}
      />
    </span>
  );
}

/**
 * A landing section's heading: it slides up from behind a mask as it scrolls
 * into view. The mask is padded so Thai marks above and below the line are
 * not clipped.
 */
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 overflow-hidden pt-2 pb-1 -mb-1">
      <motion.h2
        initial={{ y: "100%" }}
        whileInView={{ y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
        className="font-serif text-3xl leading-tight text-earth-900 md:text-4xl"
      >
        {children}
      </motion.h2>
    </div>
  );
}
