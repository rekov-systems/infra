import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useAuth } from "@/hooks/useAuth";
import { useDevMode } from "@/hooks/useDevMode";
import { formatCurrency } from "@/lib/format";
import {
  Users, Clock, Edit2, Check, FlaskConical,
  LayoutGrid, Monitor, Smartphone, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { deriveOrderState, ORDER_STATE_META, countByStatus } from "./itemStatus";
import { Table } from "@/types/table";
import "./tables.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type TableOrderItem = {
  id: string;
  status: string;
};

type TableOrder = {
  id: string;
  table_id: string;
  waiter_id: string | null;
  status: string;
  total: number;
  table_order_items: TableOrderItem[];
};

// ─── Palette helpers ──────────────────────────────────────────────────────────

function getTileThemeClass(
  state: ReturnType<typeof deriveOrderState> | null,
): string {
  if (!state) {
    return "tbl-theme-null";
  }
  switch (state) {
    case "in_cashier":
      return "tbl-theme-in-cashier";
    case "ready":
    case "served":
      return "tbl-theme-ready";
    case "closed":
      return "tbl-theme-closed";
    // "open" | "empty" | "preparing"
    default:
      return "tbl-theme-default";
  }
}

// ─── Legend stat chip ─────────────────────────────────────────────────────────

function StatChip({
  label,
  count,
  dotColor,
}: {
  label: string;
  count: number;
  dotColor: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`g-dot tbl-stat-chip-dot ${dotColor}`} />
      <span className="g-val-12 tbl-stat-chip-label">
        {label}
      </span>
      <span className="g-num-14">{count}</span>
    </div>
  );
}

// ─── Table tile ───────────────────────────────────────────────────────────────

function TableTile({
  table,
  order,
  selected,
  editMode,
  onClick,
  onDragStart,
}: {
  table: Table;
  order: TableOrder | undefined;
  selected: boolean;
  editMode: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  const items = (order?.table_order_items ?? []) as Array<{ status: string }>;
  const state = order ? deriveOrderState(order.status, items) : null;
  const themeClass = getTileThemeClass(state);
  const meta = state ? ORDER_STATE_META[state] : null;

  return (
    <div
      draggable={editMode}
      onDragStart={onDragStart}
      onClick={onClick}
      className={`tbl-tile tbl-bg-theme ${themeClass} ${editMode ? "cursor-grab" : "cursor-pointer"} ` + (selected ? "tbl-tile-selected" : "tbl-tile-unselected")}
    >
      {/* Table name */}
      <div className="g-title-14 tbl-tile-title tbl-text-theme">
        {table.name}
      </div>

      {/* Capacity */}
      <div className="flex items-center gap-1 tbl-tile-cap">
        <Users size={9} />
        <span>{table.capacity}</span>
      </div>

      {/* State badge */}
      {meta && (
        <div className="tbl-tile-badge tbl-text-theme">
          {meta.label}
        </div>
      )}
    </div>
  );
}

// ─── Right panel — selected table details ─────────────────────────────────────

function TablePanel({
  table,
  order,
  waiterName,
  onOpen,
  onClose,
}: {
  table: Table;
  order: TableOrder | undefined;
  waiterName: string | undefined;
  onOpen: () => void;
  onClose: () => void;
}) {
  const items = (order?.table_order_items ?? []) as Array<{ status: string }>;
  const state = order ? deriveOrderState(order.status, items) : null;
  const themeClass = getTileThemeClass(state);
  const counts = countByStatus(items);
  const total = Number(order?.total ?? 0);

  return (
    <div className={`glass-strong rounded-3xl flex flex-col gap-3 tbl-panel-container ${themeClass}`}>
      {/* Panel header */}
      <div className="flex items-start gap-3">
        <div className="orb orb-sq g-orb-44 flex-shrink-0 tbl-orb-theme">
          <LayoutGrid size={20} color="var(--ink-700)" className="tbl-panel-orb-icon" />
        </div>
        <div className="tbl-panel-header-text">
          <div className="g-title-18 tbl-panel-title">
            {table.name}
          </div>
          <div className="flex items-center gap-1.5 tbl-panel-cap">
            <Users size={11} color="var(--ink-400)" />
            <span className="h-meta">{table.capacity} pax</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="g-btn g-btn-ghost tbl-panel-close-btn"
        >
          ✕
        </button>
      </div>

      <div className="g-hairline" />

      {!order ? (
        /* Free table */
        <div className="flex flex-col gap-3 flex-1">
          <div className="tbl-panel-empty-state">
            <div className="g-dot-brand g-dot tbl-panel-empty-dot" />
            <div className="h-label tbl-panel-empty-title">
              Mesa libre
            </div>
            <div className="h-meta tbl-panel-empty-meta">
              Sin pedido activo
            </div>
          </div>

          <button
            type="button"
            onClick={onOpen}
            className="g-btn g-btn-primary g-btn-touch tbl-panel-cta-btn"
          >
            Abrir mesa
            <ChevronRight size={16} />
          </button>
        </div>
      ) : (
        /* Occupied table */
        <div className="flex flex-col gap-3 flex-1">
          {/* Waiter + state */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <div className="h-label">Mesero</div>
              <div className="g-num-14 tbl-panel-waiter-name">
                {waiterName ?? "—"}
              </div>
            </div>
            {state && (
              <div className="g-pill g-pill-h22 tbl-panel-state-pill tbl-pill-theme">
                {ORDER_STATE_META[state].label}
              </div>
            )}
          </div>

          {/* Item status counts */}
          <div className="glass-thin rounded-xl flex items-center gap-3 tbl-panel-chips-wrap">
            {counts.pending > 0 && (
              <StatChip
                label="Pend."
                count={counts.pending}
                dotColor="tbl-dot-ink-300"
              />
            )}
            {counts.preparing > 0 && (
              <StatChip
                label="Prep."
                count={counts.preparing}
                dotColor="tbl-dot-warn"
              />
            )}
            {counts.ready > 0 && (
              <StatChip
                label="Listo"
                count={counts.ready}
                dotColor="tbl-dot-ok"
              />
            )}
            {counts.dispatched > 0 && (
              <StatChip
                label="Servido"
                count={counts.dispatched}
                dotColor="tbl-dot-ink-300"
              />
            )}
            {counts.pending === 0 &&
              counts.preparing === 0 &&
              counts.ready === 0 &&
              counts.dispatched === 0 && (
                <span className="h-meta">Sin ítems activos</span>
              )}
          </div>

          {/* Total */}
          <div className="flex items-center justify-between">
            <div className="h-label">Total</div>
            <div className="g-num-22 tbl-panel-total-val">
              {formatCurrency(total)}
            </div>
          </div>

          <div className="g-hairline" />

          {/* CTA */}
          <button
            type="button"
            onClick={onOpen}
            className="g-btn g-btn-primary g-btn-touch tbl-panel-cta-btn"
          >
            Ver comanda
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── View-mode toggle pill ────────────────────────────────────────────────────

function ViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: string;
  onChange: (m: string) => void;
}) {
  const opts = [
    { value: "cards", icon: <LayoutGrid size={14} />, title: "Tarjetas" },
    { value: "board_16_9", icon: <Monitor size={14} />, title: "Tablero 16:9" },
    { value: "board_9_16", icon: <Smartphone size={14} />, title: "Tablero 9:16" },
  ];

  return (
    <div className="glass-thin flex items-center gap-1 tbl-toggle-wrap">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={"tbl-toggle-btn " + (viewMode === o.value ? "tbl-toggle-btn-active" : "tbl-toggle-btn-inactive")}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Tables() {
  const { tenantId, branchId, branches, hasRole } = useTenantContext();
  const { user } = useAuth();
  const { devMode } = useDevMode();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [localViewMode, setLocalViewMode] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const branch = branches.find((b) => b.id === branchId);
  const branchName = branch?.name ?? "—";
  const viewMode = localViewMode || branch?.table_view_mode || "cards";
  const isAdmin = hasRole("owner", "admin", "manager");
  const isBoard = viewMode.startsWith("board");

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: tables } = useQuery({
    queryKey: ["tables", tenantId, branchId],
    enabled: !!tenantId && !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tables")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("branch_id", branchId!)
        .neq("status", "inactive");
      if (error) throw error;
      const num = (s: string) =>
        parseInt(s.replace(/\D+/g, "") || "0", 10);
      return ((data ?? []) as Table[]).sort(
        (a, b) =>
          num(a.name) - num(b.name) || a.name.localeCompare(b.name),
      );
    },
  });

  const { data: openOrders } = useQuery({
    queryKey: ["table-orders-open", tenantId, branchId],
    enabled: !!tenantId && !!branchId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("table_orders")
        .select("*, table_order_items(id, status)")
        .eq("tenant_id", tenantId!)
        .eq("branch_id", branchId!)
        .in("status", ["open", "sent_to_cashier"]);
      if (error) throw error;
      return data as unknown as TableOrder[];
    },
  });

  const waiterIds = Array.from(
    new Set(
      (openOrders ?? []).map((o) => o.waiter_id).filter(Boolean),
    ),
  ) as string[];

  const { data: waiters } = useQuery({
    queryKey: ["table-waiters", waiterIds.join(",")],
    enabled: waiterIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", waiterIds);
      const m: Record<string, string> = {};
      (data ?? []).forEach((p) => {
        m[p.id] = p.full_name ?? "—";
      });
      return m;
    },
  });

  const orderByTable = useMemo(() => {
    const m: Record<string, TableOrder> = {};
    (openOrders ?? []).forEach((o) => {
      m[o.table_id] = o;
    });
    return m;
  }, [openOrders]);

  // ── Realtime ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!branchId) return;
    const ch = supabase
      .channel(`tables-orders-rt-${branchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "table_orders",
          filter: `branch_id=eq.${branchId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["table-orders-open"] });
          qc.invalidateQueries({ queryKey: ["tables"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [branchId, qc]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  const openTable = async (tableId: string) => {
    if (editMode) return;
    const existing = orderByTable[tableId];
    if (existing) {
      navigate(`/tables/${existing.id}`);
      return;
    }
    const { data, error } = await supabase
      .from("table_orders")
      .insert({
        tenant_id: tenantId,
        branch_id: branchId,
        table_id: tableId,
        waiter_id: user!.id,
        status: "open",
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["table-orders-open"] });
    qc.invalidateQueries({ queryKey: ["tables"] });
    navigate(`/tables/${data.id}`);
  };

  const handleModeChange = async (mode: string) => {
    if (!mode) return;
    setLocalViewMode(mode);
    if (!isAdmin) return;
    try {
      await supabase
        .from("branches")
        .update({ table_view_mode: mode })
        .eq("id", branchId);
      qc.invalidateQueries({ queryKey: ["branches"] });
      qc.invalidateQueries({ queryKey: ["branches-admin"] });
    } catch (err) {
      console.error(err);
      toast.error("Error al guardar preferencia de vista");
      setLocalViewMode(branch?.table_view_mode || "cards");
    }
  };

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    tableId: string,
  ) => {
    if (!editMode) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("tableId", tableId);
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    e.dataTransfer.setData("offsetX", String(e.clientX - rect.left));
    e.dataTransfer.setData("offsetY", String(e.clientY - rect.top));
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!editMode) return;
    const tableId = e.dataTransfer.getData("tableId");
    if (!tableId) return;
    const offsetX = parseFloat(e.dataTransfer.getData("offsetX") || "0");
    const offsetY = parseFloat(e.dataTransfer.getData("offsetY") || "0");
    const rect = e.currentTarget.getBoundingClientRect();
    let xPos = ((e.clientX - rect.left - offsetX) / rect.width) * 100;
    let yPos = ((e.clientY - rect.top - offsetY) / rect.height) * 100;
    xPos = Math.max(0, Math.min(xPos, 90));
    yPos = Math.max(0, Math.min(yPos, 90));

    qc.setQueryData(
      ["tables", tenantId, branchId],
      (old: Table[] | undefined) =>
        old?.map((t) =>
          t.id === tableId ? { ...t, x_pos: xPos, y_pos: yPos } : t,
        ),
    );

    const { error } = await supabase
      .from("tables")
      .update({ x_pos: xPos, y_pos: yPos })
      .eq("id", tableId);
    if (error) toast.error("Error al guardar posición");
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // ── Derived counts for legend ─────────────────────────────────────────────────

  const statCounts = useMemo(() => {
    let free = 0,
      occupied = 0,
      ready = 0,
      inCashier = 0;
    const serving = 0;
    (tables ?? []).forEach((t) => {
      const order = orderByTable[t.id];
      if (!order) {
        free++;
        return;
      }
      const items = (order.table_order_items ?? []) as Array<{
        status: string;
      }>;
      const state = deriveOrderState(order.status, items);
      if (state === "in_cashier") inCashier++;
      else if (state === "ready" || state === "served") ready++;
      else occupied++;
    });
    return { free, occupied, ready, inCashier, serving };
  }, [tables, orderByTable]);

  // ── Guard ─────────────────────────────────────────────────────────────────────

  if (!tenantId || !branchId || !user) {
    return (
      <div className="flex items-center justify-center p-8 tbl-page-loading">
        Cargando…
      </div>
    );
  }

  const selectedTable = selectedId
    ? (tables ?? []).find((t) => t.id === selectedId)
    : null;
  const selectedOrder = selectedId ? orderByTable[selectedId] : undefined;
  const selectedWaiter = selectedOrder?.waiter_id
    ? waiters?.[selectedOrder.waiter_id]
    : undefined;

  // ── Empty state ───────────────────────────────────────────────────────────────

  if ((tables ?? []).length === 0) {
    return (
      <div className="flex flex-col gap-4 tbl-page-col">
        <div className="flex items-center gap-3">
          <div>
            <div className="h-display tbl-page-title">
              Mesas
            </div>
            <div className="h-meta tbl-page-meta">
              {branchName}
            </div>
          </div>
        </div>
        <div className="glass flex flex-col items-center justify-center gap-4 rounded-3xl tbl-empty-card">
          <div className="h-label">No hay mesas configuradas en esta sucursal.</div>
          <button
            type="button"
            className="g-btn g-btn-ghost"
            onClick={() => navigate("/settings")}
          >
            Ir a Configuración
          </button>
        </div>
      </div>
    );
  }

  // ── Board view (drag-and-drop free layout) ────────────────────────────────────

  if (isBoard) {
    return (
      <div className="flex flex-col gap-4 tbl-page-col">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div>
            <div className="h-display tbl-page-title">
              Mesas
            </div>
            <div className="h-meta tbl-page-meta">
              {branchName} · {tables?.length ?? 0} mesas
            </div>
          </div>
          <div className="tbl-flex-1" />
          {isAdmin && (
            <div className="flex items-center gap-2">
              <ViewToggle viewMode={viewMode} onChange={handleModeChange} />
              <button
                type="button"
                className={`g-btn ${editMode ? "g-btn-primary" : "g-btn-ghost"}`}
                onClick={() => setEditMode(!editMode)}
              >
                {editMode ? (
                  <>
                    <Check size={14} /> Listo
                  </>
                ) : (
                  <>
                    <Edit2 size={14} /> Editar plano
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {devMode && (
          <div className="g-dev-banner">
            <FlaskConical size={14} />
            Modo Desarrollo activo · Las ventas de mesa no validan stock ni
            requieren caja abierta
          </div>
        )}

        <div
          className={"glass tbl-board-wrap " + (editMode ? "tbl-board-drag " : "") + (viewMode === "board_16_9" ? "tbl-aspect-16-9" : "tbl-aspect-9-16")}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {(tables ?? []).map((t) => {
            const order = orderByTable[t.id];
            const items = (order?.table_order_items ?? []) as Array<{
              status: string;
            }>;
            const state = order ? deriveOrderState(order.status, items) : null;
            const themeClass = getTileThemeClass(state);
            const meta = state ? ORDER_STATE_META[state] : null;
            const left = t.x_pos != null ? `${t.x_pos}%` : "0%";
            const top = t.y_pos != null ? `${t.y_pos}%` : "0%";

            return (
              <div
                key={t.id}
                draggable={editMode}
                onDragStart={(e) => handleDragStart(e, t.id)}
                className={`glass tbl-tile tbl-bg-theme ${themeClass} ${editMode ? "cursor-grab" : "cursor-pointer"}`}
                onClick={() => openTable(t.id)}
                {...{
                  style: {
                    position: "absolute",
                    left,
                    top,
                    width: 100,
                    height: 100,
                  }
                }}
              >
                <div className="g-title-14 tbl-tile-title tbl-text-theme">
                  {t.name}
                </div>
                <div className="flex items-center gap-1 tbl-tile-cap">
                  <Users size={9} />
                  <span>{t.capacity}</span>
                </div>
                {meta && (
                  <div className="tbl-tile-badge tbl-text-theme">
                    {meta.label}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Cards view (grid) ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 tbl-page-col">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div>
          <div className="h-display tbl-page-title">
            Mesas
          </div>
          <div className="h-meta tbl-page-meta">
            {branchName} · {tables?.length ?? 0} mesas
          </div>
        </div>
        <div className="tbl-flex-1" />
        {isAdmin && (
          <ViewToggle viewMode={viewMode} onChange={handleModeChange} />
        )}
      </div>

      {/* ── Dev mode banner ── */}
      {devMode && (
        <div className="g-dev-banner">
          <FlaskConical size={14} />
          Modo Desarrollo activo · Las ventas de mesa no validan stock ni
          requieren caja abierta
        </div>
      )}

      {/* ── Legend bar ── */}
      <div className="glass flex items-center gap-5 rounded-2xl tbl-grid-wrap">
        <StatChip
          label="Ocupadas"
          count={statCounts.occupied}
          dotColor="tbl-dot-brand"
        />
        <StatChip
          label="Listas"
          count={statCounts.ready}
          dotColor="tbl-dot-ok"
        />
        <StatChip
          label="En caja"
          count={statCounts.inCashier}
          dotColor="tbl-dot-warn"
        />
        <StatChip
          label="Libres"
          count={statCounts.free}
          dotColor="tbl-dot-ink-200"
        />
        <div className="tbl-flex-1" />
        <div className="flex items-center gap-1.5 h-meta tbl-page-meta">
          <Clock size={12} />
          <span>Actualización automática cada 15 s</span>
        </div>
      </div>

      {/* ── Main area: grid + panel ── */}
      <div className="flex gap-4 tbl-main-col">
        {/* Floor plan grid */}
        <div className="glass rounded-2xl tbl-main-scroll">
          <div className="tbl-grid-container-sm">
            {(tables ?? []).map((t) => (
              <TableTile
                key={t.id}
                table={t}
                order={orderByTable[t.id]}
                selected={selectedId === t.id}
                editMode={false}
                onClick={() => {
                  if (selectedId === t.id) {
                    setSelectedId(null);
                  } else {
                    setSelectedId(t.id);
                  }
                }}
                onDragStart={(e) => handleDragStart(e, t.id)}
              />
            ))}
          </div>
        </div>

        {/* Selected table panel */}
        {selectedTable && (
          <TablePanel
            table={selectedTable}
            order={selectedOrder}
            waiterName={selectedWaiter}
            onOpen={() => openTable(selectedTable.id)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
