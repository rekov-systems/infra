import { useRef, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Package, Boxes,
  Wallet, Receipt, Users, Calendar, BarChart3, Settings,
  UserRound, Truck, MessageCircle, LogOut,
} from "lucide-react";
import {
  Sidebar, SidebarContent, useSidebar,
} from "@/components/ui/sidebar";
import { useTenantContext } from "@/hooks/useTenantContext";
import { canAccessRoles, type AppRole } from "@/lib/roles";
import { useWhatsAppNotifs } from "@/contexts/WhatsAppNotifsContext";
import { cn } from "@/lib/utils";
import { signOutFully } from "@/lib/signOut";
import { GearMark } from "@/components/shared/GearMark";
import { loginHref } from "@/lib/host";
import type { LucideIcon } from "lucide-react";

type Item = {
  title: string;
  url: string;
  icon: LucideIcon;
  roles?: AppRole[];
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
      { title: "Dashboard",   url: "/dashboard",      icon: LayoutDashboard, roles: ["owner","admin","manager","cashier","inventory","staff"] },
      { title: "POS",         url: "/pos",            icon: ShoppingCart,    roles: ["owner","admin","manager","cashier"] },
      { title: "Multicaja",   url: "/cash",           icon: Wallet,          roles: ["owner","admin","manager","cashier"] },
      { title: "Ventas",      url: "/sales",          icon: Receipt,         roles: ["owner","admin","manager","cashier"] },
      { title: "Clientes",    url: "/customers",      icon: UserRound,       roles: ["owner","admin","manager","cashier"] },
      { title: "WhatsApp",    url: "/whatsapp",       icon: MessageCircle,   roles: ["owner","admin","manager","cashier","staff"] },
    ],
  },
  {
    label: "Catálogo",
    items: [
      { title: "Productos",   url: "/products",   icon: Package,   roles: ["owner","admin","manager"] },
    ],
  },
  {
    label: "Stock",
    items: [
      { title: "Inventario",  url: "/inventory",  icon: Boxes,     roles: ["owner","admin","manager","inventory","cashier"] },
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

async function leaveSession() {
  await signOutFully();
  window.location.assign(loginHref());
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { roles, branchId, branches } = useTenantContext();
  const { unreadCount } = useWhatsAppNotifs();
  const navRef = useRef<HTMLElement>(null);

  const branchName = branches.find((b) => b.id === branchId)?.name ?? "—";
  const userRole = roles[0] ?? "";
  const initials = userRole.slice(0, 2).toUpperCase() || "U";

  const canSee = (item: Item) => canAccessRoles(roles, item.roles);

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
              <GearMark size={collapsed ? 32 : 36} />
              {!collapsed && (
                <div>
                  <div className="g-sb-brand-name">
                    Desk
                  </div>
                  <div className="g-sb-brand-sub">Gestión comercial</div>
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

            {/* User / logout */}
            <div className={cn("glass-thin g-sb-nav-item g-sb-user-row", collapsed && "g-sb-nav-item-collapsed")}>
              <div className="g-sb-user-avatar">{initials}</div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <div className="g-sb-user-name truncate">{branchName}</div>
                  <div className="g-sb-user-sub">{userRole}</div>
                </div>
              )}
              <button
                type="button"
                className="g-sb-logout-btn"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                onClick={() => { void leaveSession(); }}
              >
                <LogOut size={14} />
                {!collapsed && <span>Salir</span>}
              </button>
            </div>

          </div>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
