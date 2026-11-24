import { useMutation, UseMutationOptions, UseMutationResult } from '@tanstack/react-query';
import { useNetworkStore } from '@/stores/network';
import { db } from '@/lib/db';
import { toast } from 'sonner';

interface OfflineMutationConfig<TData, TError, TVariables, TContext> 
  extends UseMutationOptions<TData, TError, TVariables, TContext> {
  type: string; // Identificador único para el sync_engine (e.g., 'CREATE_ORDER')
}

export interface OfflineQueuedResult {
  offline: true;
  queued: true;
}

export function useOfflineMutation<TData = unknown, TError = unknown, TVariables = void, TContext = unknown>(
  config: OfflineMutationConfig<TData, TError, TVariables, TContext>
): UseMutationResult<TData, TError, TVariables, TContext> {
  const isOnline = useNetworkStore(state => state.isOnline);
  const setPendingSyncCount = useNetworkStore(state => state.setPendingSyncCount);

  return useMutation({
    ...config,
    mutationFn: async (variables: TVariables) => {
      const queueMutation = async () => {
        await queueOfflineMutation(config.type, variables, setPendingSyncCount);
        toast.success('Guardado localmente. Se sincronizará al volver la conexión.');
        return { offline: true, queued: true } as TData;
      };

      if (!isOnline || isBrowserOffline()) return queueMutation();

      // Modo Online: Ejecutar mutación normal
      if (config.mutationFn) {
        try {
          return await config.mutationFn(variables, undefined as never);
        } catch (error) {
          if (isTransientNetworkError(error)) {
            return queueMutation();
          }
          throw error;
        }
      }
      throw new Error("mutationFn is required when online");
    }
  });
}

export async function queueOfflineMutation<TVariables>(
  type: string,
  variables: TVariables,
  setPendingSyncCount: (count: number) => void,
): Promise<OfflineQueuedResult> {
  const deviceId = getDeviceId();
  const payload = withClientMutationId(variables, deviceId);

  await db.sync_queue.add({
    type,
    payload,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    retryCount: 0,
    clientMutationId: (payload as any)?._client_mutation_id,
    deviceId,
  });

  const count = await db.sync_queue.where('status').anyOf('pending', 'failed').count();
  setPendingSyncCount(count);

  return { offline: true, queued: true };
}

export function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function isTransientNetworkError(error: unknown) {
  if (isBrowserOffline()) return true;
  const message = error instanceof Error
    ? `${error.name} ${error.message}`
    : String(error ?? '');

  return /failed to fetch|fetch failed|networkerror|network error|load failed|err_network|internet disconnected/i.test(message);
}

function getDeviceId() {
  const key = 'poss360t_device_id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

function withClientMutationId<TVariables>(variables: TVariables, deviceId: string): TVariables {
  if (!variables || typeof variables !== 'object') return variables;
  const payload = variables as Record<string, unknown>;
  if (payload._client_mutation_id) return variables;
  return {
    ...payload,
    _client_mutation_id: `${deviceId}:${crypto.randomUUID()}`,
  } as TVariables;
}
