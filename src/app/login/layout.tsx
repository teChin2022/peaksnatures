import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In — Peaksnature Host Dashboard",
  description: "Sign in to manage your homestay bookings on Peaksnature.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
