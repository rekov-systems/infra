import { supabase } from "@/integrations/supabase/client";
import { useTenantStore } from "@/stores/tenant";
import { queryClient } from "@/lib/queryClient";
import { db } from "@/lib/db";
import { clear as idbClear } from "idb-keyval";
import { logger } from "@/lib/logger";

/**
 * Cierra sesión y limpia todo el estado local del tenant anterior.
 *
 * Esto es importante en dispositivos compartidos (caja del local): sin esta
 * limpieza, el siguiente usuario podría ver brevemente productos, mesas y
 * mutaciones en la cola offline del tenant anterior antes de que las queries
 * refresquen.
 */
export async function signOutFully() {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    logger.error("signout_supabase_failed", { error: String(err) });
  }

  try {
    useTenantStore.setState({ tenantId: null, branchId: null });
  } catch (err) {
    logger.error("signout_tenant_store_failed", { error: String(err) });
  }

  try {
    queryClient.clear();
  } catch (err) {
    logger.error("signout_query_clear_failed", { error: String(err) });
  }

  try {
    await Promise.all([
      db.sync_queue.clear(),
      db.products.clear(),
      db.categories.clear(),
      db.branch_products.clear(),
    ]);
  } catch (err) {
    logger.error("signout_dexie_clear_failed", { error: String(err) });
  }

  try {
    await idbClear();
  } catch (err) {
    logger.error("signout_idb_clear_failed", { error: String(err) });
  }
}
