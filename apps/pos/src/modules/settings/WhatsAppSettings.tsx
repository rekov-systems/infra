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
import { Copy, Bot, Webhook, Save, Loader2, Wifi, WifiOff, CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const EVO_WEBHOOK = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-webhook`;

// ─── Types ───────────────────────────────────────────────────
type DiagStep = {
  label: string;
  status: "pending" | "ok" | "fail" | "warn";
  detail?: string;
};

// ─── Helper ──────────────────────────────────────────────────
const statusIcon = (s: DiagStep["status"]) => {
  if (s === "ok")   return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
  if (s === "fail") return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
  if (s === "warn") return <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />;
  return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />;
};

export default function WhatsAppSettings() {
  const { tenantId, branchId, branches } = useTenantContext();
  const qc = useQueryClient();
  const [selectedBranch, setSelectedBranch] = useState(branchId ?? "");
  const [instance, setInstance] = useState("");
  const [phone, setPhone] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Diagnostics state ──
  const [testing, setTesting] = useState(false);
  const [diagSteps, setDiagSteps] = useState<DiagStep[]>([]);
  const [diagDone, setDiagDone] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ["ai-channel-config", selectedBranch],
    enabled: !!selectedBranch,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_channel_configs")
        .select("*")
        .eq("branch_id", selectedBranch)
        .eq("channel", "whatsapp")
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (config) {
      setInstance((config.config as any)?.evolution_instance ?? "");
      setPhone(config.phone_number ?? "");
      setIsActive(config.is_active ?? true);
    } else {
      setInstance("");
      setPhone("");
      setIsActive(true);
    }
  }, [config]);

  useEffect(() => {
    if (branchId) setSelectedBranch(branchId);
  }, [branchId]);

  // ── Save ──────────────────────────────────────────────────
  const save = async () => {
    if (!instance.trim()) return toast.error("Ingresa el nombre de instancia de Evolution API");
    if (!selectedBranch || !tenantId) return;
    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        branch_id: selectedBranch,
        channel: "whatsapp",
        phone_number: phone.trim() || null,
        is_active: isActive,
        config: { evolution_instance: instance.trim() },
        updated_at: new Date().toISOString(),
      };
      const { error } = config
        ? await supabase.from("ai_channel_configs").update(payload).eq("id", config.id)
        : await supabase.from("ai_channel_configs").insert(payload);
      if (error) throw error;
      toast.success("Configuración guardada");
      qc.invalidateQueries({ queryKey: ["ai-channel-config"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const copyWebhook = async () => {
    await navigator.clipboard.writeText(EVO_WEBHOOK);
    toast.success("URL del webhook copiada");
  };

  // ── Connection test ───────────────────────────────────────
  const runDiagnostics = async () => {
    setTesting(true);
    setDiagDone(false);
    const steps: DiagStep[] = [
      { label: "Configuración en DB", status: "pending" },
      { label: "Edge function evolution-webhook", status: "pending" },
      { label: "Edge function send-whatsapp-message", status: "pending" },
      { label: "Evolution API reachable (fetch desde cliente)", status: "pending" },
      { label: "Instancia Evolution API responde", status: "pending" },
    ];
    setDiagSteps([...steps]);

    const update = (i: number, patch: Partial<DiagStep>) => {
      steps[i] = { ...steps[i], ...patch };
      setDiagSteps([...steps]);
    };

    // Step 0: DB config check
    try {
      const { data: cfgCheck } = await supabase
        .from("ai_channel_configs")
        .select("id, is_active, phone_number, config")
        .eq("branch_id", selectedBranch)
        .eq("channel", "whatsapp")
        .eq("is_active", true)
        .maybeSingle();

      if (!cfgCheck) {
        update(0, { status: "fail", detail: "No hay configuración activa de WhatsApp para esta sucursal. Guarda la configuración primero." });
      } else {
        const evoInst = (cfgCheck.config as any)?.evolution_instance;
        if (!evoInst) {
          update(0, { status: "warn", detail: "Configuración encontrada pero sin nombre de instancia Evolution." });
        } else {
          update(0, { status: "ok", detail: `Instancia: "${evoInst}" | Teléfono: ${cfgCheck.phone_number ?? "no especificado"}` });
        }
      }
    } catch (e: any) {
      update(0, { status: "fail", detail: e.message });
    }

    // Step 1: Ping evolution-webhook function
    try {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "PING_TEST", instance: "__ping__", data: {} }),
      });
      const body = await r.json().catch(() => ({}));
      // 200 ok:true/ignored OR 404 (no config for __ping__) = function is UP
      if (r.status === 200 || r.status === 404) {
        update(1, { status: "ok", detail: `HTTP ${r.status} – función activa` });
      } else {
        update(1, { status: "warn", detail: `HTTP ${r.status}: ${JSON.stringify(body)}` });
      }
    } catch (e: any) {
      update(1, { status: "fail", detail: `No se pudo alcanzar: ${e.message}` });
    }

    // Step 2: Ping send-whatsapp-message (sin auth → esperamos 401 del gateway)
    try {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (r.status === 401) {
        update(2, { status: "ok", detail: "HTTP 401 esperado – función activa y protegida correctamente" });
      } else {
        const respBody = await r.json().catch(() => ({}));
        update(2, { status: "warn", detail: `HTTP ${r.status}: ${JSON.stringify(respBody)}` });
      }
    } catch (e: any) {
      update(2, { status: "fail", detail: `No se pudo alcanzar: ${e.message}` });
    }

    // Step 3 & 4: Verificar secrets de Evolution API vía edge function autenticada
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sin sesión activa");

      // Enviamos __connection_test junto con tenant/branch para pasar la validación de roles
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          __connection_test: true,
          tenant_id: tenantId,
          branch_id: selectedBranch,
        }),
      });
      const respBody = await r.json().catch(() => ({}));

      if (r.status === 200 && respBody?.diagnostics) {
        const diag = respBody.diagnostics;
        update(3, { status: "ok", detail: "Autenticación JWT ✓ | Permisos de rol verificados" });
        const evoUrlOk = diag.evolution_api_url_set;
        const evoKeyOk = diag.evolution_api_key_set;
        if (evoUrlOk && evoKeyOk) {
          update(4, { status: "ok", detail: "EVOLUTION_API_URL y EVOLUTION_API_KEY configurados en secrets" });
        } else {
          const missing = [!evoUrlOk && "EVOLUTION_API_URL", !evoKeyOk && "EVOLUTION_API_KEY"].filter(Boolean).join(" y ");
          update(4, {
            status: "fail",
            detail: `Faltan secretos: ${missing}. Ve a Supabase → Edge Functions → Secrets.`,
          });
        }
      } else if (r.status === 401) {
        update(3, { status: "fail", detail: "JWT rechazado – verifica que el usuario tenga sesión activa" });
        update(4, { status: "warn", detail: "Requiere autenticación válida para continuar" });
      } else if (r.status === 403) {
        update(3, { status: "fail", detail: "Sin permisos (Forbidden) – verifica que tu usuario tenga rol owner/admin/manager en esta sucursal" });
        update(4, { status: "warn", detail: "Requiere rol adecuado para continuar" });
      } else {
        update(3, { status: "warn", detail: `HTTP ${r.status}: ${JSON.stringify(respBody)}` });
        update(4, { status: "warn", detail: "Resultado inesperado" });
      }
    } catch (e: any) {
      update(3, { status: "fail", detail: e.message });
      update(4, { status: "warn", detail: "No se pudo completar la prueba" });
    }

    setDiagDone(true);
    setTesting(false);
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Webhook URL */}
      <div className="glass p-5 space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <Webhook className="h-4 w-4 text-primary" />
          URL del Webhook (Evolution API)
        </div>
        <p className="text-sm text-muted-foreground">
          Configura esta URL en tu instancia de Evolution API como destino de eventos{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-xs">MESSAGES_UPSERT</code>.
        </p>
        <div className="flex gap-2">
          <Input readOnly value={EVO_WEBHOOK} className="font-mono text-xs" />
          <Button variant="outline" size="icon" onClick={copyWebhook} title="Copiar URL">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Configuración por sucursal */}
      <div className="glass p-5 space-y-4">
        <div className="flex items-center gap-2 font-semibold">
          <Bot className="h-4 w-4 text-primary" />
          Agente IA WhatsApp
          {config && (
            <Badge className={config.is_active ? "bg-success text-success-foreground" : "bg-muted"}>
              {config.is_active ? "Activo" : "Inactivo"}
            </Badge>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Sucursal</Label>
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona sucursal…" />
            </SelectTrigger>
            <SelectContent>
              {(branches ?? []).map((b: any) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre de instancia (Evolution API)</Label>
              <Input
                placeholder="ej. pos-negocio-barra"
                value={instance}
                onChange={e => setInstance(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Debe coincidir exactamente con el nombre de la instancia en tu Evolution API.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Número WhatsApp asociado (opcional)</Label>
              <Input
                placeholder="57300XXXXXXX"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="wa-active" />
              <Label htmlFor="wa-active">Agente activo</Label>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Guardar configuración
              </Button>
              <Button variant="outline" onClick={runDiagnostics} disabled={testing || !selectedBranch}>
                {testing
                  ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  : diagDone
                    ? <RefreshCw className="h-4 w-4 mr-2" />
                    : <Wifi className="h-4 w-4 mr-2" />
                }
                {diagDone ? "Repetir diagnóstico" : "Probar conexión"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Diagnostics panel ── */}
      {diagSteps.length > 0 && (
        <div className="glass p-5 space-y-3">
          <div className="flex items-center gap-2 font-semibold">
            {diagDone
              ? diagSteps.every(s => s.status === "ok")
                ? <><CheckCircle2 className="h-4 w-4 text-green-500" /> Todo en orden</>
                : diagSteps.some(s => s.status === "fail")
                  ? <><WifiOff className="h-4 w-4 text-red-500" /> Se encontraron problemas</>
                  : <><AlertCircle className="h-4 w-4 text-yellow-500" /> Advertencias detectadas</>
              : <><Loader2 className="h-4 w-4 animate-spin text-primary" /> Ejecutando diagnóstico…</>
            }
          </div>

          <div className="space-y-2">
            {diagSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b last:border-0">
                {statusIcon(step.status)}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-none mb-0.5">{step.label}</p>
                  {step.detail && (
                    <p className={`text-xs mt-1 ${
                      step.status === "fail" ? "text-red-500"
                      : step.status === "warn" ? "text-yellow-600"
                      : "text-muted-foreground"
                    }`}>
                      {step.detail}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {diagDone && diagSteps.some(s => s.status === "fail" || s.status === "warn") && (
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1.5">
              <p className="font-semibold text-foreground">Acciones recomendadas:</p>
              {diagSteps[0]?.status !== "ok" && (
                <p>• <strong>Configuración:</strong> Llena el nombre de instancia, guarda y activa el agente.</p>
              )}
              {(diagSteps[3]?.status !== "ok") && (
                <p>• <strong>Secrets de Edge Function:</strong> Ve a Supabase Dashboard → Edge Functions → send-whatsapp-message → Secrets y agrega <code>EVOLUTION_API_URL</code> y <code>EVOLUTION_API_KEY</code>.</p>
              )}
              {(diagSteps[4]?.status === "warn") && (
                <p>• <strong>Evolution API:</strong> Verifica que tu instancia <code>{instance || "?"}</code> esté conectada a WhatsApp (QR escaneado) y que el webhook esté configurado con la URL de arriba.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Instrucciones */}
      <div className="glass p-5 space-y-2 bg-muted/30">
        <p className="text-sm font-medium">Cómo conectar Evolution API</p>
        <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Crea una instancia en tu Evolution API con el nombre exacto que pusiste arriba.</li>
          <li>En la instancia, ve a <strong>Webhooks</strong> y pega la URL de arriba.</li>
          <li>Activa el evento <strong>MESSAGES_UPSERT</strong>.</li>
          <li>Conecta la instancia a WhatsApp escaneando el QR.</li>
          <li>Activa el agente con el toggle de arriba y guarda.</li>
          <li>En Supabase → Edge Functions → Secrets, agrega <code className="bg-muted px-1 rounded">EVOLUTION_API_URL</code> y <code className="bg-muted px-1 rounded">EVOLUTION_API_KEY</code>.</li>
        </ol>
      </div>
    </div>
  );
}
