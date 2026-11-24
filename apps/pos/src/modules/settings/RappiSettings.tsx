import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Copy, RefreshCw, PlugZap, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rappi-webhook`;

export default function RappiSettings() {
  const { tenantId, branchId, branches } = useTenantContext();
  const qc = useQueryClient();

  const [storeId, setStoreId] = useState("");
  const [autoAccept, setAutoAccept] = useState(false);
  const [prepTime, setPrepTime] = useState(15);
  const [status, setStatus] = useState<"active" | "paused">("active");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: integ, isLoading } = useQuery({
    queryKey: ["rappi-integration", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data } = await supabase
        .from("rappi_integrations")
        .select("*")
        .eq("branch_id", branchId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["rappi-logs", branchId],
    enabled: !!branchId,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data } = await supabase
        .from("rappi_webhook_logs")
        .select("*")
        .or(`branch_id.eq.${branchId},branch_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (integ) {
      setStoreId(integ.store_id ?? "");
      setAutoAccept(!!integ.auto_accept);
      setPrepTime(integ.prep_time_min ?? 15);
      setStatus((integ.status as any) ?? "active");
    } else {
      setStoreId(""); setAutoAccept(false); setPrepTime(15); setStatus("active");
    }
  }, [integ]);

  const branchName = branches.find((b) => b.id === branchId)?.name ?? "—";

  const save = async () => {
    if (!tenantId || !branchId) return;
    if (!storeId.trim()) return toast.error("Ingresa el Store ID de Rappi");
    setBusy("save");
    try {
      const payload = {
        tenant_id: tenantId,
        branch_id: branchId,
        store_id: storeId.trim(),
        auto_accept: autoAccept,
        prep_time_min: prepTime,
        status,
      };
      const { error } = integ
        ? await supabase.from("rappi_integrations").update(payload).eq("id", integ.id)
        : await supabase.from("rappi_integrations").insert(payload);
      if (error) throw error;
      toast.success("Integración guardada");
      qc.invalidateQueries({ queryKey: ["rappi-integration"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(null); }
  };

  const test = async () => {
    if (!branchId) return;
    setBusy("test");
    try {
      const { data, error } = await supabase.functions.invoke("rappi-test-connection", {
        body: { branch_id: branchId, store_id: storeId || integ?.store_id },
      });
      if (error) throw error;
      if (data?.ok) toast.success("Conexión OK con Rappi");
      else toast.error(`Falló: ${data?.error ?? "verifica credenciales"}`);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const syncMenu = async () => {
    if (!branchId) return;
    setBusy("sync");
    try {
      const { data, error } = await supabase.functions.invoke("rappi-sync-menu", {
        body: { branch_id: branchId },
      });
      if (error) throw error;
      if (data?.ok) toast.success(`Menú enviado · ${data.items} ítems`);
      else toast.error(`Error: ${data?.error ?? "no se pudo enviar"}`);
      qc.invalidateQueries({ queryKey: ["rappi-integration"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const copyWebhook = async () => {
    await navigator.clipboard.writeText(WEBHOOK_URL);
    toast.success("URL del webhook copiada");
  };

  if (isLoading) return <div className="text-muted-foreground">Cargando…</div>;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="glass p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <PlugZap className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Integración con Rappi</h2>
            {integ && (
              <Badge variant={status === "active" ? "default" : "outline"}>
                {status === "active" ? "Activa" : "Pausada"}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Sucursal: <strong>{branchName}</strong>. Cada sucursal usa su propio Store ID de Rappi Partners.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Store ID (Rappi)</Label>
            <Input value={storeId} onChange={(e) => setStoreId(e.target.value)} placeholder="Ej. 900123" />
          </div>
          <div>
            <Label>Tiempo de preparación (min)</Label>
            <Input
              type="number" min="1" max="120"
              value={prepTime}
              onChange={(e) => setPrepTime(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Estado</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activa</SelectItem>
                <SelectItem value="paused">Pausada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between border rounded-md px-3 h-10 mt-6">
            <Label className="cursor-pointer">Auto-aceptar pedidos</Label>
            <Switch checked={autoAccept} onCheckedChange={setAutoAccept} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={busy === "save"}>
            {busy === "save" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Guardar
          </Button>
          <Button variant="outline" onClick={test} disabled={busy === "test"}>
            {busy === "test" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Probar conexión
          </Button>
          <Button variant="outline" onClick={syncMenu} disabled={busy === "sync" || !integ}>
            {busy === "sync" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Sincronizar menú
          </Button>
          <a
            href="https://dev-portal.rappi.com/api/es/" target="_blank" rel="noreferrer"
            className="inline-flex items-center text-sm text-primary hover:underline ml-auto"
          >
            <BookOpen className="h-4 w-4 mr-1" /> Documentación
          </a>
        </div>

        {integ?.last_menu_sync_at && (
          <p className="text-xs text-muted-foreground">
            Último envío de menú: {formatDate(integ.last_menu_sync_at)}
          </p>
        )}

        <div className="border-t pt-4">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">URL del Webhook</Label>
          <div className="flex gap-2 mt-1">
            <Input readOnly value={WEBHOOK_URL} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={copyWebhook}><Copy className="h-4 w-4" /></Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Pega esta URL en el Partner Portal de Rappi como destino de eventos (nuevos pedidos, cambios de estado).
          </p>
        </div>
      </div>

      <div className="glass p-4">
        <div className="text-sm font-semibold mb-3">Últimos eventos recibidos</div>
        {(logs ?? []).length === 0 ? (
          <div className="text-xs text-muted-foreground">Aún no hay eventos.</div>
        ) : (
          <div className="space-y-2 max-h-[480px] overflow-auto">
            {logs!.map((l) => (
              <div key={l.id} className="text-xs border rounded-md p-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{l.event_type}</span>
                  <Badge variant={l.status === "error" ? "destructive" : "outline"} className="text-[10px]">
                    {l.status}
                  </Badge>
                </div>
                <div className="text-muted-foreground">{formatDate(l.created_at)}</div>
                {l.rappi_order_id && <div>Pedido: {l.rappi_order_id}</div>}
                {l.error && <div className="text-destructive truncate">{l.error}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
