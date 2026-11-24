import { useCallback, useEffect, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { useTenantByDomain } from "@/hooks/useTenantByDomain";
import { supabase } from "@/integrations/supabase/client";
import { signOutFully } from "@/lib/signOut";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";

interface TenantProviderProps {
  children: React.ReactNode;
}

// ── Pantalla: instancia sin dominio configurado ────────────────────────────────
// Cuando no se encuentra un tenant para el hostname actual, bloqueamos el acceso
// normal pero dejamos que un super_admin inicie sesión para configurar el dominio.
function UnconfiguredScreen() {
  const hostname = window.location.hostname;

  const [session, setSession]           = useState<Session | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authLoading, setAuthLoading]   = useState(true);

  // Login form state
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // Setup state
  const [tenants, setTenants]           = useState<{ id: string; name: string; slug: string; domain: string | null }[]>([]);
  const [selectedTenant, setSelectedTenant] = useState("");
  const [saving, setSaving]             = useState(false);

  const loadTenants = useCallback(async () => {
    const { data } = await supabase
      .from("tenants")
      .select("id, name, slug, domain");
    setTenants(data ?? []);
  }, []);

  const checkSuperAdmin = useCallback(async (userId: string) => {
    setAuthLoading(true);
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();

    const isAdmin = !!data;
    setIsSuperAdmin(isAdmin);
    setAuthLoading(false);

    if (isAdmin) loadTenants();
  }, [loadTenants]);

  // ── Check existing session & super_admin status ────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      if (data.session) checkSuperAdmin(data.session.user.id);
      else setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) checkSuperAdmin(s.user.id);
      else { setIsSuperAdmin(false); setAuthLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, [checkSuperAdmin]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error(error.message);
    setLoggingIn(false);
  }

  async function handleSetDomain() {
    if (!selectedTenant) return;
    setSaving(true);
    const { error } = await supabase
      .from("tenants")
      .update({ domain: hostname })
      .eq("id", selectedTenant);

    if (error) {
      toast.error("Error: " + error.message);
    } else {
      toast.success("Dominio configurado. Recargando...");
      setTimeout(() => window.location.reload(), 800);
    }
    setSaving(false);
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Super admin autenticado: pantalla de configuración ─────────────────────
  if (session && isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center gap-2 text-amber-600">
            <Settings2 className="h-5 w-5" />
            <span className="font-semibold text-sm">Configurar instancia</span>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Hostname detectado</p>
            <code className="block text-sm font-mono bg-muted px-3 py-2 rounded">
              {hostname}
            </code>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Vincular a tenant</label>
            <select
              aria-label="Tenant"
              className="w-full border rounded px-3 py-2 text-sm bg-background"
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
            >
              <option value="">Seleccionar tenant...</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slug}){t.domain ? ` — ${t.domain}` : ""}
                </option>
              ))}
            </select>
          </div>

          <Button
            className="w-full"
            disabled={!selectedTenant || saving}
            onClick={handleSetDomain}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Vincular dominio y continuar"}
          </Button>

          <Button
            variant="ghost"
            className="w-full text-xs text-muted-foreground"
            onClick={() => signOutFully()}
          >
            Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  // ── Sin sesión o no es super_admin: login + mensaje ────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-lg font-semibold text-foreground">Instancia no configurada</h1>
          <p className="text-muted-foreground text-xs">
            No hay un tenant vinculado a <code className="font-mono">{hostname}</code>
          </p>
        </div>

        {session && !isSuperAdmin ? (
          <p className="text-center text-xs text-destructive">
            Tu cuenta no tiene permisos para configurar esta instancia.
          </p>
        ) : (
          <form onSubmit={handleLogin} className="space-y-3">
            <p className="text-xs text-muted-foreground text-center">
              Accede como super admin para configurarla
            </p>
            <input
              type="email"
              placeholder="Correo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm bg-background"
              required
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm bg-background"
              required
            />
            <Button type="submit" className="w-full" disabled={loggingIn}>
              {loggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : "Iniciar sesión"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Provider principal ─────────────────────────────────────────────────────────
export function TenantProvider({ children }: TenantProviderProps) {
  const { loading, error } = useTenantByDomain();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Dominio no encontrado → flujo super_admin
  if (error === "not-found") {
    return <UnconfiguredScreen />;
  }

  // Error de red / BD
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2 px-4">
          <h1 className="text-xl font-semibold text-foreground">Error de conexión</h1>
          <p className="text-muted-foreground text-sm">
            No se pudo contactar el servidor. Intenta recargar la página.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
