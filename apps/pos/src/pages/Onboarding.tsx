import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { signOutFully } from "@/lib/signOut";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Building2, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTenantStore } from "@/stores/tenant";
import { useQueryClient } from "@tanstack/react-query";
import { GearMark } from "@/components/shared/GearMark";

export default function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { setTenant, setBranch } = useTenantStore();

  useEffect(() => {
    document.title = "Configuración de Negocio | POS S360T";
  }, []);

  const [checking, setChecking] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tenantOptions, setTenantOptions] = useState<
    Array<{ tenant_id: string; branch_id: string | null; role: string; tenants: { name: string } | null }>
  >([]);

  const [businessName, setBusinessName] = useState("");
  const [branchName, setBranchName] = useState("Barra principal");
  const [taxRate, setTaxRate] = useState("19");

  const enterTenant = async (tenantId: string, branchId: string | null) => {
    setTenant(tenantId);
    if (branchId) setBranch(branchId);
    else {
      const { data: br } = await supabase
        .from("branches").select("id")
        .eq("tenant_id", tenantId).eq("status", "active")
        .order("name").limit(1).maybeSingle();
      setBranch(br?.id ?? null);
    }
    await qc.invalidateQueries({ queryKey: ["my-roles"] });
    navigate("/dashboard", { replace: true });
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data: myRoles } = await supabase
          .from("user_roles")
          .select("tenant_id, branch_id, role, tenants(name)")
          .eq("user_id", user.id);

        if (myRoles && myRoles.length > 0) {
          if (myRoles.length === 1) {
            await enterTenant(myRoles[0].tenant_id, myRoles[0].branch_id);
            return;
          }
          setTenantOptions(myRoles as any);
          setChecking(false);
          return;
        }

        const { data: anyTenant } = await supabase
          .from("tenants").select("id").limit(1).maybeSingle();

        if (anyTenant) { setAccessDenied(true); }
        else { setNeedsBootstrap(true); }
      } catch { setNeedsBootstrap(true); }
      finally { setChecking(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("bootstrap_tenant" as any, {
        _business_name: businessName.trim(),
        _branch_name: branchName.trim(),
        _tax_rate: Number(taxRate) / 100,
      });
      if (error) throw error;
      const bootstrap = Array.isArray(data) ? data[0] : data;
      if (!bootstrap?.tenant_id || !bootstrap?.branch_id) {
        throw new Error("El bootstrap no devolvió tenant/sucursal");
      }
      setTenant(bootstrap.tenant_id);
      setBranch(bootstrap.branch_id);
      await qc.invalidateQueries({ queryKey: ["my-roles"] });
      toast.success("¡Negocio configurado! Bienvenido");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message ?? "No pudimos crear el negocio");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="g-onboarding-root">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--ink-400)" }} />
      </div>
    );
  }

  if (tenantOptions.length > 0) {
    return (
      <div className="g-onboarding-root">
        <div className="glass g-onboarding-card">
          <div className="flex items-center gap-3 mb-5">
            <GearMark size={36} />
            <div>
              <div className="h-label g-auth-eyebrow mb-1">ACCESO MÚLTIPLE</div>
              <div className="h-display g-auth-title">¿En qué negocio trabajas?</div>
              <div className="h-meta mt-0.5">Tienes acceso a varios negocios.</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {tenantOptions.map((opt) => (
              <button
                key={opt.tenant_id}
                type="button"
                className="glass-thin g-onboarding-tenant-btn text-left"
                onClick={() => enterTenant(opt.tenant_id, opt.branch_id)}
              >
                <div className="g-onboarding-tenant-name">
                  {opt.tenants?.name ?? opt.tenant_id}
                </div>
                <div className="h-meta capitalize">Rol: {opt.role}</div>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="g-btn g-btn-ghost w-full mt-4"
            onClick={async () => { await signOutFully(); navigate("/auth", { replace: true }); }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="g-onboarding-root">
        <div className="glass g-onboarding-card text-center">
          <div className="orb g-onboarding-lock-orb mx-auto mb-4">
            <Lock size={26} />
          </div>
          <div className="h-label g-onboarding-denied-eyebrow mb-2">SIN ACCESO</div>
          <div className="h-display g-auth-title mb-2">Cuenta sin rol asignado</div>
          <p className="h-meta mb-6">
            Tu cuenta existe pero aún no tiene un rol. Pide al administrador
            acceso desde Configuración → Usuarios.
          </p>
          <button
            type="button"
            className="g-btn g-btn-ghost w-full"
            onClick={async () => { await signOutFully(); navigate("/auth", { replace: true }); }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  if (!needsBootstrap) return null;

  return (
    <div className="g-onboarding-root">
      <div className="glass g-onboarding-card">
        <div className="flex items-center gap-3 mb-6">
          <div className="orb g-onboarding-setup-orb">
            <Building2 size={20} />
          </div>
          <div>
            <div className="h-label g-auth-eyebrow mb-1">PRIMER SETUP</div>
            <div className="h-display g-auth-title">Configura tu negocio</div>
            <div className="h-meta">Eres el primer usuario. Menos de un minuto.</div>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre del negocio</Label>
            <Input required placeholder="Mi Negocio" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Primera sucursal</Label>
            <Input required value={branchName} onChange={(e) => setBranchName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Impuesto por defecto (%)</Label>
            <Input type="number" min="0" max="100" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
          </div>
          <button type="submit" className="g-btn g-btn-primary g-btn-touch w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Crear negocio
          </button>
        </form>
      </div>
    </div>
  );
}
