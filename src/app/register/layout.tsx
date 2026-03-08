import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Register — Peaksnature Host Dashboard",
  description: "Create a host account to list your homestay on Peaksnature.",
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
