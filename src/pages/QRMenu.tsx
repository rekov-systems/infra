import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShoppingCart, Plus, Minus, Trash2, CheckCircle2, ImageOff, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  tax_rate: number;
  image_url?: string;
  sort_order?: number;
  stock?: number | null;
  has_stock_record?: boolean;
  requires_detail?: boolean;
}

interface Category {
  id: string;
  name: string;
  color: string;
  schedule_enabled: boolean;
  schedule_from?: string;
  schedule_until?: string;
  schedule_days?: number[];
  products: Product[];
}

interface BranchInfo {
  id: string;
  name: string;
  tenant_id: string;
  tenant_name: string;
  tenant_logo?: string;
  tenant_color?: string;
}

interface CartItem { product: Product; quantity: number; notes?: string }

function isCatActive(cat: Category): boolean {
  if (!cat.schedule_enabled) return true;
  const now = new Date();
  const day = now.getDay();
  if (cat.schedule_days && !cat.schedule_days.includes(day)) return false;
  if (!cat.schedule_from || !cat.schedule_until) return true;
  const [fh, fm] = cat.schedule_from.split(":").map(Number);
  const [uh, um] = cat.schedule_until.split(":").map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= fh * 60 + fm && mins <= uh * 60 + um;
}

function isOutOfStock(p: Product): boolean {
  return !!(p.has_stock_record && p.stock !== null && p.stock !== undefined && Number(p.stock) <= 0);
}

export default function QRMenu() {
  const { branchId } = useParams<{ branchId: string }>();
  const [searchParams] = useSearchParams();
  const tableId = searchParams.get("table") ?? undefined;

  const [menu, setMenu] = useState<{ branch: BranchInfo; categories: Category[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // Table occupancy state
  const [tableStatus, setTableStatus] = useState<"free" | "open" | "cashier" | null>(null);

  useEffect(() => {
    if (!branchId) return;
    supabase.rpc("get_branch_menu", { _branch_id: branchId } as any)
      .then(({ data, error }) => {
        if (error || !data) { toast.error("No se pudo cargar el menú"); setLoading(false); return; }
        const parsed = data as any;
        const activeCats = (parsed.categories ?? []).filter((c: Category) => isCatActive(c) && c.products.length > 0);
        setMenu({ branch: parsed.branch, categories: activeCats });
        if (activeCats.length > 0) setActiveTab(activeCats[0].id);
        setLoading(false);
      });
  }, [branchId]);

  useEffect(() => {
    if (menu?.branch) {
      document.title = `${menu.branch.tenant_name} - ${menu.branch.name} | Menú Digital`;
    }
  }, [menu]);

  useEffect(() => {
    if (!tableId) return;
    supabase
      .from("table_orders")
      .select("status")
      .eq("table_id", tableId)
      .in("status", ["open", "sent_to_cashier"])
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { setTableStatus("free"); return; }
        setTableStatus(data.status === "sent_to_cashier" ? "cashier" : "open");
      });
  }, [tableId]);

  const addToCart = (product: Product) => {
    if (isOutOfStock(product)) return;
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1, notes: "" }];
    });
    toast.success(`${product.name} agregado`, { duration: 1000 });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart(prev =>
      prev.map(i => i.product.id === productId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i)
        .filter(i => i.quantity > 0)
    );
  };

  const updateItemNotes = (productId: string, notes: string) => {
    setCart(prev => prev.map(i => i.product.id === productId ? { ...i, notes } : i));
  };

  const cartTotal = cart.reduce((s, i) => s + Number(i.product.price) * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const submit = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      const items = cart.map(i => ({
        product_id: i.product.id,
        quantity: i.quantity,
        unit_price: i.product.price,
        tax_rate: i.product.tax_rate,
        notes: i.notes?.trim() || null,
      }));
      const { data, error } = await supabase.rpc("create_qr_order", {
        _branch_id: branchId!,
        _items: items,
        _table_id: tableId ?? null,
        _customer_name: customerName.trim() || null,
        _notes: notes.trim() || null,
      } as any);
      if (error) throw error;
      setDone(String(data).slice(0, 8).toUpperCase());
      setCart([]);
      if (tableId) setTableStatus("open");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const brandColor = menu?.branch?.tenant_color ?? "#1d4ed8";

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (!menu) return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground p-6 text-center">
      <p>Menú no disponible. Escanea de nuevo el código QR.</p>
    </div>
  );

  // Table blocked — pending payment
  if (tableId && tableStatus === "cashier") return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-background">
      <AlertCircle className="h-16 w-16 text-amber-500" />
      <h1 className="text-2xl font-bold">Mesa con pedido pendiente</h1>
      <p className="text-muted-foreground max-w-xs">
        Ya hay un pedido en curso y pendiente de pago en esta mesa. Por favor solicita la cuenta a tu mesero.
      </p>
    </div>
  );

  if (done) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-background">
      <CheckCircle2 className="h-16 w-16" {...({ style: { color: brandColor } } as any)} />
      <h1 className="text-2xl font-bold">¡Pedido recibido!</h1>
      <p className="text-muted-foreground">Pedido <span className="font-mono font-bold">#{done}</span></p>
      <p className="text-sm text-muted-foreground">El equipo está preparando tu orden. ¡Gracias!</p>
      <Button onClick={() => setDone(null)} variant="outline">Hacer otro pedido</Button>
    </div>
  );

  const activeCategory = menu.categories.find(c => c.id === activeTab);

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      {/* ── Header con branding ─────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background border-b shadow-sm">
        <div className="px-4 py-3 flex items-center gap-3" {...({ style: { borderBottom: `3px solid ${brandColor}` } } as any)}>
          {menu.branch.tenant_logo ? (
            <img
              src={menu.branch.tenant_logo}
              alt={menu.branch.tenant_name}
              className="h-9 w-9 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div
              className="h-9 w-9 rounded-lg shrink-0 flex items-center justify-center text-white font-bold text-sm"
              {...({ style: { backgroundColor: brandColor } } as any)}
            >
              {menu.branch.tenant_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="font-bold text-base leading-tight truncate">{menu.branch.tenant_name}</h1>
            <p className="text-xs text-muted-foreground truncate">
              {menu.branch.name}{tableId ? " · Mesa QR" : ""}
            </p>
          </div>
        </div>

        {/* Open order notice */}
        {tableId && tableStatus === "open" && (
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Hay un pedido abierto en esta mesa. Tus items se agregarán al pedido en curso.
            </p>
          </div>
        )}

        {/* Category tabs */}
        <div className="flex overflow-x-auto gap-1 px-4 py-2 scrollbar-none">
          {menu.categories.map(cat => (
            <button
              type="button"
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className="shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap"
              {...({ style: activeTab === cat.id
                ? { backgroundColor: cat.color || brandColor, color: "white" }
                : undefined } as any)}
              data-inactive={activeTab !== cat.id}
            >
              <span className={activeTab !== cat.id ? "text-muted-foreground" : ""}>{cat.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Products ─────────────────────────────────────────── */}
      <div className="flex-1 px-4 pt-4 pb-44 space-y-3">
        {activeCategory && (
          <>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {activeCategory.name} · {activeCategory.products.length} productos
            </p>
            <div className="space-y-3">
              {activeCategory.products.map(p => {
                const cartItem = cart.find(i => i.product.id === p.id);
                const outOfStock = isOutOfStock(p);

                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border bg-card overflow-hidden transition-opacity ${outOfStock ? "opacity-60" : ""}`}
                  >
                    {/* Imagen full-width si existe */}
                    {p.image_url ? (
                      <div className="relative w-full h-44 bg-muted">
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="w-full h-full object-cover"
                        />
                        {outOfStock && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <span className="bg-black/70 text-white text-sm font-semibold px-3 py-1 rounded-full">
                              Agotado
                            </span>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Info + controles */}
                    <div className="p-3 flex items-start gap-3">
                      {/* Placeholder si no hay imagen */}
                      {!p.image_url && (
                        <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center shrink-0 relative">
                          <ImageOff className="h-5 w-5 text-muted-foreground/40" />
                          {outOfStock && (
                            <div className="absolute inset-0 rounded-lg bg-black/30 flex items-center justify-center">
                              <span className="text-white text-[9px] font-bold">AGOTADO</span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm leading-snug">{p.name}</p>
                        {p.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>
                        )}
                        <p className="font-bold text-sm mt-1.5" {...({ style: { color: brandColor } } as any)}>
                          {formatCurrency(Number(p.price))}
                        </p>
                        {p.requires_detail && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                            * Requiere detalle al agregar
                          </p>
                        )}
                      </div>

                      {/* Controles de cantidad */}
                      <div className="shrink-0">
                        {outOfStock ? (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Agotado</Badge>
                        ) : cartItem ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              className="h-7 w-7 rounded-full border flex items-center justify-center hover:bg-muted transition-colors"
                              onClick={() => updateQty(p.id, -1)}
                              aria-label="Reducir cantidad"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-5 text-center text-sm font-bold">{cartItem.quantity}</span>
                            <button
                              type="button"
                              className="h-7 w-7 rounded-full text-white flex items-center justify-center transition-opacity hover:opacity-80"
                              {...({ style: { backgroundColor: brandColor } } as any)}
                              onClick={() => updateQty(p.id, 1)}
                              aria-label="Aumentar cantidad"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="h-8 w-8 rounded-full text-white flex items-center justify-center transition-opacity hover:opacity-80"
                            {...({ style: { backgroundColor: brandColor } } as any)}
                            onClick={() => addToCart(p)}
                            aria-label={`Agregar ${p.name}`}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Cart bottom sheet ───────────────────────────────── */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-background border-t shadow-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              <span className="font-semibold text-sm">{cartCount} ítem{cartCount !== 1 ? "s" : ""}</span>
            </div>
            <span className="font-bold">{formatCurrency(cartTotal)}</span>
          </div>

          <div className="space-y-2 max-h-40 overflow-y-auto">
            {cart.map(i => (
              <div key={i.product.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{i.quantity}× {i.product.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{formatCurrency(i.product.price * i.quantity)}</span>
                    <button type="button" onClick={() => updateQty(i.product.id, -i.quantity)} className="text-muted-foreground hover:text-destructive" aria-label="Eliminar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {i.product.requires_detail && (
                  <Input
                    placeholder="Detalle requerido (ej: término, sin cebolla…)"
                    value={i.notes ?? ""}
                    onChange={e => updateItemNotes(i.product.id, e.target.value)}
                    className="h-7 text-xs"
                  />
                )}
              </div>
            ))}
          </div>

          <Input placeholder="Tu nombre (opcional)" value={customerName} onChange={e => setCustomerName(e.target.value)} className="h-9 text-sm" />
          <Textarea placeholder="Notas generales para la cocina (opcional)" value={notes} onChange={e => setNotes(e.target.value)} className="text-sm min-h-0 h-9 resize-none" />

          <Button
            className="w-full text-white"
            {...({ style: { backgroundColor: brandColor } } as any)}
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShoppingCart className="h-4 w-4 mr-2" />}
            Enviar pedido · {formatCurrency(cartTotal)}
          </Button>
        </div>
      )}
    </div>
  );
}
