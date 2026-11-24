import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useDevMode } from "@/hooks/useDevMode";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Save, FlaskConical } from "lucide-react";

const CURRENCIES = ["COP", "USD", "MXN", "ARS", "EUR", "PEN", "CLP", "BRL"];

export default function BusinessSettings() {
  const { tenantId, hasRole } = useTenantContext();
  const qc = useQueryClient();
  const canEdit = hasRole("owner", "admin");
  const { devMode, canToggle, setDevMode, isPending: devModePending } = useDevMode();

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["tenant", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, currency, tax_rate")
        .eq("id", tenantId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({ name: "", currency: "COP", tax_rate: 19 });

  useEffect(() => {
    if (tenant) {
      setForm({
        name: tenant.name ?? "",
        currency: tenant.currency ?? "COP",
        tax_rate: Number(tenant.tax_rate ?? 0),
      });
    }
  }, [tenant]);

  const save = async () => {
    if (!tenantId) return;
    if (!form.name.trim()) return toast.error("El nombre es requerido");
    const { error } = await supabase
      .from("tenants")
      .update({
        name: form.name.trim(),
        currency: form.currency,
        tax_rate: form.tax_rate,
      })
      .eq("id", tenantId);
    if (error) return toast.error(error.message);
    toast.success("Datos del negocio actualizados");
    qc.invalidateQueries({ queryKey: ["tenant"] });
    qc.invalidateQueries({ queryKey: ["my-roles"] });
  };

  if (isLoading) return <div className="h-meta">Cargando…</div>;

  return (
    <div className="space-y-6">
      <div className="glass p-6 rounded-2xl max-w-2xl space-y-5">
        <div className="space-y-1.5">
          <Label>Nombre del bar</Label>
          <Input
            placeholder="Mi Bar"
            value={form.name}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Moneda</Label>
            <Select
              value={form.currency}
              disabled={!canEdit}
              onValueChange={(v) => setForm({ ...form, currency: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>IVA por defecto (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              disabled={!canEdit}
              value={form.tax_rate}
              onChange={(e) => setForm({ ...form, tax_rate: Number(e.target.value) })}
            />
          </div>
        </div>

        {canEdit ? (
          <div className="pt-2">
            <button type="button" className="g-btn g-btn-primary" onClick={save}>
              <Save className="h-4 w-4" /> Guardar cambios
            </button>
          </div>
        ) : (
          <p className="h-meta">
            Solo el dueño o administradores pueden editar estos datos.
          </p>
        )}
      </div>

      {/* Dev mode card — visible only to owner / super_admin */}
      {canToggle && (
        <div className="glass p-6 rounded-2xl max-w-2xl border border-orange-200/60">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="orb orb-sq w-9 h-9">
                <FlaskConical className="h-4 w-4 text-orange-500" />
              </span>
              <div className="space-y-1">
                <p className="font-semibold text-sm text-ink-900">Modo desarrollo</p>
                <p className="h-meta max-w-sm">
                  Permite registrar ventas y órdenes sin importar el stock disponible.
                  Útil para pruebas y demostraciones. Un banner naranja avisa cuando está activo.
                </p>
              </div>
            </div>
            <Switch
              checked={devMode}
              disabled={devModePending}
              onCheckedChange={(checked) => {
                setDevMode(checked);
                toast[checked ? "warning" : "success"](
                  checked ? "Modo desarrollo ACTIVADO" : "Modo desarrollo desactivado"
                );
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
