import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCart } from "@/stores/cart";
import { formatCurrency } from "@/lib/format";
import { Minus, Plus, Trash2, ShoppingBag, X, Send } from "lucide-react";

interface TicketPanelProps {
  canCharge: boolean;
  onCharge: () => void;
  onSendToTable?: () => void;
  reasonDisabled?: string;
}

export function TicketPanel({ canCharge, onCharge, onSendToTable, reasonDisabled }: TicketPanelProps) {
  const { lines, remove, setQty, clear, subtotal, taxTotal, total } = useCart();
  const subtotalNum = subtotal();
  const taxNum = taxTotal();
  const totalNum = total();

  const isTableOrder = !!onSendToTable;

  return (
    <aside className="flex flex-col glass-strong g-ticket-panel h-full max-lg:max-h-[45vh] max-lg:border-t max-lg:border-l-0">
      <header className="px-4 py-3 border-b flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-primary" />
          <span className="font-semibold">Ticket actual</span>
          {lines.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">· {lines.reduce((s, l) => s + l.quantity, 0)} items</span>
          )}
        </div>
        {lines.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clear} className="h-8">
            <X className="h-4 w-4 mr-1" />Vaciar
          </Button>
        )}
      </header>

      <ScrollArea className="flex-1">
        {lines.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-30" />
            Toca un producto para agregarlo al ticket
          </div>
        ) : (
          <ul className="divide-y">
            {lines.map((l) => (
              <li key={l.id} className="p-3 hover:bg-muted/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm leading-tight truncate">{l.product.name}</div>
                    {(l.product._modifiers ?? []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {l.product._modifiers?.map((modifier) => (
                          <span key={modifier.option_id} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {modifier.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground tabular-nums mt-0.5">{formatCurrency(Number(l.product.price))} c/u</div>
                  </div>
                  <button
                    onClick={() => remove(l.id)}
                    className="text-muted-foreground hover:text-destructive p-1 -m-1"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2.5">
                  <div className="flex items-center gap-1.5 bg-muted rounded-lg p-0.5">
                    <Button size="icon" variant="ghost" className="h-9 w-9 rounded-md" onClick={() => setQty(l.id, l.quantity - 1)}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center font-semibold tabular-nums">{l.quantity}</span>
                    <Button size="icon" variant="ghost" className="h-9 w-9 rounded-md" onClick={() => setQty(l.id, l.quantity + 1)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="font-bold tabular-nums">{formatCurrency(Number(l.product.price) * l.quantity)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>

      <footer className="border-t bg-muted/30 p-4 space-y-1.5">
        <Row label="Subtotal" value={formatCurrency(subtotalNum)} />
        <Row label="Impuestos" value={formatCurrency(taxNum)} />
        <div className="flex items-baseline justify-between pt-2 border-t mt-2">
          <span className="font-semibold">Total</span>
          <span className="text-3xl font-bold text-primary tabular-nums">{formatCurrency(totalNum)}</span>
        </div>
        {reasonDisabled && (
          <div className="text-xs text-destructive font-medium pt-1">{reasonDisabled}</div>
        )}
        
        {isTableOrder ? (
          <Button
            size="lg"
            className="w-full h-16 text-lg font-black mt-3 shadow-lg bg-orange-500 hover:bg-orange-600 border-0"
            disabled={lines.length === 0}
            onClick={onSendToTable}
          >
            <Send className="h-5 w-5 mr-2" /> ENVIAR A MESA
          </Button>
        ) : (
          <Button
            size="lg"
            className="w-full h-16 text-lg font-black mt-3 shadow-lg"
            disabled={lines.length === 0 || !canCharge}
            onClick={onCharge}
          >
            COBRAR {formatCurrency(totalNum)}
          </Button>
        )}
      </footer>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
