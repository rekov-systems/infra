import { create } from 'zustand'

interface BrandingStore {
  primaryColor: string | null
  setPrimaryColor: (color: string | null) => void
}

export const useBrandingStore = create<BrandingStore>((set) => ({
  primaryColor: null,
  setPrimaryColor: (primaryColor) => set({ primaryColor }),
}))
