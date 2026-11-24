import { useEffect, useCallback } from 'react';
import { useNetworkStore } from '@/stores/network';
import { db } from '@/lib/db';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
// Asegúrate de importar tu cliente de supabase real
import { supabase } from '@/integrations/supabase/client';

export function useSyncEngine() {
  const { isOnline, setOnline, setPendingSyncCount } = useNetworkStore();

  const updatePendingCount = useCallback(async () => {
    try {
      const count = await db.sync_queue.where('status').anyOf('pending', 'failed').count();
      setPendingSyncCount(count);
    } catch (error) {
      logger.error('sync_queue_count_failed', { error: String(error) });
    }
  }, [setPendingSyncCount]);

  const processSyncQueue = useCallback(async () => {
    const onlineNow = typeof navigator === 'undefined' ? isOnline : navigator.onLine;
    if (!onlineNow) return;

    try {
      const pendingItems = (await db.sync_queue.toArray())
        .filter((item) => item.status === 'pending' || (item.status === 'failed' && item.retryCount < 5))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      if (pendingItems.length === 0) return;

      toast.info(`Sincronizando ${pendingItems.length} transacciones pendientes...`);

      let synced = 0;
      let failed = 0;

      for (const item of pendingItems) {
        const startedAt = Date.now();
        try {
          if (item.id) {
            await db.sync_queue.update(item.id, { status: 'pending', updatedAt: new Date().toISOString() });
          }

          if (item.type === 'CHECKOUT_SALE') {
            const { error } = await supabase.rpc("checkout_sale", item.payload);
            if (error) throw error;
          } else if (item.type === 'CHECKOUT_TABLE_ORDER') {
            const { error } = await supabase.rpc("checkout_table_order", item.payload);
            if (error) throw error;
          } else if (item.type === 'SEND_TO_KITCHEN') {
            const { error } = await supabase.rpc("send_table_order_to_kitchen", item.payload);
            if (error) throw error;
          } else if (item.type === 'MARK_ORDER_READY') {
            const { error } = await supabase.rpc("mark_table_order_ready", item.payload);
            if (error) throw error;
          } else if (item.type === 'SEND_TO_CASHIER') {
            const { error } = await supabase.rpc("send_table_order_to_cashier", item.payload);
            if (error) throw error;
          } else if (item.type === 'APPLY_INVENTORY_MOVEMENT') {
            const { error } = await supabase.rpc("apply_inventory_movement", item.payload);
            if (error) throw error;
          } else if (item.type === 'ADD_TABLE_ORDER_ITEMS') {
            const { items: orderItems, orderId, tenantId } = item.payload as any;
            const { error } = await supabase.from("table_order_items").insert(
              orderItems.map((it: any) => ({ tenant_id: tenantId, order_id: orderId, ...it }))
            );
            if (error) throw error;
            const { error: recalcErr } = await supabase.rpc("recalc_table_order", { _order_id: orderId });
            if (recalcErr) throw recalcErr;
          } else if (item.type === 'UPSERT_TABLE_ORDER_ITEMS') {
            const p = item.payload as any;
            const { data: orderId, error } = await supabase.rpc("upsert_table_order_items", {
              _tenant_id: p.tenant_id,
              _branch_id: p.branch_id,
              _table_id: p.table_id,
              _waiter_id: p.waiter_id,
              _items: p.items,
              _client_mutation_id: p._client_mutation_id ?? null,
            });
            if (error) throw error;
            if (!orderId) throw new Error("No se pudo crear o actualizar la comanda");
          } else {
            // Tipo desconocido: descartamos para no bloquear la cola
            logger.warn("sync_queue_unknown_mutation_type", { type: item.type, itemId: item.id });
          }

          // Si es exitoso, borramos de la cola
          if (item.id) {
            await db.sync_queue.delete(item.id);
          }
          logger.info("sync_queue_item_synced", {
            itemId: item.id,
            type: item.type,
            latency_ms: Date.now() - startedAt,
          });
          synced++;
        } catch (error: any) {
          failed++;
          logger.error("sync_queue_item_sync_failed", {
            itemId: item.id,
            type: item.type,
            retryCount: item.retryCount,
            latency_ms: Date.now() - startedAt,
            error: error?.message ?? String(error),
          });
          if (item.id) {
            await db.sync_queue.update(item.id, {
              status: item.retryCount + 1 >= 5 ? 'failed' : 'pending',
              error: error.message,
              retryCount: item.retryCount + 1,
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }

      await updatePendingCount();
      logger.info("sync_queue_batch_processed", { total: pendingItems.length, synced, failed });
      if (failed > 0) {
        toast.warning(`${synced} sincronizadas, ${failed} pendientes con error`);
      } else {
        toast.success('Sincronización completada con éxito');
      }
    } catch (error) {
      logger.error("sync_queue_process_failed", { error: String(error) });
    }
  }, [isOnline, updatePendingCount]);

  // Network Event Listeners
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      toast.success('Conexión restaurada', { description: 'Sincronizando datos...' });
      processSyncQueue();
    };

    const handleOffline = () => {
      setOnline(false);
      toast.error('Conexión perdida', { description: 'Modo Offline Activado - Guardando localmente' });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    updatePendingCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline, processSyncQueue, updatePendingCount]);

  useEffect(() => {
    if (!isOnline) return;
    const id = window.setInterval(processSyncQueue, 30000);
    return () => window.clearInterval(id);
  }, [isOnline, processSyncQueue]);

  const getQueueItems = useCallback(async () => {
    try {
      return await db.sync_queue.toArray();
    } catch {
      return [];
    }
  }, []);

  const discardItem = useCallback(async (id: number) => {
    try {
      await db.sync_queue.delete(id);
      await updatePendingCount();
    } catch (error) {
      logger.error("sync_queue_discard_failed", { id, error: String(error) });
    }
  }, [updatePendingCount]);

  return { processSyncQueue, getQueueItems, discardItem };
}

