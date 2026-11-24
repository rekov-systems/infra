import { useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, ShieldCheck, RefreshCcw, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function SystemMaintenance() {
  const { tenantId, branchId } = useTenantContext();
  const [loading, setLoading] = useState<string | null>(null);

  const processEmailQueue = async () => {
    setLoading("email");
    try {
      const { data, error } = await supabase.functions.invoke("process-email-queue");
      if (error) throw error;
      toast.success(`Cola de emails procesada: ${data?.processed || 0} enviados`);
    } catch (err: any) {
      toast.error("Error al procesar emails: " + err.message);
    } finally {
      setLoading(null);
    }
  };

  const auditInventoryDrift = async () => {
    setLoading("inventory");
    try {
      // Este RPC asegura que todos los productos activos tengan un registro en inventory_stocks
      const { data, error } = await supabase.rpc("audit_inventory_drift", {
        _tenant_id: tenantId,
        _branch_id: branchId
      });
      if (error) throw error;
      toast.success("Auditoría de inventario completada: stocks sincronizados");
    } catch (err: any) {
      toast.error("Error en auditoría: " + err.message);
    } finally {
      setLoading(null);
    }
  };

  const testWhatsAppConnection = async () => {
    setLoading("whatsapp");
    try {
      const { data, error } = await supabase.rpc("ai_whatsapp_config_summary", {
        _branch_id: branchId
      });
      if (error) throw error;
      
      const config = data?.[0];
      if (!config || !config.is_active) {
        toast.error("WhatsApp no está configurado o activo para esta sucursal");
        return;
      }

      toast.success("Configuración de WhatsApp cargada correctamente");
    } catch (err: any) {
      toast.error("Error en test de WhatsApp: " + err.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Emails */}
        <div className="glass rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-brand-600">
            <Mail className="h-5 w-5" />
            <div className="g-title-15">Mensajería</div>
          </div>
          <div className="h-meta">Procesamiento manual de la cola de correos electrónicos pendientes.</div>
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={processEmailQueue}
            disabled={!!loading}
          >
            {loading === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Procesar Cola de Email
          </Button>
        </div>

        {/* Inventario */}
        <div className="glass rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-brand-600">
            <ShieldCheck className="h-5 w-5" />
            <div className="g-title-15">Consistencia</div>
          </div>
          <div className="h-meta">Asegura que todos los productos tengan registros de stock válidos.</div>
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={auditInventoryDrift}
            disabled={!!loading}
          >
            {loading === "inventory" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Sincronizar Stocks
          </Button>
        </div>

        {/* WhatsApp */}
        <div className="glass rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-brand-600">
            <RefreshCcw className="h-5 w-5" />
            <div className="g-title-15">Diagnóstico</div>
          </div>
          <div className="h-meta">Verifica el estado de la conexión con el canal de WhatsApp IA.</div>
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={testWhatsAppConnection}
            disabled={!!loading}
          >
            {loading === "whatsapp" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Probar WhatsApp
          </Button>
        </div>
      </div>

      <Alert variant="destructive" className="bg-destructive/5">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Modo Manual Activo</AlertTitle>
        <AlertDescription>
          Siguiendo las políticas de operación vigentes, todas las tareas de mantenimiento en segundo plano se han delegado a ejecución manual por parte del administrador.
        </AlertDescription>
      </Alert>
    </div>
  );
}
