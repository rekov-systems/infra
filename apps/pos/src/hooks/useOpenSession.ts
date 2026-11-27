import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Obtiene la sesión abierta para la caja registradora seleccionada. */
export function useOpenSession(branchId: string | null, registerId: string | null = null) {
  return useQuery({
    queryKey: ["open-session", branchId, registerId],
    enabled: !!branchId && !!registerId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data } = await supabase
        .from("cash_sessions")
        .select("id, opening_amount, total_cash, total_card, total_transfer, total_qr, total_in, total_out, opened_at")
        .eq("branch_id", branchId!)
        .eq("register_id", registerId!)
        .eq("status", "open")
        .maybeSingle();
      return data;
    },
  });
}
