import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .slice(0, 2)
    .join("");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function sanitizePhoneInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

export function isValidPhone(value: string): boolean {
  return /^\d{10}$/.test(value);
}

/**
 * Add-friend link for whatever a host typed as their LINE ID. Hosts paste full
 * links as often as IDs, so a link is kept as-is rather than nested inside
 * another; an official account (@id) uses LINE's OA path, a personal ID `~`.
 */
export function lineUrl(lineId: string): string {
  const value = lineId.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(line\.me|lin\.ee)\//i.test(value)) return `https://${value}`;
  if (value.startsWith("@")) return `https://line.me/R/ti/p/${encodeURIComponent(value)}`;
  return `https://line.me/ti/p/~${encodeURIComponent(value)}`;
}
