import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { applyInventoryMovement } from "@/lib/inventory";
import {
  Plus, AlertTriangle, Search, Warehouse, FileText, History,
  Settings2, Barcode, TrendingUp, PackagePlus, Package,
  ArrowRightLeft, ChevronRight, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useInventoryCenters } from "@/hooks/useInventoryCenters";
import { InventoryCenters } from "./components/InventoryCenters";
import { InvoiceOCRDialog } from "./components/InvoiceOCRDialog";
import { TransferDialog } from "./components/TransferDialog";
import { EanImportDialog } from "./components/EanImportDialog";
import "./inventory.css";

const MOVE_TYPES = ["purchase", "adjustment", "waste", "return"] as const;

const MOVE_TYPE_LABELS: Record<typeof MOVE_TYPES[number], string> = {
  purchase:   "Compra / Entrada",
  adjustment: "Ajuste",
  waste:      "Merma / Pérdida",
  return:     "Devolución",
};

/* ── Stock bar component (inline dynamic styles OK: data-driven widths) ── */
function StockBar({ qty, minStock }: { qty: number; minStock: number }) {
  const max = Math.max(qty, minStock * 2, 100);
  const pct = Math.min(100, (qty / max) * 100);
  const minPct = (minStock / max) * 100;
  const color =
    qty === 0 ? "var(--g-bad)" :
    qty < minStock ? "var(--g-warn)" :
    "var(--brand-500)";
  return (
    <div className="inv-stock-bar">
      <div className="inv-stock-bar-fill" {...{ style: { width: `${pct}%`, background: `linear-gradient(90deg, ${color}80, ${color})` } }} />
      <div className="inv-stock-bar-min" {...{ style: { left: `${minPct}%` } }} />
    </div>
  );
}

/* ── Mini sparkline (SVG) for movement column ── */
function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length < 2) {
    return <span className="h-meta">—</span>;
  }
  const w = 60, h = 22;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <polyline points={pts} stroke="var(--brand-500)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" fill="none" opacity={0.8} />
    </svg>
  );
}

type TabId = "stock" | "forecast" | "history" | "centers";

export default function Inventory() {
  const { tenantId, branchId } = useTenantContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [openOCR, setOpenOCR] = useState(false);
  const [openTransfer, setOpenTransfer] = useState(false);
  const [openEAN, setOpenEAN] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("stock");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const { centers, isLoading: loadingCenters, defaultCenter } = useInventoryCenters();
  const [selectedCenterId, setSelectedCenterId] = useState<string>("all");

  const activeCenterId = selectedCenterId === "all" ? undefined : selectedCenterId;

  const { data: stocks } = useQuery({
    queryKey: ["stocks", branchId, activeCenterId],
    enabled: !!branchId,
    queryFn: async () => {
      let query = supabase.from("inventory_stocks")
        .select("*, products(id, name, min_stock, unit_code, status, sku), inventory_centers(name)")
        .eq("branch_id", branchId!);
      if (activeCenterId) {
        query = (query as any).eq("inventory_center_id", activeCenterId);
      }
      return (await query.order("product_id")).data ?? [];
    },
  });

  const { data: catalogProducts } = useQuery({
    queryKey: ["inventory-catalog-products", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, min_stock, unit_code, status, sku, barcode")
        .eq("tenant_id", tenantId!)
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: movements } = useQuery({
    queryKey: ["movements", branchId, activeCenterId],
    enabled: !!branchId,
    queryFn: async () => {
      let query = supabase.from("inventory_movements")
        .select("*, products(name), inventory_centers(name)")
        .eq("branch_id", branchId!);
      if (activeCenterId) {
        query = (query as any).eq("inventory_center_id", activeCenterId);
      }
      return (await query.order("created_at", { ascending: false }).limit(100)).data ?? [];
    },
  });

  const activeStocks = (stocks ?? []).filter((s: any) => s.products?.status === "active");
  const filteredStocks = activeStocks
    .filter((s: any) => !search || s.products?.name.toLowerCase().includes(search.toLowerCase()))
    .filter((s: any) => {
      if (filterCategory === "all") return true;
      if (filterCategory === "low") return Number(s.quantity) > 0 && Number(s.quantity) <= Number(s.products?.min_stock ?? 0);
      if (filterCategory === "out") return Number(s.quantity) === 0;
      return true;
    });

  const lowStock = activeStocks.filter((s: any) => Number(s.quantity) <= Number(s.products?.min_stock ?? 0) && Number(s.quantity) > 0);
  const outOfStock = activeStocks.filter((s: any) => Number(s.quantity) === 0);
  const totalValue = activeStocks.reduce((acc: number, s: any) => acc + Number(s.quantity), 0);

  /* Build sparkline data per product from movements */
  const sparklineMap: Record<string, number[]> = {};
  (movements ?? []).forEach((m: any) => {
    if (!m.product_id) return;
    if (!sparklineMap[m.product_id]) sparklineMap[m.product_id] = [];
    if (sparklineMap[m.product_id].length < 8) {
      sparklineMap[m.product_id].push(Number(m.quantity));
    }
  });

  if (!tenantId || !branchId || !user) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="flex items-center gap-3">
          <RefreshCw size={16} className="animate-spin text-ink-400" />
          <span className="h-meta">Cargando inventario...</span>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "stock",    label: "Stock actual",  icon: <Warehouse size={14} /> },
    { id: "forecast", label: "Proyecciones",  icon: <TrendingUp size={14} /> },
    { id: "history",  label: "Kardex",        icon: <History size={14} /> },
    { id: "centers",  label: "Centros",       icon: <Settings2 size={14} /> },
  ];

  return (
    <div className="flex flex-col gap-5">

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="h-label mb-1 inv-eyebrow">
            Inventario · Stocks
          </div>
          <h1 className="h-display inv-page-title">Inventario</h1>
          <div className="h-meta mt-1">
            {activeStocks.length} productos activos
            {lowStock.length > 0 && <> · <span className="inv-warn-text">{lowStock.length} bajo mínimo</span></>}
            {outOfStock.length > 0 && <> · <span className="inv-bad-text">{outOfStock.length} sin stock</span></>}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* EAN */}
          <Dialog open={openEAN} onOpenChange={setOpenEAN}>
            <button type="button" className="g-btn g-btn-ghost" onClick={() => setOpenEAN(true)}>
              <Barcode size={15} /> Cargar por EAN
            </button>
            <EanImportDialog
              tenantId={tenantId!} branchId={branchId!} userId={user!.id}
              centers={centers}
              defaultCenterId={activeCenterId || defaultCenter?.id}
              existingProducts={catalogProducts ?? []}
              onClose={() => {
                setOpenEAN(false);
                qc.invalidateQueries({ queryKey: ["stocks"] });
                qc.invalidateQueries({ queryKey: ["movements"] });
                qc.invalidateQueries({ queryKey: ["products"] });
              }}
            />
          </Dialog>

          {/* OCR Invoice */}
          <Dialog open={openOCR} onOpenChange={setOpenOCR}>
            <button type="button" className="g-btn g-btn-ghost" onClick={() => setOpenOCR(true)}>
              <FileText size={15} /> Cargar Factura (AI)
            </button>
            <InvoiceOCRDialog
              tenantId={tenantId!} branchId={branchId!} userId={user!.id}
              centers={centers}
              defaultCenterId={activeCenterId || defaultCenter?.id}
              onClose={() => {
                setOpenOCR(false);
                qc.invalidateQueries({ queryKey: ["stocks"] });
                qc.invalidateQueries({ queryKey: ["movements"] });
              }}
            />
          </Dialog>

          {/* Transfer */}
          <Dialog open={openTransfer} onOpenChange={setOpenTransfer}>
            <button type="button" className="g-btn g-btn-ghost" onClick={() => setOpenTransfer(true)}>
              <ArrowRightLeft size={15} /> Transferir
            </button>
            <TransferDialog
              tenantId={tenantId!} branchId={branchId!} userId={user!.id}
              centers={centers}
              products={(stocks ?? []).map((s: any) => s.products).filter(Boolean)}
              onClose={() => {
                setOpenTransfer(false);
                qc.invalidateQueries({ queryKey: ["stocks"] });
                qc.invalidateQueries({ queryKey: ["movements"] });
              }}
            />
          </Dialog>

          {/* Provision */}
          <Dialog open={open} onOpenChange={setOpen}>
            <button type="button" className="g-btn g-btn-primary" onClick={() => setOpen(true)}>
              <PackagePlus size={15} /> Aprovisionar
            </button>
            <MovementDialog
              tenantId={tenantId!} branchId={branchId!} userId={user!.id}
              products={catalogProducts ?? []}
              centers={centers}
              defaultCenterId={activeCenterId || defaultCenter?.id}
              onClose={() => {
                setOpen(false);
                qc.invalidateQueries({ queryKey: ["stocks"] });
                qc.invalidateQueries({ queryKey: ["movements"] });
              }}
            />
          </Dialog>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid gap-3 inv-kpi-grid">
        {/* Total SKUs */}
        <div className="glass g-kpi">
          <div className="flex items-center justify-between">
            <span className="h-label">Total SKUs</span>
            <div className="orb g-orb-38 orb-sq"><Package size={16} /></div>
          </div>
          <div className="g-num-28">{activeStocks.length}</div>
          <span className="h-meta">productos activos</span>
        </div>

        {/* Bajo stock */}
        <div className="glass g-kpi">
          <div className="flex items-center justify-between">
            <span className="h-label">Bajo stock</span>
            <div className="orb g-orb-38 orb-sq inv-orb-warn">
              <AlertTriangle size={15} />
            </div>
          </div>
          <div className={"g-num-28 " + (lowStock.length > 0 ? "inv-warn-text" : "inv-ink-900")}>
            {lowStock.length}
          </div>
          <span className="h-meta">requieren reposición</span>
        </div>

        {/* Sin stock */}
        <div className="glass g-kpi">
          <div className="flex items-center justify-between">
            <span className="h-label">Sin stock</span>
            <div className="orb g-orb-38 orb-sq inv-orb-bad">
              <Package size={15} />
            </div>
          </div>
          <div className={"g-num-28 " + (outOfStock.length > 0 ? "inv-bad-text" : "inv-ink-900")}>
            {outOfStock.length}
          </div>
          <span className="h-meta">productos agotados</span>
        </div>

        {/* Valor inventario */}
        <div className="glass g-kpi">
          <div className="flex items-center justify-between">
            <span className="h-label">Unidades totales</span>
            <div className="orb g-orb-38 orb-sq"><TrendingUp size={15} /></div>
          </div>
          <div className="g-num-28">{totalValue.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</div>
          <span className="h-meta">en todos los centros</span>
        </div>

        {/* Transfer card — wide */}
        <div className="glass g-kpi inv-card-transfer">
          <div className="flex items-center justify-between">
            <span className="h-label">Transferencia rápida</span>
            <div className="orb g-orb-38 orb-sq"><ArrowRightLeft size={15} /></div>
          </div>
          <div className="g-num-20 text-ink-700">Mover stock entre centros</div>
          <div className="flex gap-2 mt-1">
            <button type="button" className="g-btn g-btn-primary inv-btn-sm" onClick={() => setOpenTransfer(true)}>
              <ArrowRightLeft size={13} /> Transferir ahora
            </button>
            <button type="button" className="g-btn g-btn-ghost inv-btn-sm" onClick={() => setActiveTab("centers")}>
              <Settings2 size={13} /> Ver centros
            </button>
          </div>
        </div>
      </div>

      {/* ── Alert banner ── */}
      {lowStock.length > 0 && (
        <div className="glass-thin flex items-center gap-3 px-4 py-3 inv-alert-banner">
          <AlertTriangle size={15} className="inv-warn-text flex-shrink-0" />
          <span className="h-label inv-warn-text">Stock bajo ({lowStock.length}):</span>
          <span className="h-meta truncate">
            {lowStock.slice(0, 8).map((s: any) => s.products?.name).join(", ")}
            {lowStock.length > 8 && " …"}
          </span>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="glass-thin flex gap-1 p-1 inv-tabs-wrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={"flex items-center gap-1.5 px-3 py-2 transition-all inv-tab-btn " + (activeTab === t.id ? "inv-tab-active" : "inv-tab-inactive")}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Center filter */}
        <div className="flex items-center gap-2">
          <span className="h-label hidden md:block">Centro:</span>
          <Select value={selectedCenterId} onValueChange={setSelectedCenterId}>
            <SelectTrigger className="h-8 text-xs bg-white/60 border-white/70 inv-select-trigger">
              <SelectValue placeholder="Todos los centros" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los centros</SelectItem>
              {centers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Tab content ── */}

      {/* STOCK TAB */}
      {activeTab === "stock" && (
        <div className="flex flex-col gap-3">
          {/* Search + filter pills */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="glass-thin flex items-center gap-2 px-3 inv-search-box">
              <Search size={14} className="inv-ink-400 flex-shrink-0" />
              <input
                className="bg-transparent border-none outline-none text-sm flex-1 inv-search-input"
                placeholder="Buscar producto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1.5">
              {[
                { id: "all",  label: "Todos", count: activeStocks.length },
                { id: "low",  label: "Bajo mínimo", count: lowStock.length },
                { id: "out",  label: "Sin stock", count: outOfStock.length },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterCategory(f.id)}
                  className={"flex items-center gap-1.5 px-3 transition-all inv-filter-pill " + (filterCategory === f.id ? "inv-filter-active" : "inv-filter-inactive")}
                >
                  {f.label}
                  {f.count > 0 && (
                    <span
                      className={"flex items-center justify-center inv-filter-count " + (
                        f.id === "low" ? "inv-count-low" :
                        f.id === "out" ? "inv-count-out" :
                        "inv-count-default"
                      )}
                    >
                      {f.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="glass overflow-hidden">
            {/* Table header */}
            <div className="grid items-center px-5 py-3 inv-table-grid inv-table-header">
              <span className="h-label">Producto</span>
              <span className="h-label">SKU</span>
              <span className="h-label">Stock actual</span>
              <span className="h-label">Ubicación</span>
              <span className="h-label">Movimiento</span>
              <span className="h-label">Unidad</span>
              <span className="h-label">Estado</span>
            </div>

            {/* Table rows */}
            {filteredStocks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="orb g-orb-52"><Package size={22} /></div>
                <span className="h-meta">Sin productos{search ? ` para "${search}"` : ""}</span>
              </div>
            ) : (
              filteredStocks.map((s: any) => {
                const qty = Number(s.quantity);
                const min = Number(s.products?.min_stock ?? 0);
                const isOut = qty === 0;
                const isLow = !isOut && qty <= min;

                return (
                  <div
                    key={s.id}
                    className="grid items-center gap-3 px-5 py-3.5 transition-colors inv-table-grid inv-table-row"
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(43,124,255,0.025)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* Product */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="orb g-orb-38 orb-sq flex-shrink-0"><Package size={16} /></div>
                      <div className="min-w-0">
                        <div className="font-bold text-ink-900 truncate inv-text-14">
                          {s.products?.name}
                        </div>
                        <div className="h-meta truncate">
                          {s.products?.sku ?? "Sin SKU"}
                        </div>
                      </div>
                    </div>

                    {/* SKU monospace */}
                    <div className="g-mono h-meta inv-text-12">
                      {s.products?.sku ?? "—"}
                    </div>

                    {/* Stock + bar */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className={"g-num-14 " + (isOut ? "inv-bad-text" : isLow ? "inv-warn-text" : "inv-ink-900")}>
                          {qty.toFixed(2)}
                        </span>
                        {min > 0 && (
                          <span className="h-meta">/ mín {min}</span>
                        )}
                      </div>
                      <StockBar qty={qty} minStock={min} />
                    </div>

                    {/* Location */}
                    <div>
                      <span className="g-pill g-pill-ghost inv-text-11">
                        <Warehouse size={10} />
                        {s.inventory_centers?.name || "Principal"}
                      </span>
                    </div>

                    {/* Sparkline */}
                    <div>
                      <Sparkline data={(sparklineMap[s.products?.id] ?? []).slice().reverse()} />
                    </div>

                    {/* Unit */}
                    <div className="h-meta">{s.products?.unit_code ?? "—"}</div>

                    {/* Status badge */}
                    <div>
                      {isOut ? (
                        <span className="g-pill g-pill-bad inv-text-10">Sin stock</span>
                      ) : isLow ? (
                        <span className="g-pill g-pill-warn inv-text-10">Bajo</span>
                      ) : (
                        <span className="g-pill g-pill-ok inv-text-10">OK</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Table footer */}
            {filteredStocks.length > 0 && (
              <div className="px-5 py-3 flex items-center justify-between inv-table-footer">
                <span className="h-meta">{filteredStocks.length} productos mostrados</span>
                <span className="h-meta">{filteredStocks.reduce((a: number, s: any) => a + Number(s.quantity), 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })} unidades en total</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FORECAST TAB */}
      {activeTab === "forecast" && (
        <ForecastTab branchId={branchId!} stocks={stocks ?? []} />
      )}

      {/* HISTORY TAB */}
      {activeTab === "history" && (
        <div className="glass overflow-hidden">
          {/* Header */}
          <div className="grid items-center px-5 py-3 inv-history-grid inv-table-header">
            <span className="h-label">Fecha</span>
            <span className="h-label">Producto</span>
            <span className="h-label">Centro</span>
            <span className="h-label">Tipo</span>
            <span className="h-label">Cantidad</span>
            <span className="h-label">Motivo</span>
            <span className="h-label">Origen</span>
          </div>

          {(!movements || movements.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="orb g-orb-52"><History size={22} /></div>
              <span className="h-meta">Sin movimientos registrados</span>
            </div>
          ) : (
            (movements ?? []).map((m: any) => (
              <div
                key={m.id}
                className="grid items-center gap-3 px-5 py-3 inv-history-grid inv-table-row"
              >
                <span className="h-meta g-mono inv-text-11">
                  {new Date(m.created_at).toLocaleString("es-CO")}
                </span>
                <span className="font-semibold text-ink-900 truncate inv-text-13">
                  {m.products?.name}
                </span>
                <span className="g-pill g-pill-ghost inv-text-10">
                  {m.inventory_centers?.name || "—"}
                </span>
                <span className="g-pill g-pill-brand inv-text-10 inv-capitalize">
                  {m.movement_type}
                </span>
                <span className="g-num-14">{Number(m.quantity).toFixed(2)}</span>
                <span className="h-meta truncate">{m.reason ?? "—"}</span>
                <span className="h-meta inv-text-11">{m.reference_type ?? "—"}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* CENTERS TAB */}
      {activeTab === "centers" && (
        <InventoryCenters />
      )}
    </div>
  );
}

/* ── Forecast tab ── */
function ForecastTab({ branchId, stocks }: { branchId: string; stocks: any[] }) {
  const { data: salesVelocity } = useQuery({
    queryKey: ["sales-velocity", branchId],
    enabled: !!branchId,
    staleTime: 300_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("inventory_movements")
        .select("product_id, quantity, created_at")
        .eq("branch_id", branchId)
        .eq("movement_type", "sale")
        .gte("created_at", since);
      if (!data) return {};
      const totals: Record<string, number> = {};
      for (const m of data) {
        totals[m.product_id] = (totals[m.product_id] ?? 0) + Number(m.quantity);
      }
      const result: Record<string, number> = {};
      for (const [pid, total] of Object.entries(totals)) {
        result[pid] = total / 30;
      }
      return result;
    },
  });

  const rows = stocks
    .filter((s: any) => s.products?.status === "active")
    .map((s: any) => {
      const avgDay = (salesVelocity ?? {})[s.products?.id] ?? 0;
      const daysLeft = avgDay > 0 ? Math.floor(Number(s.quantity) / avgDay) : null;
      return { ...s, avgDay, daysLeft };
    })
    .filter((r: any) => r.avgDay > 0)
    .sort((a: any, b: any) => {
      if (a.daysLeft === null) return 1;
      if (b.daysLeft === null) return -1;
      return a.daysLeft - b.daysLeft;
    });

  if (rows.length === 0) {
    return (
      <div className="glass flex flex-col items-center justify-center py-16 gap-3">
        <div className="orb g-orb-52"><TrendingUp size={22} /></div>
        <span className="h-meta">No hay datos de ventas de los últimos 30 días para proyectar.</span>
      </div>
    );
  }

  return (
    <div className="glass overflow-hidden">
      <div className="grid items-center px-5 py-3 inv-forecast-grid inv-table-header">
        <span className="h-label">Producto</span>
        <span className="h-label">Stock actual</span>
        <span className="h-label">Venta/día (30d)</span>
        <span className="h-label">Días restantes</span>
        <span className="h-label">Alerta</span>
      </div>

      {rows.map((r: any) => {
        const urgent = r.daysLeft !== null && r.daysLeft <= 7;
        const warning = r.daysLeft !== null && r.daysLeft > 7 && r.daysLeft <= 14;
        return (
          <div
            key={r.id}
            className="grid items-center gap-3 px-5 py-3.5 inv-forecast-grid inv-table-row"
          >
            <div className="flex items-center gap-3">
              <div className="orb g-orb-36 orb-sq"><Package size={14} /></div>
              <span className="font-semibold text-ink-900 inv-text-14">{r.products?.name}</span>
            </div>
            <span className="g-num-14">{Number(r.quantity).toFixed(2)}</span>
            <span className="g-num-14">{r.avgDay.toFixed(2)}</span>
            <span className={"g-num-14 " + (urgent ? "inv-bad-text" : warning ? "inv-warn-text" : "inv-ok-text")}>
              {r.daysLeft !== null ? r.daysLeft : "∞"}
            </span>
            <span>
              {urgent ? (
                <span className="g-pill g-pill-bad inv-text-10">Urgente ≤7d</span>
              ) : warning ? (
                <span className="g-pill g-pill-warn inv-text-10">≤14 días</span>
              ) : (
                <span className="g-pill g-pill-ok inv-text-10">OK</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Movement dialog ── */
function MovementDialog({ tenantId, branchId, userId, products, centers, defaultCenterId, onClose }: any) {
  const [productSearch, setProductSearch] = useState("");
  const [productId, setProductId] = useState<string>("");
  const [centerId, setCenterId] = useState<string>(defaultCenterId || "");
  const [type, setType] = useState<typeof MOVE_TYPES[number]>("purchase");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  if (!centerId && defaultCenterId) setCenterId(defaultCenterId);

  const filteredProducts = (products as any[]).filter((p) =>
    !productSearch ||
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.sku ?? "").toLowerCase().includes(productSearch.toLowerCase())
  );

  const selectedProduct = (products as any[]).find((p) => p.id === productId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) return toast.error("Selecciona un producto");
    if (!centerId) return toast.error("Selecciona el centro de inventario");
    if (!qty || Number(qty) <= 0) return toast.error("Cantidad inválida");
    setSaving(true);
    try {
      await applyInventoryMovement({
        tenantId, branchId, userId, productId,
        inventoryCenterId: centerId,
        type, quantity: Number(qty),
        reason: reason.trim() || `Entrada manual — ${MOVE_TYPE_LABELS[type]}`,
        referenceType: "manual",
      });
      toast.success("Movimiento registrado correctamente");
      onClose();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <PackagePlus className="h-5 w-5" /> Aprovisionar inventario
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">

        {/* Tipo de movimiento */}
        <div className="space-y-1.5">
          <Label>Tipo de movimiento</Label>
          <div className="grid grid-cols-2 gap-2">
            {MOVE_TYPES.map((t) => (
              <button
                key={t} type="button"
                onClick={() => setType(t)}
                className={`px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                  type === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {MOVE_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Producto con búsqueda */}
        <div className="space-y-1.5">
          <Label>Producto</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nombre o SKU..."
              value={productSearch}
              onChange={(e) => { setProductSearch(e.target.value); setProductId(""); }}
            />
          </div>
          {selectedProduct ? (
            <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted text-sm">
              <span className="font-medium">{selectedProduct.name}</span>
              <button type="button" className="text-muted-foreground hover:text-foreground text-xs" onClick={() => { setProductId(""); setProductSearch(""); }}>
                Cambiar
              </button>
            </div>
          ) : productSearch.length > 0 && (
            <div className="border rounded-md max-h-48 overflow-y-auto">
              {filteredProducts.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground text-center">Sin resultados</p>
              ) : filteredProducts.slice(0, 20).map((p: any) => (
                <button
                  key={p.id} type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-0"
                  onClick={() => { setProductId(p.id); setProductSearch(p.name); }}
                >
                  <span className="font-medium">{p.name}</span>
                  {p.sku && <span className="ml-2 text-muted-foreground text-xs">SKU: {p.sku}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Centro */}
        <div className="space-y-1.5">
          <Label>Centro de inventario</Label>
          <Select value={centerId} onValueChange={setCenterId}>
            <SelectTrigger><SelectValue placeholder="Selecciona el centro..." /></SelectTrigger>
            <SelectContent>
              {(centers as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Cantidad */}
        <div className="space-y-1.5">
          <Label>Cantidad {selectedProduct?.unit_code ? `(${selectedProduct.unit_code})` : ""}</Label>
          <Input
            type="number" step="0.001" min="0.001" required
            value={qty} onChange={(e) => setQty(e.target.value)}
            className="h-12 text-lg font-semibold"
            placeholder="0"
          />
        </div>

        {/* Motivo */}
        <div className="space-y-1.5">
          <Label>Motivo <span className="text-muted-foreground font-normal">(opcional)</span></Label>
          <Textarea
            value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: Compra a proveedor, conteo físico, etc."
            rows={2}
          />
        </div>

        <button
          type="submit"
          className="g-btn g-btn-primary w-full"
          disabled={saving || !productId || !qty || !centerId}
        >
          {saving ? "Registrando…" : "Registrar movimiento"}
        </button>
      </form>
    </DialogContent>
  );
}
