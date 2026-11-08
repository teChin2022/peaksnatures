"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";

/**
 * Makes motion animations below it honour the OS "Reduce motion" setting:
 * movement is skipped, fades stay. Motion's own default ignores the setting.
 */
export function RespectReducedMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
