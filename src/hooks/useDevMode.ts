import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "./useTenantContext";

export function useDevMode() {
  const { tenantId, hasRole } = useTenantContext();
  const qc = useQueryClient();

  const { data: devMode = false } = useQuery({
    queryKey: ["tenant-dev-mode", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("dev_mode")
        .eq("id", tenantId!)
        .single();
      return data?.dev_mode ?? false;
    },
  });

  const canToggle = hasRole("super_admin");

  const { mutate: setDevMode, isPending } = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("tenants")
        .update({ dev_mode: enabled })
        .eq("id", tenantId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-dev-mode"] });
      qc.invalidateQueries({ queryKey: ["pos-tenant"] });
    },
  });

  return { devMode, canToggle, setDevMode, isPending };
}
