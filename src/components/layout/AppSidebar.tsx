import { useRef, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Package, Boxes, ChefHat, Factory,
  Wallet, Receipt, Users, Calendar, BarChart3, Settings, Store,
  Bike, UtensilsCrossed, UserRound, Truck,
  LogOut, ChevronRight, Sparkles, Bot,
} from "lucide-react";
import {
  Sidebar, SidebarContent, useSidebar,
} from "@/components/ui/sidebar";
import { useTenantContext } from "@/hooks/useTenantContext";
import { canAccessRoles, type AppRole } from "@/lib/roles";
import { useWhatsAppNotifs } from "@/contexts/WhatsAppNotifsContext";
import { cn } from "@/lib/utils";
import { signOutFully } from "@/lib/signOut";
import type { LucideIcon } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Item = {
  title: string;
  url: string;
  icon: LucideIcon;
  roles?: AppRole[];
  channel?: Database["public"]["Enums"]["sales_channel"];
};
type Section = { label: string; items: Item[] };

/* ──────────────────────────────────────────────────────────
   PRIMARY navigation — items visible every day by operators.
   Secondary catalog / admin items are reachable from within
   each module or from Settings.
   ────────────────────────────────────────────────────────── */
const sections: Section[] = [
  {
    label: "Operación",
    items: [
      { title: "Dashboard",   url: "/dashboard",      icon: LayoutDashboard, roles: ["owner","admin","manager","cashier","waiter","kitchen","inventory","courier","staff"] },
      { title: "POS",         url: "/pos",            icon: ShoppingCart,    roles: ["owner","admin","manager","cashier"], channel: "pos" },
      { title: "Mesas",       url: "/tables",         icon: UtensilsCrossed, roles: ["owner","admin","manager","cashier","waiter"], channel: "tables" },
      { title: "Mesero",      url: "/waiter",         icon: UtensilsCrossed, roles: ["waiter"], channel: "tables" },
      { title: "Domicilios",  url: "/delivery",       icon: Bike,            roles: ["owner","admin","manager","cashier","courier","staff"], channel: "delivery" },
      { title: "Courier",     url: "/courier",        icon: Bike,            roles: ["courier","staff"], channel: "delivery" },
      { title: "Caja",        url: "/cash",           icon: Wallet,          roles: ["owner","admin","manager","cashier"] },
      { title: "Ventas",      url: "/sales",          icon: Receipt,         roles: ["owner","admin","manager","cashier"] },
      { title: "Clientes",    url: "/customers",      icon: UserRound,       roles: ["owner","admin","manager","cashier"] },
    ],
  },
  {
    label: "Catálogo",
    items: [
      { title: "Productos",   url: "/products",   icon: Package,   roles: ["owner","admin","manager"] },
      { title: "Recetas",     url: "/recipes",    icon: ChefHat,   roles: ["owner","admin","manager","kitchen"] },
    ],
  },
  {
    label: "Stock",
    items: [
      { title: "Inventario",  url: "/inventory",  icon: Boxes,     roles: ["owner","admin","manager","inventory","cashier"] },
      { title: "Producción",  url: "/production", icon: Factory,   roles: ["owner","admin","manager","kitchen"] },
      { title: "KDS Cocina",  url: "/kds",        icon: ChefHat,   roles: ["owner","admin","manager","kitchen"] },
      { title: "Proveedores", url: "/suppliers",  icon: Truck,     roles: ["owner","admin","manager"] },
    ],
  },
  {
    label: "Negocio",
    items: [
      { title: "Empleados",     url: "/employees", icon: Users,      roles: ["owner","admin","manager"] },
      { title: "Horarios",      url: "/shifts",    icon: Calendar,   roles: ["owner","admin","manager"] },
      { title: "Reportes",      url: "/reports",   icon: BarChart3,  roles: ["owner","admin","manager"] },
      { title: "Configuración", url: "/settings",  icon: Settings,   roles: ["owner","admin"] },
    ],
  },
];

function GLogoIcon({ size = 44 }: { size?: number }) {
  const s = size * 0.6;
  return (
    <div className={cn("g-sb-brand-orb", size <= 38 ? "g-sb-brand-orb-36" : "g-sb-brand-orb-44")}>
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.2 5h2L7 13.5a1.4 1.4 0 0 0 1.4 1.1h6.4" />
        <circle cx="9" cy="18" r="1.1" fill="white" stroke="none" />
        <circle cx="14" cy="18" r="1.1" fill="white" stroke="none" />
        <path d="M11 11V8M14 11V6M17 11V4" strokeWidth="1.8" />
        <circle cx="18.5" cy="13.5" r="2.2" fill="white" stroke="none" />
        <path d="m17.5 13.5.7.7 1.7-1.7" stroke="#2B7CFF" strokeWidth="1.7" />
      </svg>
    </div>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { roles, activeChannels, branchId, branches } = useTenantContext();
  const { unreadCount } = useWhatsAppNotifs();
  const navigate = useNavigate();
  const navRef = useRef<HTMLElement>(null);

  const branchName = branches.find((b) => b.id === branchId)?.name ?? "—";
  const userRole = roles[0] ?? "";
  const initials = userRole.slice(0, 2).toUpperCase() || "U";

  const canSee = (item: Item) => {
    if (item.channel && !activeChannels.includes(item.channel)) return false;
    return canAccessRoles(roles, item.roles);
  };

  /* Scroll the active nav item into the center of the nav container
     every time the route changes. */
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector(".is-active") as HTMLElement | null;
    if (!nav || !active) return;
    const target = active.offsetTop - nav.clientHeight / 2 + active.clientHeight / 2;
    nav.scrollTop = Math.max(0, target);
  }, [pathname]);

  return (
    <Sidebar collapsible="icon" className="border-r-0 bg-transparent">
      <SidebarContent className="bg-transparent p-0">
        <div className="g-sb-wrap">
          <div className="glass g-sb-card">

            {/* Brand */}
            <div className="g-sb-brand">
              <GLogoIcon size={collapsed ? 36 : 44} />
              {!collapsed && (
                <div>
                  <div className="g-sb-brand-name">
                    POS<span>-S360T</span>
                  </div>
                  <div className="g-sb-brand-sub">POS / ERP Omnicanal</div>
                </div>
              )}
            </div>

            <div className="g-sb-divider" />

            {/* Nav */}
            <nav ref={navRef} className="g-sb-nav">
              {sections.map((section) => {
                const visible = section.items.filter(canSee);
                if (visible.length === 0) return null;
                return (
                  <div key={section.label}>
                    {!collapsed && (
                      <div className="g-sb-section-label">{section.label}</div>
                    )}
                    {visible.map((item) => {
                      const active =
                        pathname === item.url ||
                        (item.url !== "/" && pathname.startsWith(item.url));
                      return (
                        <NavLink
                          key={item.url}
                          to={item.url}
                          title={collapsed ? item.title : undefined}
                          className={cn(
                            "g-sb-nav-item",
                            active && "is-active",
                            collapsed && "g-sb-nav-item-collapsed"
                          )}
                        >
                          <item.icon size={18} style={{ flexShrink: 0 }} />
                          {!collapsed && (
                            <span className="truncate flex-1">{item.title}</span>
                          )}
                          {item.url === "/whatsapp" && unreadCount > 0 && (
                            <span className={cn("g-sb-badge", collapsed && "g-sb-badge-float")}>
                              {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                          )}
                        </NavLink>
                      );
                    })}
                  </div>
                );
              })}
            </nav>

            {/* Plan card (only expanded) */}
            {!collapsed && (
              <div className="glass-thin g-sb-plan">
                <div className="g-sb-plan-row">
                  <div className="g-sb-plan-orb">
                    <Sparkles size={14} color="white" />
                  </div>
                  <div>
                    <div className="g-sb-plan-title">Plan Premium</div>
                    <div className="g-sb-plan-sub">Tu plan está activo</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="g-sb-plan-btn"
                  onClick={() => navigate("/settings")}
                >
                  Ver beneficios <ChevronRight size={12} />
                </button>
              </div>
            )}

            {/* User / logout */}
            <div className={cn("glass-thin g-sb-nav-item g-sb-user-row", collapsed && "g-sb-nav-item-collapsed")}>
              <div className="g-sb-user-avatar">{initials}</div>
              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="g-sb-user-name truncate">{branchName}</div>
                    <div className="g-sb-user-sub">{userRole}</div>
                  </div>
                  <button
                    type="button"
                    className="g-sb-logout-btn"
                    title="Cerrar sesión"
                    onClick={async () => {
                      await signOutFully();
                      navigate("/auth");
                    }}
                  >
                    <LogOut size={14} />
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
