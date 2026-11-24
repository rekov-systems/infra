export type TableStatus = 'active' | 'inactive' | 'occupied' | 'reserved';

export type Table = {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  capacity: number;
  status: TableStatus;
  x_pos: number | null;
  y_pos: number | null;
  created_at?: string;
  updated_at?: string;
};
