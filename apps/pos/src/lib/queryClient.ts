import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del } from 'idb-keyval';

// Creamos un adaptador para idb-keyval que cumpla la interfaz de persister
const idbValidKeyval = {
  getItem: async (key: string) => {
    const value = await get(key);
    return value === undefined ? null : value;
  },
  setItem: async (key: string, value: any) => {
    await set(key, value);
  },
  removeItem: async (key: string) => {
    await del(key);
  },
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours (renombrado de cacheTime a gcTime en v5)
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 3,
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: idbValidKeyval,
});
