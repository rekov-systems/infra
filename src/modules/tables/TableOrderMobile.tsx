import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/format";
import {
  ArrowLeft, Search, Plus, Minus, Trash2, Send, CreditCard,
  RotateCcw, ShoppingBag, Grid3x3, ChefHat, Bell, FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ITEM_STATUS_META, deriveOrderState, ORDER_STATE_META, countByStatus, type TableItemStatus } from "./itemStatus";

type Tab = "products" | "order";

interface Props {
  order: any;
  items: any[];
  filtered: any[];
  search: string;
  setSearch: (s: string) => void;
  selectedCategory: string;
  setSelectedCategory: (c: string) => void;
  categories: any[];
  isOpen: boolean;
  sent: boolean;
  devMode?: boolean;
  onBack: () => void;
  onAdd: (p: any) => void;
  onSetQty: (item: any, qty: number) => void;
  onSetItemStatus: (item: any, target: TableItemStatus) => void;
  onUndispatch: (item: any) => void;
  onSendToKitchen: () => void;
  onMarkAllReady: () => void;
  onSendToCashier: () => void;
  onCancel: () => void;
  onPay: () => void;
}

export function TableOrderMobile(props: Props) {
  const {
    order, items, filtered, search, setSearch, selectedCategory, setSelectedCategory, categories, isOpen, sent, devMode = false,
    onBack, onAdd, onSetQty, onSetItemStatus, onUndispatch,
    onSendToKitchen, onMarkAllReady, onSendToCashier, onCancel, onPay,
  } = props;
  const [tab, setTab] = useState<Tab>(isOpen ? "products" : "order");

  const itemCount = useMemo(
    () => items.filter((i: any) => i.status !== "cancelled").length,
    [items]
  );
  const pendingCount = useMemo(
    () => items.filter((i: any) => i.status === "pending").length,
    [items]
  );

  const handleAdd = (p: any) => {
    onAdd(p);
    // si ya hay 3+ items, sugerimos saltar al pedido
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-2 px-3 py-2 border-b bg-card shadow-sm">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-10 w-10 -ml-1">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-base leading-tight truncate">
            {order?.tables?.name ?? "Mesa"}
          </div>
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {itemCount} items · {formatCurrency(Number(order?.total ?? 0))}
          </div>
        </div>
        {(() => { const s = deriveOrderState(order?.status, items); const m = ORDER_STATE_META[s]; return <Badge className={cn("text-[10px]", m.tone)}>{m.label}</Badge>; })()}
      </header>

      {devMode && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-[11px] font-semibold">
          <FlaskConical className="h-3 w-3 shrink-0" />
          MODO DEV · Sin validación de stock ni caja
        </div>
      )}

      {/* Tabs */}
      <div className="grid grid-cols-2 border-b bg-card">
        <button
          onClick={() => setTab("products")}
          disabled={!isOpen}
          className={cn(
            "py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors",
            tab === "products"
              ? "text-primary border-b-2 border-primary -mb-px"
              : "text-muted-foreground",
            !isOpen && "opacity-40"
          )}
        >
          <Grid3x3 className="h-4 w-4" /> Productos
        </button>
        <button
          onClick={() => setTab("order")}
          className={cn(
            "py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors relative",
            tab === "order"
              ? "text-primary border-b-2 border-primary -mb-px"
              : "text-muted-foreground"
          )}
        >
          <ShoppingBag className="h-4 w-4" /> Pedido
          {itemCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
              {itemCount}
            </span>
          )}
        </button>
      </div>

      {/* PRODUCTS TAB */}
      {tab === "products" && isOpen && (
        <>
          <div className="px-3 py-2 border-b bg-card sticky top-0 z-10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar producto..."
                className="pl-9 h-11"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                inputMode="search"
              />
            </div>
            
            {/* Categorías */}
            <ScrollArea className="w-full whitespace-nowrap mt-2">
              <div className="flex w-max space-x-2 pb-2">
                <Button
                  variant={selectedCategory === "all" ? "default" : "outline"}
                  size="sm"
                  className="rounded-full px-4 h-8"
                  onClick={() => setSelectedCategory("all")}
                >
                  Todos
                </Button>
                {(categories ?? []).map((cat: any) => (
                  <Button
                    key={cat.id}
                    variant={selectedCategory === cat.id ? "default" : "outline"}
                    size="sm"
                    className="rounded-full px-4 h-8"
                    onClick={() => setSelectedCategory(cat.id)}
                  >
                    {cat.name}
                  </Button>
                ))}
              </div>
              <ScrollBar orientation="horizontal" className="hidden" />
            </ScrollArea>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 grid grid-cols-2 gap-3 pb-24">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleAdd(p)}
                  className="bg-card rounded-xl border p-3 text-left shadow-[var(--shadow-card)] active:scale-95 transition-all min-h-[110px] flex flex-col justify-between"
                >
                  <div className="font-medium text-sm line-clamp-2 leading-tight">{p.name}</div>
                  <div className="font-bold text-primary tabular-nums mt-2 text-base">
                    {formatCurrency(Number(p.price))}
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-full text-center py-12 text-muted-foreground text-sm">
                  Sin productos
                </div>
              )}
            </div>
          </ScrollArea>
          {/* Botón flotante Ver pedido */}
          {itemCount > 0 && (
            <div className="absolute bottom-3 left-3 right-3 z-20">
              <Button
                size="lg"
                className="w-full h-12 shadow-[var(--shadow-elevated)]"
                onClick={() => setTab("order")}
              >
                <ShoppingBag className="h-5 w-5 mr-2" />
                Ver pedido ({itemCount}) · {formatCurrency(Number(order?.total ?? 0))}
              </Button>
            </div>
          )}
        </>
      )}

      {tab === "products" && !isOpen && (
        <div className="flex-1 grid place-items-center text-muted-foreground p-8 text-center text-sm">
          Pedido enviado a caja. Pendiente de cobro.
        </div>
      )}

      {/* ORDER TAB */}
      {tab === "order" && (
        <>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2 pb-2">
              {items.length === 0 && (
                <div className="text-center text-muted-foreground py-16 text-sm">
                  Sin productos. Agrega desde la pestaña Productos.
                </div>
              )}
              {items.map((it: any) => {
                const status = it.status as TableItemStatus;
                const cancelled = status === "cancelled";
                const dispatched = status === "dispatched";
                const meta = ITEM_STATUS_META[status];
                const steps: TableItemStatus[] = ["pending", "preparing", "ready", "dispatched"];
                const idx = steps.indexOf(status);
                return (
                  <div
                    key={it.id}
                    className={cn(
                      "border rounded-xl p-3 space-y-3 bg-card",
                      cancelled && "opacity-50",
                      status === "preparing" && "bg-amber-500/5 border-amber-500/30",
                      status === "ready" && "bg-sky-500/5 border-sky-500/30",
                      dispatched && "bg-success/5 border-success/30"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm leading-tight">{it.product_name}</div>
                        <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
                          {formatCurrency(Number(it.unit_price))} × {Number(it.quantity)}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase", meta.tone)}>{meta.short}</span>
                        <div className="font-bold tabular-nums text-base mt-0.5">
                          {formatCurrency(Number(it.line_total))}
                        </div>
                      </div>
                    </div>

                    {!cancelled && (isOpen || sent) && (
                      <div className="flex gap-1">
                        {steps.map((s, i) => {
                          const sm = ITEM_STATUS_META[s];
                          const active = i === idx;
                          const done = i < idx;
                          const reachable = i === idx + 1 && isOpen;
                          return (
                            <button
                              key={s}
                              type="button"
                              disabled={!reachable && !active}
                              onClick={() => reachable && onSetItemStatus(it, s)}
                              className={cn(
                                "flex-1 h-9 rounded text-[10px] font-bold uppercase tracking-wider border transition-all",
                                active
                                  ? `${sm.tone} border-transparent`
                                  : done
                                    ? "bg-muted/40 text-muted-foreground border-transparent line-through"
                                    : reachable
                                      ? "border-dashed border-primary/40 text-primary"
                                      : "border-dashed border-muted text-muted-foreground/40"
                              )}
                            >
                              {sm.short}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {!cancelled && (
                      <div className="flex items-center gap-2">
                        {isOpen && !dispatched && (
                          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                            <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => onSetQty(it, Number(it.quantity) - 1)}>
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-bold tabular-nums">{Number(it.quantity)}</span>
                            <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => onSetQty(it, Number(it.quantity) + 1)}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        <div className="flex-1" />
                        {isOpen && !dispatched && (
                          <Button size="sm" variant="outline" className="h-9 text-destructive border-destructive/30" onClick={() => onSetQty(it, 0)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        {dispatched && isOpen && (
                          <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => onUndispatch(it)}>
                            <RotateCcw className="h-4 w-4 mr-1" /> Revertir
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Footer fijo */}
          <div className="border-t p-3 space-y-2 bg-card">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatCurrency(Number(order.subtotal))}</span>
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Impuestos</span>
              <span className="tabular-nums">{formatCurrency(Number(order.tax_total))}</span>
            </div>
            <div className="flex items-baseline justify-between border-t pt-2">
              <span className="font-bold">Total</span>
              <span className="text-2xl font-black text-primary tabular-nums">
                {formatCurrency(Number(order.total))}
              </span>
            </div>
            {isOpen && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-11" onClick={onCancel}>
                  <Trash2 className="h-4 w-4 mr-1" /> Cancelar
                </Button>
                <Button
                  className="h-11"
                  onClick={onSendToCashier}
                  disabled={pendingCount === 0 && itemCount === 0}
                >
                  <Send className="h-4 w-4 mr-1" /> Enviar a caja
                </Button>
              </div>
            )}
            {(isOpen || sent) && (
              <Button
                size="lg"
                className="w-full h-13 min-h-[52px]"
                onClick={onPay}
                disabled={Number(order.total) <= 0}
              >
                <CreditCard className="h-5 w-5 mr-2" />
                Cobrar {formatCurrency(Number(order.total))}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
