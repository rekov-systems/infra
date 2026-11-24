import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TenantState {
  tenantId: string | null;
  branchId: string | null;
  setTenant: (id: string | null) => void;
  setBranch: (id: string | null) => void;
}

export const useTenantStore = create<TenantState>()(
  persist(
    (set) => ({
      tenantId: null,
      branchId: null,
      setTenant: (tenantId) => set({ tenantId }),
      setBranch: (branchId) => set({ branchId }),
    }),
    { name: "foodpos-tenant" }
  )
);
