import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Factory, CheckCircle2, Calendar } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function StatusPill({ status }: { status: string }) {
  if (status === "completed") return <span className="pill pill-ok">Completada</span>;
  if (status === "in_progress" || status === "running") return <span className="pill pill-brand">En curso</span>;
  return <span className="pill pill-ghost">Borrador</span>;
}

function ProgressBar({ pct, status }: { pct: number; status: string }) {
  const fillClass =
    status === "completed" ? "g-prod-bar-fill-ok" :
    (status === "in_progress" || status === "running") ? "g-prod-bar-fill-run" :
    "g-prod-bar-fill-queue";
  return (
    <div className="g-prod-bar-track">
      <div className={fillClass} {...{ style: { width: `${Math.min(100, pct)}%` } }} />
    </div>
  );
}

export default function Production() {
  const { tenantId, branchId } = useTenantContext();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [completeOrder, setCompleteOrder] = useState<any | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: orders } = useQuery({
    queryKey: ["production-orders", branchId],
    enabled: !!branchId,
    queryFn: async () => (await supabase.from("production_orders")
      .select("*, products(name, unit_code)")
      .eq("branch_id", branchId!).order("created_at", { ascending: false }).limit(50)).data ?? [],
  });

  const { data: recipeProducts } = useQuery({
    queryKey: ["recipe-products", tenantId],
    enabled: !!tenantId,
    queryFn: async () => (await supabase.from("products")
      .select("id, name, unit_code")
      .eq("tenant_id", tenantId!).in("product_type", ["composite", "production", "combo"])
      .order("name")).data ?? [],
  });

  const allOrders = orders ?? [];
  const stats = {
    total: allOrders.length,
    running: allOrders.filter((o: any) => o.status === "in_progress" || o.status === "running").length,
    completed: allOrders.filter((o: any) => o.status === "completed").length,
    draft: allOrders.filter((o: any) => o.status === "draft").length,
  };
  const filtered = filterStatus === "all" ? allOrders : allOrders.filter((o: any) => o.status === filterStatus);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1">
          <div className="h-display g-page-title">Producción</div>
          <div className="h-meta g-page-subtitle">Recetas, lotes y órdenes · Sincronizado con inventario y KDS</div>
        </div>
        <div className="glass g-prod-header-date">
          <Calendar size={14} color="var(--ink-400)" />
          <span>Hoy</span>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <button type="button" className="g-btn g-btn-primary g-prod-header-btn">
              <Plus size={14} /> Nueva orden
            </button>
          </DialogTrigger>
          <CreateOrderDialog
            tenantId={tenantId!} branchId={branchId!}
            products={recipeProducts ?? []}
            onClose={() => { setCreateOpen(false); qc.invalidateQueries({ queryKey: ["production-orders"] }); }}
          />
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { l: "Órdenes hoy", v: String(stats.total), s: `${stats.running} en curso · ${stats.draft} en cola` },
          { l: "Completadas",  v: String(stats.completed), s: "Hoy" },
          { l: "En curso",     v: String(stats.running),   s: "activas ahora" },
          { l: "Borradores",   v: String(stats.draft),     s: "pendientes de inicio" },
        ].map((s, i) => (
          <div key={i} className="glass flex flex-col gap-1.5 p-4 rounded-2xl">
            <div className="h-label">{s.l}</div>
            <div className="h-num g-stat-val">{s.v}</div>
            <div className="h-meta">{s.s}</div>
          </div>
        ))}
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2">
        {[
          { id: "all",         label: `Todas · ${stats.total}` },
          { id: "in_progress", label: `En curso · ${stats.running}` },
          { id: "completed",   label: `Completadas · ${stats.completed}` },
          { id: "draft",       label: `Borradores · ${stats.draft}` },
        ].map((f) => (
          <button
            key={f.id} type="button"
            className={cn("pill pill-md", filterStatus === f.id ? "pill-brand" : "pill-ghost")}
            onClick={() => setFilterStatus(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Orders table */}
      <div className="glass g-table-p0 flex flex-col rounded-2xl overflow-hidden flex-1">
        <div className="g-prod-table-head">
          <span>Producto</span><span>Planeado</span><span>Producido</span>
          <span>Merma</span><span>Progreso</span><span>Estado</span><span />
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Factory size={36} color="var(--ink-400)" opacity={0.3} />
            <p className="h-meta text-center">Sin órdenes de producción</p>
          </div>
        ) : (
          filtered.map((o: any, i: number) => {
            const planned  = Number(o.planned_quantity ?? 0);
            const produced = Number(o.produced_quantity ?? 0);
            const waste    = Number(o.waste_quantity ?? 0);
            const pct      = planned > 0 ? (produced / planned) * 100 : 0;
            return (
              <div key={o.id} className={cn("g-prod-table-row", i % 2 === 1 && "g-prod-table-row-alt")}>
                {/* Product */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="orb g-prod-orb">
                    <Factory size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="g-prod-name truncate">{o.products?.name}</div>
                    <div className="g-prod-date">
                      {new Date(o.created_at).toLocaleString("es-CO", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
                {/* Columns */}
                <div className="h-num g-prod-val-num">{planned.toFixed(2)} {o.products?.unit_code ?? ""}</div>
                <div className={cn("h-num", o.status === "completed" ? "g-prod-val-ok" : "g-prod-val-num")}>
                  {produced > 0 ? produced.toFixed(2) : "—"}
                </div>
                <div className={cn("h-num", waste > 0 ? "g-prod-val-warn" : "g-prod-val-dim")}>
                  {waste > 0 ? waste.toFixed(2) : "—"}
                </div>
                <div className="flex flex-col gap-1">
                  <ProgressBar pct={pct} status={o.status} />
                  {produced > 0 && <div className="g-prod-pct">{pct.toFixed(0)}%</div>}
                </div>
                <StatusPill status={o.status} />
                <div className="flex justify-end">
                  {o.status !== "completed" && (
                    <button
                      type="button"
                      className="g-btn g-btn-ghost g-btn-sm"
                      onClick={() => setCompleteOrder(o)}
                    >
                      <CheckCircle2 size={13} /> Completar
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {completeOrder && (
        <CompleteOrderDialog
          order={completeOrder}
          onClose={() => {
            setCompleteOrder(null);
            qc.invalidateQueries({ queryKey: ["production-orders"] });
            qc.invalidateQueries({ queryKey: ["stocks"] });
          }}
        />
      )}
    </div>
  );
}

function CreateOrderDialog({ tenantId, branchId, products, onClose }: any) {
  const [productId, setProductId] = useState("");
  const [planned, setPlanned] = useState("1");
  const [notes, setNotes] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("production_orders").insert({
      tenant_id: tenantId, branch_id: branchId, product_id: productId,
      planned_quantity: Number(planned), notes: notes || null, status: "draft",
    });
    if (error) return toast.error(error.message);
    toast.success("Orden creada");
    setProductId(""); setPlanned("1"); setNotes("");
    onClose();
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Nueva orden de producción</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Producto a producir</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
            <SelectContent>
              {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Cantidad planeada</Label>
          <Input type="number" step="0.01" value={planned} onChange={(e) => setPlanned(e.target.value)} className="h-12 text-lg" />
        </div>
        <div className="space-y-1.5">
          <Label>Notas</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
        </div>
        <Button type="submit" className="w-full h-12" disabled={!productId}>Crear orden</Button>
      </form>
    </DialogContent>
  );
}

function CompleteOrderDialog({ order, onClose }: { order: any | null; onClose: () => void }) {
  const [produced, setProduced] = useState("");
  const [waste, setWaste] = useState("0");

  const submit = async () => {
    if (!order) return;
    const { error } = await supabase.rpc("complete_production_order", {
      _order_id: order.id, _produced: Number(produced), _waste: Number(waste),
    });
    if (error) return toast.error(error.message);
    toast.success("Orden completada · stock actualizado");
    setProduced(""); setWaste("0");
    onClose();
  };

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Completar orden</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {order?.products?.name} · planeado {Number(order?.planned_quantity ?? 0).toFixed(2)}
          </div>
          <div className="space-y-1.5">
            <Label>Producido</Label>
            <Input type="number" step="0.01" value={produced} onChange={(e) => setProduced(e.target.value)}
              placeholder={String(order?.planned_quantity ?? "")} className="h-12 text-lg" />
          </div>
          <div className="space-y-1.5">
            <Label>Merma</Label>
            <Input type="number" step="0.01" value={waste} onChange={(e) => setWaste(e.target.value)} />
          </div>
          <Button size="lg" className="w-full" onClick={submit} disabled={!produced}>
            Completar y descontar ingredientes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
