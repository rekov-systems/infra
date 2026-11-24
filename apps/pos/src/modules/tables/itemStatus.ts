// Estados del ciclo de un item de pedido en mesa
export type TableItemStatus = "pending" | "preparing" | "ready" | "dispatched" | "cancelled";

export const ITEM_STATUS_META: Record<
  TableItemStatus,
  { label: string; short: string; tone: string; dot: string }
> = {
  pending:    { label: "Pendiente",      short: "Pend.",  tone: "bg-muted text-muted-foreground",                                 dot: "bg-muted-foreground" },
  preparing:  { label: "En preparación", short: "Prep.",  tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300",             dot: "bg-amber-500" },
  ready:      { label: "Listo",          short: "Listo",  tone: "bg-sky-500/15 text-sky-700 dark:text-sky-300",                   dot: "bg-sky-500" },
  dispatched: { label: "Servido",        short: "Servido",tone: "bg-success/15 text-success",                                     dot: "bg-success" },
  cancelled:  { label: "Cancelado",      short: "Canc.",  tone: "bg-destructive/10 text-destructive",                             dot: "bg-destructive" },
};

export type DerivedOrderState =
  | "empty"
  | "open"
  | "preparing"
  | "ready"
  | "served"
  | "in_cashier"
  | "closed";

export function deriveOrderState(
  orderStatus: string | null | undefined,
  items: Array<{ status: string }>,
): DerivedOrderState {
  if (orderStatus === "closed") return "closed";
  if (orderStatus === "sent_to_cashier") return "in_cashier";
  const active = items.filter((i) => i.status !== "cancelled");
  if (active.length === 0) return "empty";
  const hasPreparing = active.some((i) => i.status === "preparing");
  if (hasPreparing) return "preparing";
  const allDispatched = active.every((i) => i.status === "dispatched");
  if (allDispatched) return "served";
  const hasReady = active.some((i) => i.status === "ready");
  if (hasReady) return "ready";
  return "open";
}

export const ORDER_STATE_META: Record<
  DerivedOrderState,
  { label: string; tone: string }
> = {
  empty:      { label: "Abierta",          tone: "bg-primary text-primary-foreground" },
  open:       { label: "Abierta",          tone: "bg-primary text-primary-foreground" },
  preparing:  { label: "En preparación",   tone: "bg-amber-500 text-white" },
  ready:      { label: "Listo para servir",tone: "bg-sky-500 text-white" },
  served:     { label: "Servida",          tone: "bg-success text-success-foreground" },
  in_cashier: { label: "En caja",          tone: "bg-warning text-warning-foreground" },
  closed:     { label: "Cerrada",          tone: "bg-muted text-muted-foreground" },
};

export function countByStatus(items: Array<{ status: string }>) {
  return {
    pending:    items.filter((i) => i.status === "pending").length,
    preparing:  items.filter((i) => i.status === "preparing").length,
    ready:      items.filter((i) => i.status === "ready").length,
    dispatched: items.filter((i) => i.status === "dispatched").length,
    cancelled:  items.filter((i) => i.status === "cancelled").length,
  };
}
