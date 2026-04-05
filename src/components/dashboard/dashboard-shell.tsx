"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar, MobileSidebar } from "./sidebar";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const isPending = pathname === "/dashboard/pending";
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [brandName, setBrandName] = useState("Peaksnature");
  const [brandLogo, setBrandLogo] = useState<string | null>(null);

  useEffect(() => {
    const fetchBrand = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: host } = await supabase
        .from("hosts")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!host) return;

      const hostRow = host as { id: string };

      const { data: homestay } = await supabase
        .from("homestays")
        .select("name, logo_url")
        .eq("host_id", hostRow.id)
        .limit(1)
        .single();

      if (homestay) {
        const h = homestay as { name: string; logo_url: string | null };
        setBrandName(h.name);
        setBrandLogo(h.logo_url);
      }
    };
    fetchBrand();
  }, []);

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} brandName={brandName} brandLogo={brandLogo} />
      </div>

      {/* Mobile sidebar */}
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} brandName={brandName} brandLogo={brandLogo} />

      {/* Main content */}
      <div
        className={cn(
          "transition-all duration-300",
          collapsed ? "lg:ml-16" : "lg:ml-60"
        )}
      >
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-14 items-center border-b border-gray-200/80 bg-white/80 backdrop-blur-md px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-500 hover:text-gray-700"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="ml-3 text-sm font-semibold text-gray-900">
            {brandName}
          </span>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Blur overlay for pending approval */}
      {isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-sm">
          <div className="pointer-events-auto">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
