"use client";

import { useState, useEffect, createContext, useContext } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar, MobileSidebar } from "./sidebar";
import { ThemeProvider } from "./theme-context";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export type DashboardRole = "owner" | "assistant" | null;

interface UserRoleContextValue {
  role: DashboardRole;
  hostId: string | null;
}

const UserRoleContext = createContext<UserRoleContextValue>({
  role: null,
  hostId: null,
});

export function useUserRole() {
  return useContext(UserRoleContext);
}

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [brandLogo, setBrandLogo] = useState<string | null>(null);
  const [themeColor, setThemeColor] = useState("#000000");
  const [role, setRole] = useState<DashboardRole>(null);
  const [hostId, setHostId] = useState<string | null>(null);

  useEffect(() => {
    const fetchBrand = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Try owner first
      const { data: host } = await supabase
        .from("hosts")
        .select("id")
        .eq("user_id", user.id)
        .single();

      let resolvedHostId: string | null = null;

      if (host) {
        resolvedHostId = (host as { id: string }).id;
        setRole("owner");
      } else {
        // Check if user is an assistant
        const { data: assistant } = await supabase
          .from("host_assistants")
          .select("host_id")
          .eq("user_id", user.id)
          .eq("status", "active")
          .limit(1)
          .single();

        if (assistant) {
          resolvedHostId = (assistant as { host_id: string }).host_id;
          setRole("assistant");
        }
      }

      if (!resolvedHostId) return;
      setHostId(resolvedHostId);

      const { data: homestay } = await supabase
        .from("homestays")
        .select("name, logo_url, theme_color")
        .eq("host_id", resolvedHostId)
        .limit(1)
        .single();

      if (homestay) {
        const h = homestay as { name: string; logo_url: string | null; theme_color: string };
        setBrandName(h.name);
        setBrandLogo(h.logo_url);
        setThemeColor(h.theme_color || "#000000");
      }
    };
    fetchBrand();
  }, []);

  return (
    <UserRoleContext.Provider value={{ role, hostId }}>
      <div className="min-h-screen bg-gray-50">
        {/* Desktop sidebar */}
        <div className="hidden lg:block">
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} brandName={brandName} brandLogo={brandLogo} themeColor={themeColor} />
        </div>

        {/* Mobile sidebar */}
        <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} brandName={brandName} brandLogo={brandLogo} themeColor={themeColor} />

        {/* Main content */}
        <div
          className={cn(
            "transition-all duration-300",
            collapsed ? "lg:ml-16" : "lg:ml-60"
          )}
        >
          {/* Mobile header */}
          <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-white px-4 lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <span className="ml-3 text-sm font-medium text-gray-600">
              {brandName}
            </span>
          </header>

          <main className="p-4 sm:p-6">
            <ThemeProvider color={themeColor}>{children}</ThemeProvider>
          </main>
        </div>
      </div>
    </UserRoleContext.Provider>
  );
}
