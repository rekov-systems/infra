import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTenantContext } from "./useTenantContext";

export interface InventoryCenter {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  type: string;
  status: "active" | "inactive";
  created_at: string;
}

export function useInventoryCenters() {
  const { tenantId, branchId } = useTenantContext();
  const queryClient = useQueryClient();

  const { data: centers = [], isLoading } = useQuery({
    queryKey: ["inventory-centers", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("inventory_centers")
        .select("*")
        .eq("branch_id", branchId!)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as InventoryCenter[];
    },
  });

  const createCenter = useMutation({
    mutationFn: async (payload: Partial<InventoryCenter>) => {
      const { data, error } = await (supabase as any)
        .from("inventory_centers")
        .insert([{ 
          ...payload, 
          tenant_id: tenantId!, 
          branch_id: branchId!,
          status: "active"
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-centers", branchId] });
      toast.success("Centro de inventario creado");
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const updateCenter = useMutation({
    mutationFn: async ({ id, ...payload }: Partial<InventoryCenter> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from("inventory_centers")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-centers", branchId] });
      toast.success("Centro de inventario actualizado");
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  return {
    centers,
    isLoading,
    createCenter,
    updateCenter,
    defaultCenter: centers.find(c => c.name === "Bodega Principal") || centers[0],
  };
}
