import type { Database } from "@/integrations/supabase/types";

export type SalesChannel = Database["public"]["Enums"]["sales_channel"];

export const CHANNELS: { id: SalesChannel; label: string; short: string }[] = [
  { id: "pos", label: "Presencial", short: "POS" },
  { id: "tables", label: "Mesas / Comandas", short: "Mesas" },
  { id: "rappi", label: "Rappi / Digital", short: "Rappi" },
  { id: "whatsapp", label: "WhatsApp", short: "WA" },
  { id: "didi", label: "Didi Food", short: "Didi" },
  { id: "uber", label: "Uber Eats", short: "Uber" },
  { id: "delivery", label: "Domicilio propio", short: "Domicilio" },
];

export const channelLabel = (c: SalesChannel) =>
  CHANNELS.find((x) => x.id === c)?.label ?? c;

export type ChannelPriceRow = {
  product_id: string;
  branch_id: string | null;
  channel: SalesChannel;
  price: number;
};

export type BranchProductRow = {
  product_id: string;
  branch_id: string;
  is_available: boolean;
  local_price: number | null;
};

/**
 * Resolve final unit price for a product given branch + channel.
 * Priority:
 *   1. branch+channel specific price
 *   2. global channel price (branch_id NULL)
 *   3. branch local price override (branch_products.local_price)
 *   4. base product.price
 */
export function resolvePrice(
  productId: string,
  basePrice: number,
  branchId: string | null,
  channel: SalesChannel,
  channelPrices: ChannelPriceRow[],
  branchProducts: BranchProductRow[]
): number {
  if (branchId) {
    const branchChan = channelPrices.find(
      (p) => p.product_id === productId && p.branch_id === branchId && p.channel === channel
    );
    if (branchChan) return Number(branchChan.price);
  }
  const globalChan = channelPrices.find(
    (p) => p.product_id === productId && p.branch_id === null && p.channel === channel
  );
  if (globalChan) return Number(globalChan.price);

  if (branchId) {
    const bp = branchProducts.find((b) => b.product_id === productId && b.branch_id === branchId);
    if (bp?.local_price != null) return Number(bp.local_price);
  }
  return Number(basePrice);
}
