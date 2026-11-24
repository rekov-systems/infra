import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Hook centralizado para conocer la sesión de caja abierta de la sucursal actual. */
export function useOpenSession(branchId: string | null) {
  return useQuery({
    queryKey: ["open-session", branchId],
    enabled: !!branchId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data } = await supabase
        .from("cash_sessions")
        .select("id, opening_amount, total_cash, total_card, total_transfer, total_qr, total_in, total_out, opened_at")
        .eq("branch_id", branchId!)
        .eq("status", "open")
        .maybeSingle();
      return data;
    },
  });
}
