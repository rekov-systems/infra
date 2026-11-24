import Dexie, { type Table } from 'dexie';

export interface SyncQueueItem {
  id?: number;
  type: string; // e.g., 'CHECKOUT_SALE', 'UPSERT_TABLE_ORDER_ITEMS'
  payload: any;
  status: SyncQueueStatus;
  createdAt: string;
  updatedAt?: string;
  error?: string;
  retryCount: number;
  clientMutationId?: string;
  deviceId?: string;
}

export type SyncQueueStatus = 'pending' | 'failed' | 'success';

export interface CachedProduct {
  id: string;
  tenant_id: string;
  name: string;
  price: number;
  tax_rate: number;
  category_id: string | null;
  image_url: string | null;
  sku: string | null;
  barcode: string | null;
  status: string;
  product_type: string;
  station: string | null;
  rappi_product_id: string | null;
  description: string | null;
  sort_order: number | null;
  // cached timestamp for freshness checks
  _cached_at: string;
}

export interface CachedCategory {
  id: string;
  tenant_id: string;
  name: string;
  color: string | null;
  sort_order: number | null;
  status: string;
  schedule_enabled: boolean | null;
  schedule_from: string | null;
  schedule_until: string | null;
  schedule_days: string[] | null;
  _cached_at: string;
}

export interface CachedBranchProduct {
  /** composite key: `${product_id}:${branch_id}` */
  id: string;
  product_id: string;
  branch_id: string;
  is_available: boolean;
  local_price: number | null;
  _cached_at: string;
}

export class POSDatabase extends Dexie {
  sync_queue!: Table<SyncQueueItem, number>;
  products!: Table<CachedProduct, string>;
  categories!: Table<CachedCategory, string>;
  branch_products!: Table<CachedBranchProduct, string>;

  constructor() {
    super('POSDatabase');

    this.version(1).stores({
      sync_queue: '++id, type, status, createdAt',
      products: 'id, category_id, name',
      categories: 'id, name',
    });
    this.version(2).stores({
      sync_queue: '++id, type, status, createdAt, updatedAt, clientMutationId, deviceId',
      products: 'id, category_id, name',
      categories: 'id, name',
    });
    this.version(3).stores({
      sync_queue: '++id, type, status, createdAt, updatedAt, clientMutationId, deviceId',
      products: 'id, tenant_id, category_id, name, status, product_type',
      categories: 'id, tenant_id, name, status',
      branch_products: 'id, product_id, branch_id',
    });
  }
}

export const db = new POSDatabase();
