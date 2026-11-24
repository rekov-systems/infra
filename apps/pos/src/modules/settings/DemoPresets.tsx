import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { useTenantContext } from "@/hooks/useTenantContext";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Croissant, Beer, IceCream2, Loader2 } from "lucide-react";

type PresetProduct = {
  name: string;
  category: string;
  price: number;
  cost: number;
  tax_rate: number;
  unit_code: string;
  initial_stock: number;
};

type Preset = {
  key: "bakery" | "bar" | "icecream";
  label: string;
  description: string;
  business: { name: string; currency: string; tax_rate: number };
  categories: { name: string; color: string }[];
  products: PresetProduct[];
  tables?: { name: string; capacity: number }[];
};

const BAKERY_PRESET: Preset = {
  key: "bakery",
  label: "Panadería",
  description: "Panes, pastelería, café y sándwiches.",
  business: { name: "Panadería Pan de Oro", currency: "COP", tax_rate: 19 },
  categories: [
    { name: "Panes", color: "#c2410c" },
    { name: "Pastelería", color: "#d97706" },
    { name: "Tortas", color: "#be185d" },
    { name: "Bebidas calientes", color: "#7c2d12" },
    { name: "Bebidas frías", color: "#0891b2" },
    { name: "Sándwiches", color: "#65a30d" },
  ],
  products: [
    { name: "Pan francés", category: "Panes", price: 1500, cost: 600, tax_rate: 19, unit_code: "unit", initial_stock: 80 },
    { name: "Pan integral", category: "Panes", price: 2500, cost: 1100, tax_rate: 19, unit_code: "unit", initial_stock: 40 },
    { name: "Pan de bono", category: "Panes", price: 2000, cost: 800, tax_rate: 19, unit_code: "unit", initial_stock: 60 },
    { name: "Pan de yuca", category: "Panes", price: 2200, cost: 850, tax_rate: 19, unit_code: "unit", initial_stock: 50 },
    { name: "Almojábana", category: "Panes", price: 2200, cost: 900, tax_rate: 19, unit_code: "unit", initial_stock: 50 },
    { name: "Buñuelo", category: "Panes", price: 1800, cost: 700, tax_rate: 19, unit_code: "unit", initial_stock: 60 },
    { name: "Croissant mantequilla", category: "Pastelería", price: 4500, cost: 1800, tax_rate: 19, unit_code: "unit", initial_stock: 30 },
    { name: "Pastel de pollo", category: "Pastelería", price: 5500, cost: 2300, tax_rate: 19, unit_code: "unit", initial_stock: 25 },
    { name: "Empanada de carne", category: "Pastelería", price: 3500, cost: 1400, tax_rate: 19, unit_code: "unit", initial_stock: 40 },
    { name: "Palitos de queso", category: "Pastelería", price: 3800, cost: 1500, tax_rate: 19, unit_code: "unit", initial_stock: 35 },
    { name: "Milhoja de arequipe", category: "Pastelería", price: 6500, cost: 2600, tax_rate: 19, unit_code: "unit", initial_stock: 20 },
    { name: "Brownie chocolate", category: "Pastelería", price: 5500, cost: 2100, tax_rate: 19, unit_code: "unit", initial_stock: 25 },
    { name: "Torta de chocolate (porción)", category: "Tortas", price: 8000, cost: 3000, tax_rate: 19, unit_code: "unit", initial_stock: 20 },
    { name: "Torta de zanahoria (porción)", category: "Tortas", price: 8000, cost: 3000, tax_rate: 19, unit_code: "unit", initial_stock: 18 },
    { name: "Torta tres leches (porción)", category: "Tortas", price: 8500, cost: 3200, tax_rate: 19, unit_code: "unit", initial_stock: 15 },
    { name: "Café americano", category: "Bebidas calientes", price: 3500, cost: 800, tax_rate: 19, unit_code: "unit", initial_stock: 100 },
    { name: "Café con leche", category: "Bebidas calientes", price: 4500, cost: 1200, tax_rate: 19, unit_code: "unit", initial_stock: 100 },
    { name: "Capuchino", category: "Bebidas calientes", price: 5500, cost: 1500, tax_rate: 19, unit_code: "unit", initial_stock: 80 },
    { name: "Chocolate caliente", category: "Bebidas calientes", price: 5000, cost: 1400, tax_rate: 19, unit_code: "unit", initial_stock: 60 },
    { name: "Té aromático", category: "Bebidas calientes", price: 3500, cost: 700, tax_rate: 19, unit_code: "unit", initial_stock: 60 },
    { name: "Jugo de naranja", category: "Bebidas frías", price: 6500, cost: 2200, tax_rate: 19, unit_code: "unit", initial_stock: 40 },
    { name: "Jugo de mora", category: "Bebidas frías", price: 6500, cost: 2200, tax_rate: 19, unit_code: "unit", initial_stock: 40 },
    { name: "Sándwich jamón y queso", category: "Sándwiches", price: 9500, cost: 3800, tax_rate: 19, unit_code: "unit", initial_stock: 25 },
    { name: "Sándwich vegetariano", category: "Sándwiches", price: 9000, cost: 3500, tax_rate: 19, unit_code: "unit", initial_stock: 20 },
    { name: "Sándwich club", category: "Sándwiches", price: 12500, cost: 4800, tax_rate: 19, unit_code: "unit", initial_stock: 18 },
    { name: "Wrap de pollo", category: "Sándwiches", price: 11000, cost: 4200, tax_rate: 19, unit_code: "unit", initial_stock: 20 },
  ],
  tables: Array.from({ length: 8 }, (_, i) => ({
    name: `Mesa ${i + 1}`,
    capacity: i < 4 ? 2 : 4,
  })),
};

const BAR_PRESET: Preset = {
  key: "bar",
  label: "Bar",
  description: "Cervezas, cocteles, licores y tapas.",
  business: { name: "La Barra de Lúpulo", currency: "COP", tax_rate: 19 },
  categories: [
    { name: "Cervezas", color: "#ca8a04" },
    { name: "Cocteles", color: "#db2777" },
    { name: "Licores", color: "#7c3aed" },
    { name: "Vinos", color: "#9f1239" },
    { name: "Tapas", color: "#dc2626" },
    { name: "Sin alcohol", color: "#0891b2" },
  ],
  products: [
    { name: "Club Colombia Dorada", category: "Cervezas", price: 7000, cost: 2800, tax_rate: 19, unit_code: "unit", initial_stock: 120 },
    { name: "Águila Original", category: "Cervezas", price: 6000, cost: 2400, tax_rate: 19, unit_code: "unit", initial_stock: 150 },
    { name: "Poker", category: "Cervezas", price: 6000, cost: 2400, tax_rate: 19, unit_code: "unit", initial_stock: 130 },
    { name: "Corona Extra", category: "Cervezas", price: 9500, cost: 4200, tax_rate: 19, unit_code: "unit", initial_stock: 80 },
    { name: "Heineken", category: "Cervezas", price: 9000, cost: 4000, tax_rate: 19, unit_code: "unit", initial_stock: 80 },
    { name: "Stella Artois", category: "Cervezas", price: 9500, cost: 4300, tax_rate: 19, unit_code: "unit", initial_stock: 60 },
    { name: "BBC Cajicá", category: "Cervezas", price: 11000, cost: 4800, tax_rate: 19, unit_code: "unit", initial_stock: 50 },
    { name: "Mojito clásico", category: "Cocteles", price: 18000, cost: 6000, tax_rate: 19, unit_code: "unit", initial_stock: 50 },
    { name: "Margarita", category: "Cocteles", price: 19000, cost: 6500, tax_rate: 19, unit_code: "unit", initial_stock: 40 },
    { name: "Cuba Libre", category: "Cocteles", price: 16000, cost: 5500, tax_rate: 19, unit_code: "unit", initial_stock: 50 },
    { name: "Aperol Spritz", category: "Cocteles", price: 22000, cost: 8000, tax_rate: 19, unit_code: "unit", initial_stock: 35 },
    { name: "Gin Tonic", category: "Cocteles", price: 22000, cost: 7500, tax_rate: 19, unit_code: "unit", initial_stock: 40 },
    { name: "Piña Colada", category: "Cocteles", price: 20000, cost: 7000, tax_rate: 19, unit_code: "unit", initial_stock: 35 },
    { name: "Daiquiri de fresa", category: "Cocteles", price: 19000, cost: 6500, tax_rate: 19, unit_code: "unit", initial_stock: 35 },
    { name: "Whisky Old Parr (trago)", category: "Licores", price: 18000, cost: 7000, tax_rate: 19, unit_code: "unit", initial_stock: 60 },
    { name: "Ron Medellín 8 años (trago)", category: "Licores", price: 12000, cost: 4500, tax_rate: 19, unit_code: "unit", initial_stock: 70 },
    { name: "Tequila Patrón (shot)", category: "Licores", price: 15000, cost: 6000, tax_rate: 19, unit_code: "unit", initial_stock: 50 },
    { name: "Aguardiente Antioqueño (shot)", category: "Licores", price: 6000, cost: 2200, tax_rate: 19, unit_code: "unit", initial_stock: 100 },
    { name: "Vino tinto copa", category: "Vinos", price: 14000, cost: 5500, tax_rate: 19, unit_code: "unit", initial_stock: 40 },
    { name: "Vino blanco copa", category: "Vinos", price: 14000, cost: 5500, tax_rate: 19, unit_code: "unit", initial_stock: 35 },
    { name: "Papas bravas", category: "Tapas", price: 14000, cost: 4500, tax_rate: 19, unit_code: "unit", initial_stock: 30 },
    { name: "Alitas BBQ x6", category: "Tapas", price: 22000, cost: 9000, tax_rate: 19, unit_code: "unit", initial_stock: 25 },
    { name: "Nachos con queso", category: "Tapas", price: 18000, cost: 6500, tax_rate: 19, unit_code: "unit", initial_stock: 30 },
    { name: "Tabla de quesos", category: "Tapas", price: 32000, cost: 14000, tax_rate: 19, unit_code: "unit", initial_stock: 15 },
    { name: "Chicharrón crocante", category: "Tapas", price: 19000, cost: 7500, tax_rate: 19, unit_code: "unit", initial_stock: 20 },
    { name: "Hamburguesa clásica", category: "Tapas", price: 24000, cost: 9500, tax_rate: 19, unit_code: "unit", initial_stock: 25 },
    { name: "Papas a la francesa", category: "Tapas", price: 9000, cost: 3000, tax_rate: 19, unit_code: "unit", initial_stock: 40 },
    { name: "Agua con gas", category: "Sin alcohol", price: 4500, cost: 1500, tax_rate: 19, unit_code: "unit", initial_stock: 80 },
    { name: "Agua sin gas", category: "Sin alcohol", price: 4000, cost: 1300, tax_rate: 19, unit_code: "unit", initial_stock: 80 },
    { name: "Coca-Cola", category: "Sin alcohol", price: 5000, cost: 1800, tax_rate: 19, unit_code: "unit", initial_stock: 100 },
    { name: "Sprite", category: "Sin alcohol", price: 5000, cost: 1800, tax_rate: 19, unit_code: "unit", initial_stock: 80 },
    { name: "Red Bull", category: "Sin alcohol", price: 9500, cost: 4200, tax_rate: 19, unit_code: "unit", initial_stock: 60 },
    { name: "Jugo de maracuyá", category: "Sin alcohol", price: 7000, cost: 2200, tax_rate: 19, unit_code: "unit", initial_stock: 50 },
  ],
  tables: [
    { name: "Mesa 1", capacity: 4 }, { name: "Mesa 2", capacity: 4 },
    { name: "Mesa 3", capacity: 4 }, { name: "Mesa 4", capacity: 4 },
    { name: "Mesa 5", capacity: 4 }, { name: "Mesa 6", capacity: 4 },
    { name: "Mesa 7", capacity: 6 }, { name: "Mesa 8", capacity: 6 },
    { name: "Mesa 9", capacity: 6 }, { name: "Mesa 10", capacity: 6 },
    { name: "Mesa 11", capacity: 8 }, { name: "Mesa 12", capacity: 8 },
  ],
};

const ICECREAM_PRESET: Preset = {
  key: "icecream",
  label: "Heladería",
  description: "Helados, waffles, crepes y malteadas.",
  business: { name: "Glacé Postres & Helados", currency: "COP", tax_rate: 19 },
  categories: [
    { name: "Helados", color: "#ec4899" },
    { name: "Waffles", color: "#f59e0b" },
    { name: "Crepes", color: "#a16207" },
    { name: "Malteadas", color: "#7c3aed" },
    { name: "Toppings", color: "#65a30d" },
    { name: "Bebidas frías", color: "#0891b2" },
  ],
  products: [
    { name: "Helado vainilla (bola)", category: "Helados", price: 4500, cost: 1500, tax_rate: 19, unit_code: "unit", initial_stock: 120 },
    { name: "Helado chocolate (bola)", category: "Helados", price: 4500, cost: 1500, tax_rate: 19, unit_code: "unit", initial_stock: 120 },
    { name: "Helado fresa (bola)", category: "Helados", price: 4500, cost: 1500, tax_rate: 19, unit_code: "unit", initial_stock: 100 },
    { name: "Helado mora (bola)", category: "Helados", price: 4500, cost: 1500, tax_rate: 19, unit_code: "unit", initial_stock: 80 },
    { name: "Helado arequipe (bola)", category: "Helados", price: 5000, cost: 1700, tax_rate: 19, unit_code: "unit", initial_stock: 100 },
    { name: "Copa 3 sabores", category: "Helados", price: 12000, cost: 4500, tax_rate: 19, unit_code: "unit", initial_stock: 60 },
    { name: "Banana split", category: "Helados", price: 16000, cost: 6000, tax_rate: 19, unit_code: "unit", initial_stock: 40 },
    { name: "Sundae chocolate", category: "Helados", price: 13000, cost: 4800, tax_rate: 19, unit_code: "unit", initial_stock: 50 },
    { name: "Waffle clásico", category: "Waffles", price: 12000, cost: 4200, tax_rate: 19, unit_code: "unit", initial_stock: 40 },
    { name: "Waffle Nutella & fresa", category: "Waffles", price: 17000, cost: 6500, tax_rate: 19, unit_code: "unit", initial_stock: 35 },
    { name: "Waffle frutas tropicales", category: "Waffles", price: 16000, cost: 6000, tax_rate: 19, unit_code: "unit", initial_stock: 30 },
    { name: "Waffle helado y arequipe", category: "Waffles", price: 18000, cost: 6800, tax_rate: 19, unit_code: "unit", initial_stock: 30 },
    { name: "Crepe Nutella plátano", category: "Crepes", price: 15000, cost: 5500, tax_rate: 19, unit_code: "unit", initial_stock: 30 },
    { name: "Crepe pollo champiñones", category: "Crepes", price: 17000, cost: 7000, tax_rate: 19, unit_code: "unit", initial_stock: 25 },
    { name: "Crepe arequipe queso", category: "Crepes", price: 14000, cost: 5000, tax_rate: 19, unit_code: "unit", initial_stock: 30 },
    { name: "Crepe frutos rojos", category: "Crepes", price: 16000, cost: 6000, tax_rate: 19, unit_code: "unit", initial_stock: 25 },
    { name: "Malteada Oreo", category: "Malteadas", price: 13000, cost: 4500, tax_rate: 19, unit_code: "unit", initial_stock: 50 },
    { name: "Malteada fresa", category: "Malteadas", price: 12000, cost: 4000, tax_rate: 19, unit_code: "unit", initial_stock: 50 },
    { name: "Malteada chocolate", category: "Malteadas", price: 12000, cost: 4000, tax_rate: 19, unit_code: "unit", initial_stock: 50 },
    { name: "Malteada brownie", category: "Malteadas", price: 14000, cost: 5000, tax_rate: 19, unit_code: "unit", initial_stock: 40 },
    { name: "Malteada vainilla", category: "Malteadas", price: 11000, cost: 3500, tax_rate: 19, unit_code: "unit", initial_stock: 50 },
    { name: "Topping chispas chocolate", category: "Toppings", price: 2000, cost: 500, tax_rate: 19, unit_code: "unit", initial_stock: 80 },
    { name: "Topping M&M", category: "Toppings", price: 3000, cost: 1000, tax_rate: 19, unit_code: "unit", initial_stock: 60 },
    { name: "Topping brownie trozos", category: "Toppings", price: 3500, cost: 1200, tax_rate: 19, unit_code: "unit", initial_stock: 50 },
    { name: "Topping fresas frescas", category: "Toppings", price: 4000, cost: 1500, tax_rate: 19, unit_code: "unit", initial_stock: 50 },
    { name: "Salsa caramelo", category: "Toppings", price: 2500, cost: 800, tax_rate: 19, unit_code: "unit", initial_stock: 80 },
    { name: "Salsa chocolate", category: "Toppings", price: 2500, cost: 800, tax_rate: 19, unit_code: "unit", initial_stock: 80 },
    { name: "Salsa arequipe", category: "Toppings", price: 2500, cost: 800, tax_rate: 19, unit_code: "unit", initial_stock: 80 },
    { name: "Limonada natural", category: "Bebidas frías", price: 6000, cost: 2000, tax_rate: 19, unit_code: "unit", initial_stock: 60 },
    { name: "Limonada de coco", category: "Bebidas frías", price: 8500, cost: 3000, tax_rate: 19, unit_code: "unit", initial_stock: 50 },
    { name: "Limonada cerezada", category: "Bebidas frías", price: 7500, cost: 2500, tax_rate: 19, unit_code: "unit", initial_stock: 50 },
    { name: "Coca-Cola", category: "Bebidas frías", price: 5000, cost: 1800, tax_rate: 19, unit_code: "unit", initial_stock: 80 },
    { name: "Agua sin gas", category: "Bebidas frías", price: 4000, cost: 1300, tax_rate: 19, unit_code: "unit", initial_stock: 80 },
  ],
  tables: Array.from({ length: 10 }, (_, i) => ({
    name: `Mesa ${i + 1}`,
    capacity: i < 6 ? 2 : 4,
  })),
};

const PRESETS: Record<"bakery" | "bar" | "icecream", Preset> = {
  bakery: BAKERY_PRESET,
  bar: BAR_PRESET,
  icecream: ICECREAM_PRESET,
};

const PRESET_ICONS = {
  bakery: Croissant,
  bar: Beer,
  icecream: IceCream2,
};

// Utilidades aleatorias
const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const pickN = <T,>(arr: T[], n: number) => {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
};

export default function DemoPresets() {
  const { tenantId, branchId, hasRole } = useTenantContext();
  const qc = useQueryClient();
  const canEdit = hasRole("owner", "admin");
  const [pending, setPending] = useState<null | "bakery" | "bar" | "icecream">(null);
  const [confirmKind, setConfirmKind] = useState<null | "bakery" | "bar" | "icecream">(null);
  const [generateLive, setGenerateLive] = useState(true);

  if (!canEdit) return null;

  const generateLiveData = async (
    preset: Preset,
    productMap: Map<string, { id: string; price: number; tax_rate: number; product_type: string }>,
  ) => {
    if (!tenantId || !branchId) return { openOrders: 0, historicSales: 0, deliveries: 0 };
    let user;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error();
      user = session.user;
    } catch {
      return { openOrders: 0, historicSales: 0, deliveries: 0 };
    }

    // 1) Asegurar caja abierta hoy
    let { data: openSession } = await supabase
      .from("cash_sessions")
      .select("id")
      .eq("branch_id", branchId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!openSession) {
      const { data: newSession } = await supabase
        .from("cash_sessions")
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          user_id: user.id,
          opening_amount: 200000,
          status: "open",
        })
        .select("id")
        .single();
      openSession = newSession;
    }

    // 2) Pedidos abiertos en mesas
    const { data: branchTables } = await supabase
      .from("tables")
      .select("id, name, status")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .eq("status", "available")
      .order("sort_order");

    const products = Array.from(productMap.values());
    let openOrders = 0;

    if (branchTables && branchTables.length > 0 && products.length > 0) {
      const tablesToOccupy = pickN(branchTables, Math.min(branchTables.length, rnd(4, 6)));
      for (const t of tablesToOccupy) {
        const { data: order } = await supabase
          .from("table_orders")
          .insert({
            tenant_id: tenantId,
            branch_id: branchId,
            table_id: t.id,
            waiter_id: user.id,
            guests: rnd(1, 4),
            status: "open",
            notes: "[demo]",
          })
          .select("id")
          .single();
        if (!order) continue;

        await supabase.from("tables").update({ status: "occupied" }).eq("id", t.id);

        const itemCount = rnd(2, 5);
        const itemsToInsert = pickN(products, itemCount).map((p) => {
          const qty = rnd(1, 3);
          const sub = qty * p.price;
          const tax = (sub * p.tax_rate) / 100;
          return {
            tenant_id: tenantId,
            order_id: order.id,
            product_id: p.id,
            product_name: products.find((pp) => pp.id === p.id)
              ? Array.from(productMap.entries()).find(([, v]) => v.id === p.id)?.[0] ?? "Producto"
              : "Producto",
            product_type: p.product_type as any,
            quantity: qty,
            unit_price: p.price,
            tax_rate: p.tax_rate,
            discount: 0,
            line_total: sub + tax,
            status: "pending" as const,
          };
        });

        const { data: insertedItems } = await supabase
          .from("table_order_items")
          .insert(itemsToInsert)
          .select("id");

        // Distribuir items en estados realistas: pending → preparing → ready → dispatched
        if (insertedItems) {
          for (const it of insertedItems) {
            const r = Math.random();
            if (r < 0.25) {
              // queda pending
            } else if (r < 0.55) {
              await supabase.rpc("start_preparing_table_item", { _item_id: it.id });
            } else if (r < 0.80) {
              await supabase.rpc("start_preparing_table_item", { _item_id: it.id });
              await supabase.rpc("mark_table_item_ready", { _item_id: it.id });
            } else {
              await supabase.rpc("dispatch_table_item", { _item_id: it.id });
            }
          }
        }

        await supabase.rpc("recalc_table_order", { _order_id: order.id });
        openOrders++;
      }
    }

    // 3) Ventas históricas (últimos 7 días)
    const methods: Array<"cash" | "card" | "transfer" | "qr"> = ["cash", "card", "transfer", "qr"];
    let historicSales = 0;

    for (let d = 7; d >= 1; d--) {
      const day = new Date();
      day.setDate(day.getDate() - d);
      day.setHours(8, 0, 0, 0);
      const closeTs = new Date(day);
      closeTs.setHours(22, 0, 0, 0);

      // Crear sesión cerrada del día
      const { data: histSession } = await supabase
        .from("cash_sessions")
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          user_id: user.id,
          opening_amount: 200000,
          status: "closed",
          opened_at: day.toISOString(),
          closed_at: closeTs.toISOString(),
          notes: "[demo]",
        })
        .select("id")
        .single();
      if (!histSession) continue;

      const salesPerDay = rnd(5, 9);
      let totalCash = 0, totalCard = 0, totalTransfer = 0, totalQr = 0;

      for (let s = 0; s < salesPerDay; s++) {
        const saleHour = rnd(9, 21);
        const saleMin = rnd(0, 59);
        const saleTs = new Date(day);
        saleTs.setHours(saleHour, saleMin, 0, 0);

        const items = pickN(products, rnd(1, 4));
        let subtotal = 0, taxTotal = 0;
        const saleItems: any[] = [];
        for (const p of items) {
          const qty = rnd(1, 3);
          const sub = qty * p.price;
          const tax = (sub * p.tax_rate) / 100;
          subtotal += sub;
          taxTotal += tax;
          const name = Array.from(productMap.entries()).find(([, v]) => v.id === p.id)?.[0] ?? "Producto";
          saleItems.push({
            tenant_id: tenantId,
            product_id: p.id,
            product_name: name,
            product_type: p.product_type,
            quantity: qty,
            unit_price: p.price,
            tax_rate: p.tax_rate,
            discount: 0,
            line_total: sub + tax,
          });
        }
        const total = subtotal + taxTotal;

        const { data: sale } = await supabase
          .from("sales")
          .insert({
            tenant_id: tenantId,
            branch_id: branchId,
            session_id: histSession.id,
            user_id: user.id,
            subtotal,
            tax_total: taxTotal,
            discount_total: 0,
            total,
            status: "completed",
            channel: "pos",
            notes: "[demo]",
            created_at: saleTs.toISOString(),
          })
          .select("id")
          .single();
        if (!sale) continue;

        await supabase
          .from("sale_items")
          .insert(saleItems.map((it) => ({ ...it, sale_id: sale.id })));

        const method = pick(methods);
        await supabase.from("payments").insert({
          tenant_id: tenantId,
          sale_id: sale.id,
          method,
          amount: total,
        });
        if (method === "cash") totalCash += total;
        else if (method === "card") totalCard += total;
        else if (method === "transfer") totalTransfer += total;
        else if (method === "qr") totalQr += total;

        historicSales++;
      }

      // Actualizar totales de la sesión cerrada
      const expected = 200000 + totalCash;
      await supabase
        .from("cash_sessions")
        .update({
          total_cash: totalCash,
          total_card: totalCard,
          total_transfer: totalTransfer,
          total_qr: totalQr,
          expected_amount: expected,
          closing_amount: expected,
          difference: 0,
        })
        .eq("id", histSession.id);
    }

    // 4) Pedidos de delivery
    const deliveryNames = ["Carlos Pérez", "María Gómez", "Andrés Ruiz", "Laura Torres", "Diego Méndez", "Sofía Ramírez", "Juan Castro", "Camila Vega"];
    const deliveryHoods = ["Chapinero", "Usaquén", "Cedritos", "Modelia", "Salitre", "Suba", "Country", "Macarena"];
    const deliveryStatus: Array<"received" | "preparing" | "on_way" | "delivered"> = ["received", "preparing", "on_way", "delivered", "delivered", "delivered"];
    let deliveries = 0;

    for (let i = 0; i < rnd(5, 8); i++) {
      const items = pickN(products, rnd(1, 3));
      let subtotal = 0, taxTotal = 0;
      const saleItems: any[] = [];
      for (const p of items) {
        const qty = rnd(1, 2);
        const sub = qty * p.price;
        const tax = (sub * p.tax_rate) / 100;
        subtotal += sub;
        taxTotal += tax;
        const name = Array.from(productMap.entries()).find(([, v]) => v.id === p.id)?.[0] ?? "Producto";
        saleItems.push({
          tenant_id: tenantId,
          product_id: p.id,
          product_name: name,
          product_type: p.product_type,
          quantity: qty,
          unit_price: p.price,
          tax_rate: p.tax_rate,
          discount: 0,
          line_total: sub + tax,
        });
      }
      const fee = 5000;
      const total = subtotal + taxTotal;
      const createdTs = new Date();
      createdTs.setHours(createdTs.getHours() - rnd(1, 48));

      const { data: sale } = await supabase
        .from("sales")
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          user_id: user.id,
          subtotal,
          tax_total: taxTotal,
          discount_total: 0,
          total,
          status: "completed",
          channel: "delivery",
          notes: "[demo]",
          created_at: createdTs.toISOString(),
        })
        .select("id")
        .single();
      if (!sale) continue;

      await supabase
        .from("sale_items")
        .insert(saleItems.map((it) => ({ ...it, sale_id: sale.id })));

      const status = pick(deliveryStatus);
      await supabase.from("delivery_orders").insert({
        tenant_id: tenantId,
        branch_id: branchId,
        customer_name: pick(deliveryNames),
        customer_phone: `300${rnd(1000000, 9999999)}`,
        address: `Calle ${rnd(10, 180)} # ${rnd(1, 90)}-${rnd(1, 99)}`,
        neighborhood: pick(deliveryHoods),
        delivery_fee: fee,
        status,
        sale_id: sale.id,
        user_id: user.id,
        notes: "[demo]",
      });
      deliveries++;
    }

    return { openOrders, historicSales, deliveries };
  };

  const applyPreset = async (kind: "bakery" | "bar" | "icecream") => {
    if (!tenantId) return toast.error("Selecciona un negocio primero");
    if (!branchId) return toast.error("Selecciona una sucursal primero");
    const preset = PRESETS[kind];
    setPending(kind);

    try {
      // 1. Update tenant
      const { error: tErr } = await supabase
        .from("tenants")
        .update(preset.business)
        .eq("id", tenantId);
      if (tErr) throw tErr;

      // 2. Categorías
      const { data: existingCats } = await supabase
        .from("categories")
        .select("id, name")
        .eq("tenant_id", tenantId);
      const existingCatMap = new Map((existingCats ?? []).map((c) => [c.name, c.id]));

      const catsToInsert = preset.categories.filter((c) => !existingCatMap.has(c.name));
      let createdCats = 0;
      if (catsToInsert.length > 0) {
        const { data: ins, error: cErr } = await supabase
          .from("categories")
          .insert(catsToInsert.map((c, i) => ({
            tenant_id: tenantId,
            name: c.name,
            color: c.color,
            sort_order: i,
          })))
          .select("id, name");
        if (cErr) throw cErr;
        createdCats = ins?.length ?? 0;
        ins?.forEach((c) => existingCatMap.set(c.name, c.id));
      }

      // 3. Productos
      const { data: existingProducts } = await supabase
        .from("products")
        .select("id, name, price, tax_rate, product_type")
        .eq("tenant_id", tenantId);
      const existingProdMap = new Map(
        (existingProducts ?? []).map((p) => [p.name, p])
      );

      const productsToInsert = preset.products
        .filter((p) => !existingProdMap.has(p.name))
        .map((p) => ({
          tenant_id: tenantId,
          category_id: existingCatMap.get(p.category) ?? null,
          name: p.name,
          product_type: "simple" as const,
          unit_code: p.unit_code,
          price: p.price,
          cost: p.cost,
          tax_rate: p.tax_rate,
          min_stock: 5,
        }));

      let createdProds: { id: string; name: string; price: number; tax_rate: number; product_type: string }[] = [];
      if (productsToInsert.length > 0) {
        const { data: ins, error: pErr } = await supabase
          .from("products")
          .insert(productsToInsert)
          .select("id, name, price, tax_rate, product_type");
        if (pErr) throw pErr;
        createdProds = ins ?? [];
      }

      // Mapa nombre -> producto (existentes + nuevos), filtrado a los del preset
      const presetNames = new Set(preset.products.map((p) => p.name));
      const productMap = new Map<string, { id: string; price: number; tax_rate: number; product_type: string }>();
      for (const [name, p] of existingProdMap.entries()) {
        if (presetNames.has(name)) {
          productMap.set(name, { id: p.id, price: Number(p.price), tax_rate: Number(p.tax_rate), product_type: p.product_type });
        }
      }
      for (const p of createdProds) {
        productMap.set(p.name, { id: p.id, price: Number(p.price), tax_rate: Number(p.tax_rate), product_type: p.product_type });
      }

      // 4. Stock inicial
      let user;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error();
        user = session.user;
      } catch {
        throw new Error("No hay sesión activa para aplicar stock");
      }

      // Consultar stock actual de todos los productos del preset
      const { data: currentStocks } = await supabase
        .from("inventory_stocks")
        .select("product_id, quantity")
        .in("product_id", Array.from(productMap.values()).map(p => p.id))
        .eq("branch_id", branchId);
      
      const stockMap = new Map(preset.products.map((p) => [p.name, p.initial_stock]));
      const existingStockIds = new Set((currentStocks ?? []).filter(s => Number(s.quantity) > 0).map(s => s.product_id));
      
      let stocked = 0;
      for (const [name, prod] of productMap.entries()) {
        const qty = stockMap.get(name) ?? 0;
        // Solo aprovisionar si no tiene stock positivo previo
        if (qty > 0 && user && !existingStockIds.has(prod.id)) {
          const { error: mErr } = await supabase.rpc("apply_inventory_movement", {
            _tenant_id: tenantId,
            _branch_id: branchId,
            _product_id: prod.id,
            _movement_type: "purchase",
            _quantity: qty,
            _reason: `Demo seed (${kind})`,
            _reference_type: "demo_preset",
            _reference_id: prod.id,
            _user_id: user.id,
          });
          if (!mErr) stocked++;
        }
      }

      // 5. Mesas
      let createdTables = 0;
      if (preset.tables) {
        const { data: existingTables } = await supabase
          .from("tables")
          .select("name")
          .eq("tenant_id", tenantId)
          .eq("branch_id", branchId);
        const existingTableNames = new Set((existingTables ?? []).map((t) => t.name));
        const tablesToInsert = preset.tables
          .filter((t) => !existingTableNames.has(t.name))
          .map((t, i) => ({
            tenant_id: tenantId,
            branch_id: branchId,
            name: t.name,
            capacity: t.capacity,
            sort_order: i,
          }));
        if (tablesToInsert.length > 0) {
          const { data: ins, error: tErr2 } = await supabase
            .from("tables")
            .insert(tablesToInsert)
            .select("id");
          if (tErr2) throw tErr2;
          createdTables = ins?.length ?? 0;
        }
      }

      // 6. Datos vivos (opcional)
      let live = { openOrders: 0, historicSales: 0, deliveries: 0 };
      if (generateLive) {
        live = await generateLiveData(preset, productMap);
      }

      const liveTxt = generateLive
        ? `, ${live.openOrders} mesas con pedido, ${live.historicSales} ventas demo, ${live.deliveries} domicilios`
        : "";
      toast.success(
        `Demo "${preset.business.name}" aplicado: ${createdCats} categorías, ${createdProds.length} productos, ${stocked} con stock${createdTables ? `, ${createdTables} mesas` : ""}${liveTxt}.`
      );

      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err.message ?? "Error aplicando demo");
    } finally {
      setPending(null);
      setConfirmKind(null);
    }
  };

  const presetList: Preset[] = [BAKERY_PRESET, BAR_PRESET, ICECREAM_PRESET];

  return (
    <div className="glass p-6 space-y-4 border-dashed">
      <div>
        <h3 className="font-semibold">Plantillas demo</h3>
        <p className="text-sm text-muted-foreground">
          Aplica un preset completo (rebranding, categorías, productos, stock, mesas)
          al negocio y sucursal activos. Es idempotente: no duplica lo existente.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {presetList.map((p) => {
          const Icon = PRESET_ICONS[p.key];
          return (
            <button
              key={p.key}
              type="button"
              disabled={!!pending}
              onClick={() => setConfirmKind(p.key)}
              className="text-left rounded-lg border p-4 hover:border-primary hover:bg-accent/50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-2 mb-2">
                {pending === p.key ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <Icon className="h-5 w-5 text-primary" />
                )}
                <span className="font-medium">{p.label}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{p.description}</p>
              <p className="text-xs text-muted-foreground">
                {p.categories.length} categorías · {p.products.length} productos
                {p.tables ? ` · ${p.tables.length} mesas` : ""}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 pt-2 border-t">
        <Switch id="live-data" checked={generateLive} onCheckedChange={setGenerateLive} />
        <Label htmlFor="live-data" className="text-sm cursor-pointer">
          Generar datos vivos: mesas con pedidos abiertos + 7 días de ventas + domicilios
        </Label>
      </div>

      <AlertDialog open={!!confirmKind} onOpenChange={(o) => !o && setConfirmKind(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Aplicar demo {confirmKind ? PRESETS[confirmKind].label : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Se cambiará el nombre del negocio a{" "}
                  <strong>{confirmKind ? PRESETS[confirmKind].business.name : ""}</strong>{" "}
                  y se agregarán categorías, productos, stock inicial y mesas a la sucursal activa.
                </p>
                {generateLive && (
                  <p className="text-foreground">
                    Además se generarán: <strong>4–6 mesas ocupadas</strong> con pedidos abiertos,{" "}
                    <strong>~50 ventas</strong> de los últimos 7 días con caja cerrada por día, y{" "}
                    <strong>5–8 domicilios</strong>.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmKind && applyPreset(confirmKind)}>
              Aplicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
