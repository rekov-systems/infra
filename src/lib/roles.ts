import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super admin",
  owner: "Dueño",
  admin: "Administrador",
  manager: "Gerente",
  cashier: "Cajero",
  waiter: "Mesero",
  kitchen: "Cocina",
  inventory: "Inventario",
  courier: "Domiciliario",
  staff: "Personal",
};

export const MANAGEABLE_ROLES: AppRole[] = [
  "owner",
  "admin",
  "manager",
  "cashier",
  "waiter",
  "courier",
  "kitchen",
  "inventory",
  "staff",
];

export const ROUTE_ROLES: Array<{ prefix: string; roles: AppRole[] }> = [
  { prefix: "/pos",           roles: ["owner", "admin", "manager", "cashier"] },
  { prefix: "/whatsapp",      roles: ["owner", "admin", "manager", "cashier"] },
  { prefix: "/tables",        roles: ["owner", "admin", "manager", "cashier", "waiter"] },
  { prefix: "/waiter",        roles: ["owner", "admin", "manager", "waiter"] },
  { prefix: "/courier",       roles: ["owner", "admin", "manager", "courier", "staff"] },
  { prefix: "/products",      roles: ["owner", "admin", "manager"] },
  { prefix: "/categories",    roles: ["owner", "admin", "manager"] },
  { prefix: "/recipes",       roles: ["owner", "admin", "manager", "kitchen"] },
  { prefix: "/catalog",       roles: ["owner", "admin", "manager"] },
  { prefix: "/channel-prices",roles: ["owner", "admin", "manager"] },
  { prefix: "/inventory",     roles: ["owner", "admin", "manager", "inventory", "cashier"] },
  { prefix: "/production",    roles: ["owner", "admin", "manager", "kitchen"] },
  { prefix: "/kds",           roles: ["owner", "admin", "manager", "kitchen"] },
  { prefix: "/suppliers",     roles: ["owner", "admin", "manager"] },
  { prefix: "/expenses",      roles: ["owner", "admin", "manager"] },
  { prefix: "/digital-orders",roles: ["owner", "admin", "manager", "cashier"] },
  { prefix: "/delivery",      roles: ["owner", "admin", "manager", "cashier", "courier", "staff"] },
  { prefix: "/cash",          roles: ["owner", "admin", "manager", "cashier"] },
  { prefix: "/sales",         roles: ["owner", "admin", "manager", "cashier"] },
  { prefix: "/customers",     roles: ["owner", "admin", "manager", "cashier"] },
  { prefix: "/branches",      roles: ["owner", "admin"] },
  { prefix: "/employees",     roles: ["owner", "admin", "manager"] },
  { prefix: "/shifts",        roles: ["owner", "admin", "manager"] },
  { prefix: "/reports",       roles: ["owner", "admin", "manager"] },
  { prefix: "/settings",      roles: ["owner", "admin"] },
  // Dashboard: todos los roles autenticados pueden aterrizar aquí
  { prefix: "/", roles: ["owner", "admin", "manager", "cashier", "waiter", "kitchen", "inventory", "courier", "staff"] },
];

export function canAccessRoles(userRoles: string[], required?: AppRole[]) {
  if (userRoles.includes("super_admin")) return true;
  if (!required || required.length === 0) return true;
  return required.some((role) => userRoles.includes(role));
}

export function rolesForPath(pathname: string): AppRole[] | undefined {
  if (pathname === "/onboarding") return undefined;
  const match = ROUTE_ROLES
    .filter((rule) => pathname === rule.prefix || (rule.prefix !== "/" && pathname.startsWith(rule.prefix)))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.roles;
}
