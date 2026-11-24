import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Image, Layout, Save, Eye } from "lucide-react";

export default function ReceiptSettings() {
  const { tenantId } = useTenantContext();
  const qc = useQueryClient();
  const [config, setConfig] = useState({
    header_text: "",
    footer_text: "",
    show_logo: true,
    show_tax_details: true,
    show_customer_info: true,
    font_size: "small",
  });

  const { data: tenant } = useQuery({
    queryKey: ["tenant-receipt-config", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("*").eq("id", tenantId!).single();
      return data;
    },
  });

  useEffect(() => {
    if (tenant?.receipt_config) {
      setConfig(tenant.receipt_config as any);
    }
  }, [tenant]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("tenants")
        .update({ receipt_config: config })
        .eq("id", tenantId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuración de recibo guardada");
      qc.invalidateQueries({ queryKey: ["tenant-receipt-config"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">
      <div className="space-y-6">
        <div className="glass p-6 rounded-2xl space-y-6">
          <div className="flex items-center gap-2 font-bold text-ink-900">
            <Layout className="h-5 w-5 text-brand-600" /> Estructura del Recibo
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Texto de Encabezado (Debajo del nombre)</Label>
              <Input
                placeholder="NIT: 123456789-0 | Calle 123 # 45-67"
                value={config.header_text}
                onChange={(e) => setConfig({ ...config, header_text: e.target.value })}
              />
              <p className="h-meta">Suele incluirse el NIT, dirección y resolución de facturación.</p>
            </div>

            <div className="space-y-2">
              <Label>Texto de Pie de Página (Footer)</Label>
              <Textarea
                placeholder="¡Gracias por su compra! Vuelva pronto."
                value={config.footer_text}
                onChange={(e) => setConfig({ ...config, footer_text: e.target.value })}
                className="min-h-[100px]"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label>Mostrar Logo</Label>
                  <p className="h-meta">Incluir logo de la empresa en el ticket</p>
                </div>
                <Switch
                  checked={config.show_logo}
                  onCheckedChange={(v) => setConfig({ ...config, show_logo: v })}
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label>Detalle de Impuestos</Label>
                  <p className="h-meta">Desglosar base e IVA</p>
                </div>
                <Switch
                  checked={config.show_tax_details}
                  onCheckedChange={(v) => setConfig({ ...config, show_tax_details: v })}
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label>Datos del Cliente</Label>
                  <p className="h-meta">Mostrar nombre y documento del cliente</p>
                </div>
                <Switch
                  checked={config.show_customer_info}
                  onCheckedChange={(v) => setConfig({ ...config, show_customer_info: v })}
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-black/5 flex justify-end">
            <button type="button" className="g-btn g-btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="h-4 w-4" /> Guardar cambios
            </button>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-4">
        <div className="h-label uppercase tracking-widest flex items-center gap-2">
          <Eye className="h-3 w-3" /> Vista Previa (80mm)
        </div>
        <div className="bg-white text-black p-6 font-mono text-[10px] shadow-lg border-2 border-dashed rounded-xl">
          <div className="text-center space-y-1 mb-4">
            {config.show_logo && (
              <div className="h-12 w-12 bg-gray-100 rounded-full mx-auto mb-2 grid place-items-center">
                <Image className="h-6 w-6 text-gray-300" />
              </div>
            )}
            <div className="font-bold text-sm uppercase">{tenant?.name || "MI NEGOCIO"}</div>
            <div className="whitespace-pre-line text-slate-600">{config.header_text || "NIT 000.000.000-0\nCalle Falsa 123\nTel: 555-5555"}</div>
          </div>

          <div className="border-t border-b border-dashed py-2 mb-2 space-y-1">
            <div className="flex justify-between">
              <span>ORDEN #1234</span>
              <span>06/05/2026 10:00</span>
            </div>
            {config.show_customer_info && (
              <div className="text-[9px]">CLIENTE: CONSUMIDOR FINAL</div>
            )}
          </div>

          <div className="space-y-1 mb-4">
            <div className="flex justify-between">
              <span>2.0 x PRODUCTO A</span>
              <span>$20.000</span>
            </div>
            <div className="flex justify-between">
              <span>1.0 x PRODUCTO B</span>
              <span>$10.000</span>
            </div>
          </div>

          <div className="border-t border-dashed pt-2 space-y-1">
            <div className="flex justify-between font-bold text-xs">
              <span>TOTAL</span>
              <span>$30.000</span>
            </div>
            {config.show_tax_details && (
              <div className="text-[8px] opacity-60">
                <div className="flex justify-between">
                  <span>Base Gravable:</span>
                  <span>$25.210</span>
                </div>
                <div className="flex justify-between">
                  <span>IVA (19%):</span>
                  <span>$4.790</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 text-center whitespace-pre-line italic opacity-70">
            {config.footer_text || "¡Gracias por su compra!\nDesarrollado por S360T"}
          </div>
        </div>
      </div>
    </div>
  );
}
