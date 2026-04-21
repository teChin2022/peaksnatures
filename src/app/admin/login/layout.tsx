import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Login",
  description: "Sign in to the Peaksnature admin dashboard.",
  robots: { index: false, follow: false },
};

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  // Parent admin layout already skips AdminShell for /admin/login
  return <>{children}</>;
}
