import { create } from "zustand";
import type { Database } from "@/integrations/supabase/types";

type Product = Database["public"]["Tables"]["products"]["Row"];

export interface CartModifier {
  option_id: string;
  group_id: string;
  name: string;
  price_delta: number;
}

export type CartProduct = Product & {
  _modifiers?: CartModifier[];
};

export interface CartLine {
  id: string;
  product: CartProduct;
  quantity: number;
  discount: number;
}

interface CartState {
  lines: CartLine[];
  add: (p: CartProduct) => void;
  remove: (id: string) => void;
  setQty: (id: string, q: number) => void;
  setDiscount: (id: string, d: number) => void;
  clear: () => void;
  subtotal: () => number;
  taxTotal: () => number;
  total: () => number;
}

export const useCart = create<CartState>((set, get) => ({
  lines: [],
  add: (p) =>
    set((s) => {
      const lineId = getLineId(p);
      const existing = s.lines.find((l) => l.id === lineId);
      if (existing)
        return { lines: s.lines.map((l) => (l.id === lineId ? { ...l, quantity: l.quantity + 1 } : l)) };
      return { lines: [...s.lines, { id: lineId, product: p, quantity: 1, discount: 0 }] };
    }),
  remove: (id) => set((s) => ({ lines: s.lines.filter((l) => l.id !== id) })),
  setQty: (id, q) =>
    set((s) => ({
      lines: q <= 0 ? s.lines.filter((l) => l.id !== id) : s.lines.map((l) => (l.id === id ? { ...l, quantity: q } : l)),
    })),
  setDiscount: (id, d) => set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, discount: d } : l)) })),
  clear: () => set({ lines: [] }),
  subtotal: () => get().lines.reduce((sum, l) => sum + l.product.price * l.quantity - l.discount, 0),
  taxTotal: () =>
    get().lines.reduce((sum, l) => {
      const base = l.product.price * l.quantity - l.discount;
      return sum + (base * Number(l.product.tax_rate || 0)) / 100;
    }, 0),
  total: () => get().subtotal() + get().taxTotal(),
}));

function getLineId(product: CartProduct): string {
  const modifiers = product._modifiers ?? [];
  if (modifiers.length === 0) return product.id;

  const modifierKey = modifiers
    .map((modifier) => modifier.option_id)
    .sort()
    .join(",");

  return `${product.id}:${modifierKey}`;
}
