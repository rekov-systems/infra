import { useEffect, useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ExternalLink, Loader2, Receipt, Save, ShieldCheck } from "lucide-react";

export default function JcflowSettings() {
  const { tenantId, hasRole } = useTenantContext();
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [mode, setMode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const canManage = hasRole("owner", "admin");

  useEffect(() => {
    if (!tenantId) return;
    supabase.functions.invoke("jcflow", { body: { action: "get_status", tenant_id: tenantId } })
      .then(({ data, error }) => { if (error) toast.error(error.message); else setConfigured(!!data?.configured); })
      .finally(() => setLoading(false));
  }, [tenantId]);

  const save = async () => {
    if (!tenantId || !apiKey.trim()) return toast.error("Pega la credencial API entregada por Rekov");
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("jcflow", { body: { action: "save_credentials", tenant_id: tenantId, api_key: apiKey.trim() } });
    setSaving(false);
    if (error || data?.error) return toast.error(data?.error ?? error?.message ?? "No se pudo guardar");
    setConfigured(true); setMode(data.mode); setApiKey("");
    toast.success("Credencial de facturación guardada de forma cifrada");
  };

  return <section className="space-y-5">
    <header className="g-page-hd"><div className="g-page-hd-eyebrow">INTEGRACIONES · DOCUMENTOS ELECTRÓNICOS</div><h1 className="h-display g-page-title">Facturación electrónica</h1><p className="g-page-hd-meta">Conecta las credenciales API de JCFlow asignadas a este negocio por Rekov Systems.</p></header>
    <div className="glass max-w-2xl rounded-2xl p-6">
      <div className="mb-5 flex items-start gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Receipt /></div><div><h2 className="font-semibold">JCFlow · DIAN</h2><p className="mt-1 text-sm text-muted-foreground">La información del emisor se administra con Rekov en JCFlow. Aquí solo se configura la clave asignada a tu empresa.</p></div></div>
      {loading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <div className="mb-5 flex items-center gap-2 text-sm">{configured ? <><ShieldCheck className="h-4 w-4 text-emerald-600" /> Credencial conectada{mode ? ` · ${mode}` : ""}</> : <span className="text-muted-foreground">Falta conectar la credencial</span>}</div>}
      {canManage ? <div className="space-y-3"><div className="space-y-1.5"><Label htmlFor="jcflow-api-key">Clave API JCFlow</Label><Input id="jcflow-api-key" type="password" autoComplete="new-password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="jcf_live_… o jcf_test_…" /></div><button type="button" className="g-btn g-btn-primary" onClick={save} disabled={saving || !apiKey.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar credencial</button></div> : <p className="text-sm text-muted-foreground">Pide a un administrador del negocio que configure la credencial.</p>}
      <a href="https://jcflow.com.co/p/api-desarrolladores" target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm text-primary hover:underline">Documentación de JCFlow <ExternalLink className="h-3.5 w-3.5" /></a>
    </div>
  </section>;
}
