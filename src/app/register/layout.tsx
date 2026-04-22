import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Register as a Host",
  description: "Create a host account to list your homestay on Peaksnature.",
  robots: { index: false, follow: false },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
