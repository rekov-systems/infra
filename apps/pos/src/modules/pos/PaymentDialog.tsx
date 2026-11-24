import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { Banknote, CreditCard, Smartphone, QrCode, Loader2, Heart, Tag } from "lucide-react";
import { NumPad } from "./NumPad";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PayMethod = "cash" | "card" | "transfer" | "qr";

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  total: number;
  tenantId?: string | null;
  submitting: boolean;
  onConfirm: (method: PayMethod, tendered: number, tip: number, couponCode?: string, discount?: number) => void;
}

const METHODS = [
  { id: "cash" as const, label: "Efectivo", icon: Banknote },
  { id: "card" as const, label: "Tarjeta", icon: CreditCard },
  { id: "transfer" as const, label: "Transfer.", icon: Smartphone },
  { id: "qr" as const, label: "QR", icon: QrCode },
];

const TIP_SUGGESTIONS = [
  { label: "0%", value: 0 },
  { label: "5%", percent: 0.05 },
  { label: "10%", percent: 0.1 },
  { label: "15%", percent: 0.15 },
];

const SHORTCUTS = [5000, 10000, 20000, 50000];

export function PaymentDialog({ open, onOpenChange, total, tenantId, submitting, onConfirm }: PaymentDialogProps) {
  const [method, setMethod] = useState<PayMethod>("cash");
  const [tendered, setTendered] = useState<string>("");
  const [tip, setTip] = useState<number>(0);
  const [coupon, setCoupon] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  useEffect(() => {
    if (open) {
      setMethod("cash");
      setTendered(String(Math.round(total)));
      setTip(0);
      setCoupon("");
      setCouponDiscount(0);
    }
  }, [open, total]);

  const tenderedNum = Number(tendered) || 0;
  const discountedTotal = Math.max(0, total - couponDiscount);
  const grandTotal = discountedTotal + tip;
  const change = method === "cash" ? Math.max(0, tenderedNum - grandTotal) : 0;
  const insufficient = method === "cash" && tenderedNum < grandTotal;

  const handleTipPercent = (p: number) => {
    setTip(Math.round(discountedTotal * p));
  };

  useEffect(() => {
    if (method !== "cash") setTendered(String(Math.round(grandTotal)));
  }, [grandTotal, method]);

  const applyCoupon = async () => {
    const code = coupon.trim().toUpperCase();
    if (!code) {
      setCouponDiscount(0);
      return;
    }
    if (!tenantId) return toast.error("No hay negocio activo para validar el cupón");
    setValidatingCoupon(true);
    try {
      const { data, error } = await supabase
        .from("discount_codes" as any)
        .select("code, discount_type, discount_value, starts_at, expires_at, max_uses, current_uses, is_active")
        .eq("tenant_id", tenantId)
        .eq("code", code)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      const now = Date.now();
      if (!data || new Date(data.starts_at).getTime() > now || (data.expires_at && new Date(data.expires_at).getTime() < now)) {
        setCouponDiscount(0);
        return toast.error("Cupón inválido o vencido");
      }
      if (data.max_uses != null && Number(data.current_uses) >= Number(data.max_uses)) {
        setCouponDiscount(0);
        return toast.error("Cupón sin usos disponibles");
      }
      const rawDiscount = data.discount_type === "percentage"
        ? total * (Number(data.discount_value) / 100)
        : Number(data.discount_value);
      const discount = Math.min(total, Math.max(0, Math.round(rawDiscount)));
      setCouponDiscount(discount);
      toast.success(`Cupón aplicado · -${formatCurrency(discount)}`);
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo validar el cupón");
    } finally {
      setValidatingCoupon(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-[var(--g-hairline)]">
          <DialogTitle className="text-xl flex items-baseline justify-between">
            <span className="h-display text-xl">Cobrar venta</span>
            <div className="text-right">
              <div className="h-meta">Total a pagar (inc. propina)</div>
              <div className="h-num text-3xl text-brand-600">{formatCurrency(grandTotal)}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-0 h-[500px]">
          {/* Left Panel: Options */}
          <div className="p-6 border-r border-[var(--g-hairline)] overflow-y-auto space-y-6">

            {/* Payment Method */}
            <div className="space-y-3">
              <div className="h-label uppercase tracking-widest">Método de pago</div>
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map((m) => {
                  const active = method === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setMethod(m.id);
                        if (m.id !== "cash") setTendered(String(grandTotal));
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center gap-2 h-20 rounded-xl border-2 transition-all active:scale-95",
                        active
                          ? "border-[var(--brand-600)] glass-strong text-[var(--ink-900)] shadow-md"
                          : "border-[var(--g-hairline)] glass text-[var(--ink-500)] hover:border-[var(--brand-600)]/40"
                      )}
                    >
                      <m.icon className="h-6 w-6" />
                      <span className="font-semibold text-sm">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tip Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-label uppercase tracking-widest flex items-center gap-1.5">
                  <Heart className="h-3.5 w-3.5 text-[var(--g-bad)]" /> Propina
                </div>
                <div className="text-sm font-bold tabular-nums text-g-bad">
                  {tip > 0 ? "+" + formatCurrency(tip) : "Sin propina"}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {TIP_SUGGESTIONS.map((s) => {
                  const isActive = tip === (s.percent ? Math.round(total * s.percent) : s.value);
                  return (
                    <button
                      key={s.label}
                      type="button"
                      className={cn(
                        "g-pill g-pill-h28 transition-all",
                        isActive ? "g-pill-bad" : "g-pill-ghost"
                      )}
                      onClick={() => s.percent !== undefined ? handleTipPercent(s.percent) : setTip(s.value)}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 h-meta">$</span>
                <Input
                  type="number"
                  placeholder="Monto personalizado"
                  className="pl-7"
                  value={tip || ""}
                  onChange={(e) => setTip(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            {/* Coupon Code */}
            <div className="space-y-3 pt-2">
              <div className="h-label uppercase tracking-widest flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" /> Cupón de descuento
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Ingresa código..."
                  value={coupon}
                  onChange={(e) => {
                    setCoupon(e.target.value.toUpperCase());
                    setCouponDiscount(0);
                  }}
                  className="uppercase font-mono"
                />
                <button
                  type="button"
                  className="g-btn g-btn-ghost px-4"
                  onClick={applyCoupon}
                  disabled={validatingCoupon}
                >
                  {validatingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar"}
                </button>
              </div>
              {couponDiscount > 0 && (
                <div className="text-xs font-semibold text-[var(--g-ok)]">
                  Descuento aplicado: -{formatCurrency(couponDiscount)}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: NumPad & Summary */}
          <div className="p-6 glass-thin flex flex-col justify-between">
            <div className="space-y-4">
              <div className="glass rounded-xl px-4 py-3">
                <div className="h-label uppercase tracking-widest mb-1">
                  {method === "cash" ? "Efectivo recibido" : "Confirmar monto"}
                </div>
                <div className="h-num text-3xl">{formatCurrency(tenderedNum)}</div>
              </div>

              <NumPad
                value={tendered}
                onChange={setTendered}
                shortcuts={method === "cash" ? SHORTCUTS : undefined}
                onShortcut={(n) => setTendered(String(tenderedNum + n))}
              />

              {method === "cash" && (
                <div className="glass rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="h-label uppercase tracking-wider">Cambio</span>
                  <span className={cn("h-num text-xl", insufficient ? "text-[var(--g-bad)]" : "text-[var(--g-ok)]")}>
                    {insufficient ? "Faltan " + formatCurrency(grandTotal - tenderedNum) : formatCurrency(change)}
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              className="g-btn g-btn-primary g-btn-touch w-full text-lg font-black shadow-lg mt-4"
              disabled={submitting || insufficient}
              onClick={() => onConfirm(method, tenderedNum, tip, couponDiscount > 0 ? coupon.trim().toUpperCase() : undefined, couponDiscount)}
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>PAGAR {formatCurrency(grandTotal)}</>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
