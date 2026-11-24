// Helper único para mover inventario.
// Garantiza que TODO cambio de stock pase por apply_inventory_movement (RPC),
// nunca por updates directos a inventory_stocks desde el cliente.
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type MovementType = Database["public"]["Enums"]["movement_type"];

export async function applyInventoryMovement(args: {
  tenantId: string;
  branchId: string;
  productId: string;
  type: MovementType;
  quantity: number;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  userId: string;
  inventoryCenterId?: string | null;
}) {
  const { error, data } = await supabase.rpc("apply_inventory_movement", {
    _tenant_id: args.tenantId,
    _branch_id: args.branchId,
    _product_id: args.productId,
    _movement_type: args.type,
    _quantity: args.quantity,
    _reason: args.reason ?? null,
    _reference_type: args.referenceType ?? "manual",
    _reference_id: args.referenceId ?? null,
    _user_id: args.userId,
    _inventory_center_id: args.inventoryCenterId ?? null,
  });
  if (error) throw error;
  return data as string;
}
