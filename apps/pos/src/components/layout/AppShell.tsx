import { useState, type CSSProperties } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { WhatsAppNotifsProvider } from "@/contexts/WhatsAppNotifsContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GitBranch, SlidersHorizontal, FlaskConical, Menu, X, PanelLeft, Search, Bell, Calendar, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useDevMode } from "@/hooks/useDevMode";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { NetworkStatusBadge } from "./NetworkStatusBadge";
import { TweaksPanel } from "@/components/shared/TweaksPanel";
import { LiveDot } from "@/components/shared/LiveDot";
import { GearMark } from "@/components/shared/GearMark";

function Shell() {
  const navigate = useNavigate();
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const { branchId, setBranch, branches, roles } = useTenantContext();
  const { devMode } = useDevMode();
  const { toggleSidebar, isMobile, openMobile } = useSidebar();

  const { data: openSession } = useQuery({
    queryKey: ["open-session", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data } = await supabase
        .from("cash_sessions")
        .select("id")
        .eq("branch_id", branchId!)
        .eq("status", "open")
        .maybeSingle();
      return data;
    },
    refetchInterval: 15000,
  });

  const today = new Date().toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const roleInitials = (roles[0] ?? "U").slice(0, 2).toUpperCase();
  const branchName = branches.find((b) => b.id === branchId)?.name ?? "—";

  return (
    <div className="g-shell-root">
      <AppSidebar />

      <div className="g-shell-main">
        <header className="g-topbar">
          <div className="g-topbar-row">
            {/* Sidebar toggle */}
            <button
              type="button"
              onClick={toggleSidebar}
              className="glass g-topbar-toggle"
              aria-label="Menú"
            >
              {isMobile && openMobile ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {/* Search */}
            <div className="glass g-topbar-search">
              <Search size={18} />
              <span className="g-topbar-search-text">Buscar productos, órdenes, clientes…</span>
              <span className="g-topbar-kbd">⌘K</span>
            </div>

            {/* Branch / Date */}
            <div className={cn("glass g-topbar-date", "hidden sm:flex")}>
              <Calendar size={16} className="text-[--ink-700] shrink-0" />
              <Select value={branchId ?? undefined} onValueChange={setBranch}>
                <SelectTrigger className="h-auto border-0 bg-transparent p-0 focus:ring-0 shadow-none text-sm font-semibold min-w-[90px]">
                  <SelectValue placeholder="Sucursal" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="g-topbar-date-text">· {today}</span>
            </div>

            {/* Notifications */}
            <div className="glass g-topbar-bell">
              <Bell size={18} />
              <span className="g-topbar-bell-dot">!</span>
            </div>

            {/* Network */}
            <NetworkStatusBadge />

            {/* User / Tweaks */}
            <Popover open={tweaksOpen} onOpenChange={setTweaksOpen}>
              <PopoverTrigger asChild>
                <div className="glass g-topbar-user">
                  <div className="g-topbar-avatar">{roleInitials}</div>
                  <div className="g-topbar-user-info hidden md:block">
                    <div className="g-topbar-user-name">{branchName}</div>
                    <div className={cn("g-topbar-user-role", openSession ? "g-topbar-user-role-ok" : "g-topbar-user-role-off")}>
                      <span className={cn("g-dot", openSession ? "g-dot-ok" : "")} />
                      {roles[0] ?? "Usuario"}
                    </div>
                  </div>
                  <ChevronDown size={14} className="hidden md:block shrink-0 text-[--ink-500]" />
                </div>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={8} className="p-0 border-0 bg-transparent shadow-none w-auto">
                <TweaksPanel onClose={() => setTweaksOpen(false)} />
              </PopoverContent>
            </Popover>
          </div>
        </header>

        {devMode && (
          <div className="g-dev-banner">
            <FlaskConical className="h-3.5 w-3.5 shrink-0" />
            MODO DESARROLLO — Las ventas no respetan el stock del inventario
          </div>
        )}

        <main className="g-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <WhatsAppNotifsProvider>
      <SidebarProvider
        style={{ "--sidebar-width-icon": "5rem" } as CSSProperties}
      >
        <Shell />
      </SidebarProvider>
    </WhatsAppNotifsProvider>
  );
}
