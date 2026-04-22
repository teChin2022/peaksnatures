import type { Metadata } from "next";
import { AdminLayoutClient } from "./admin-layout-client";

export const metadata: Metadata = {
  title: "Admin — Peaksnature",
  description: "Platform administration dashboard.",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
