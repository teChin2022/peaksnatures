export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  // Parent admin layout already skips AdminShell for /admin/login
  return <>{children}</>;
}
