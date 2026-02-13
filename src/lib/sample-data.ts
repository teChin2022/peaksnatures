import type { Homestay, Room, BlockedDate, Host } from "@/types/database";

export const SAMPLE_HOSTS: Host[] = [];

export const SAMPLE_HOMESTAYS: (Homestay & { host: Host })[] = [];

export const SAMPLE_ROOMS: Record<string, Room[]> = {};

export const SAMPLE_BLOCKED_DATES: BlockedDate[] = [];

export function getHomestayBySlug(slug: string) {
  return SAMPLE_HOMESTAYS.find((h) => h.slug === slug) || null;
}

export function getRoomsByHomestayId(homestayId: string) {
  return SAMPLE_ROOMS[homestayId] || [];
}

export function getBlockedDatesByHomestayId(homestayId: string) {
  return SAMPLE_BLOCKED_DATES.filter((d) => d.homestay_id === homestayId);
}
