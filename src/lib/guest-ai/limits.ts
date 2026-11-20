/**
 * Guest AI limits the browser needs. Import-free: rules.ts builds zod schemas at
 * load, and importing a value from it put zod in every /[slug]/book bundle.
 */
export const QUESTION_MAX = 300;
