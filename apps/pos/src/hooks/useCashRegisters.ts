import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCashRegisters(branchId: string | null, tenantId?: string | null) {
  const [selectedId, setSelectedId] = useState("");
  const { data: registers = [] } = useQuery({
    queryKey: ["cash-registers", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase.from("cash_registers")
        .select("id, name, status").eq("branch_id", branchId!).eq("status", "active").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const storageKey = `desk-cash-register:${tenantId ?? ""}:${branchId ?? ""}`;
  useEffect(() => {
    if (!branchId || registers.length === 0) { setSelectedId(""); return; }
    const saved = localStorage.getItem(storageKey);
    setSelectedId(registers.some((item) => item.id === saved) ? saved! : registers[0].id);
  }, [branchId, registers, storageKey]);

  const select = (id: string) => {
    setSelectedId(id);
    if (id) localStorage.setItem(storageKey, id);
  };
  return { registers, registerId: selectedId, setRegisterId: select };
}
