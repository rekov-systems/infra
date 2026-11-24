import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Loader2 } from "lucide-react";
import { canAccessRoles, rolesForPath, type AppRole } from "@/lib/roles";

/** Ruta de aterrizaje según el rol principal del usuario */
function homeForRoles(roles: string[]): string {
  if (roles.includes("super_admin")) return "/dashboard";
  if (roles.some((r) => ["owner", "admin", "manager", "cashier"].includes(r))) return "/dashboard";
  if (roles.includes("waiter"))    return "/waiter";
  if (roles.includes("kitchen"))   return "/kds";
  if (roles.includes("inventory")) return "/inventory";
  if (roles.includes("courier") || roles.includes("staff")) return "/courier";
  return "/dashboard"; // fallback
}

export function ProtectedRoute() {
  const location = useLocation();
  const { user, loading } = useAuth();
  const { needsOnboarding, isLoading, roles } = useTenantContext();

  if (loading || (user && isLoading)) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (needsOnboarding && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  if (!needsOnboarding && location.pathname !== "/onboarding") {
    const requiredRoles = rolesForPath(location.pathname);
    if (!canAccessRoles(roles, requiredRoles)) {
      // Si el usuario no puede acceder a esta ruta, redirigirlo a su módulo
      // principal en lugar de mostrar 403 — solo mostramos 403 si tampoco
      // puede acceder a su propio home (situación anómala).
      const home = homeForRoles(roles);
      if (location.pathname !== home) {
        return <Navigate to={home} replace />;
      }
      return <Navigate to="/403" replace />;
    }
  }

  return <Outlet />;
}
