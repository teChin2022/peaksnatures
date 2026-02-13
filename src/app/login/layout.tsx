import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In — PeaksNature Host Dashboard",
  description: "Sign in to manage your homestay bookings on PeaksNature.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
