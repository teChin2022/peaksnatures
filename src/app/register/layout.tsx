import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Register — PeaksNature Host Dashboard",
  description: "Create a host account to list your homestay on PeaksNature.",
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
