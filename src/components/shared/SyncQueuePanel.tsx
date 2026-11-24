import { useCallback, useEffect, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Trash2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { useSyncEngine } from "@/hooks/useSyncEngine";
import type { SyncQueueItem } from "@/lib/db";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const TYPE_LABELS: Record<string, string> = {
  CHECKOUT_SALE: "Venta POS",
  CHECKOUT_TABLE_ORDER: "Cierre de mesa",
  SEND_TO_KITCHEN: "Envío a cocina",
  MARK_ORDER_READY: "Orden lista",
  SEND_TO_CASHIER: "Enviar a caja",
  APPLY_INVENTORY_MOVEMENT: "Movimiento inventario",
  ADD_TABLE_ORDER_ITEMS: "Items de mesa",
  UPSERT_TABLE_ORDER_ITEMS: "Comanda de mesa",
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function SyncQueuePanel({ open, onOpenChange }: Props) {
  const { processSyncQueue, getQueueItems, discardItem } = useSyncEngine();
  const [items, setItems] = useState<SyncQueueItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [discarding, setDiscarding] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const rows = await getQueueItems();
    setItems(rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, [getQueueItems]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleSync = async () => {
    setSyncing(true);
    await processSyncQueue();
    await refresh();
    setSyncing(false);
  };

  const handleDiscard = async (id: number) => {
    setDiscarding(id);
    await discardItem(id);
    await refresh();
    setDiscarding(null);
  };

  const pending = items.filter(i => i.status === "pending").length;
  const failed = items.filter(i => i.status === "failed").length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            Cola de Sincronización
            {pending > 0 && (
              <Badge className="bg-amber-500 text-white">{pending} pendiente{pending !== 1 ? "s" : ""}</Badge>
            )}
            {failed > 0 && (
              <Badge variant="destructive">{failed} fallido{failed !== 1 ? "s" : ""}</Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            Transacciones guardadas localmente esperando conexión.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-2 px-6 py-3 border-b">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSync}
            disabled={syncing || items.length === 0}
            className="gap-1.5"
          >
            {syncing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            Sincronizar ahora
          </Button>
          <Button size="sm" variant="ghost" onClick={refresh} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Actualizar lista
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <div>
                <p className="font-medium text-foreground">Cola vacía</p>
                <p className="text-sm">Todas las transacciones están sincronizadas.</p>
              </div>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card"
              >
                <div className="mt-0.5 shrink-0">
                  {item.status === "failed" ? (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {TYPE_LABELS[item.type] ?? item.type}
                    </span>
                    <Badge
                      variant={item.status === "failed" ? "destructive" : "secondary"}
                      className="text-[10px] h-4"
                    >
                      {item.status === "failed" ? `Fallido · ${item.retryCount} intentos` : "Pendiente"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: es })}
                    {item.deviceId && ` · Dispositivo: ${item.deviceId.slice(0, 8)}…`}
                  </p>
                  {item.error && (
                    <p className="text-xs text-destructive mt-1 font-mono break-all">
                      {item.error}
                    </p>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  title="Descartar"
                  disabled={discarding === item.id}
                  onClick={() => item.id !== undefined && handleDiscard(item.id)}
                >
                  {discarding === item.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
