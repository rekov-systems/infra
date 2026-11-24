export type Branch = {
  id: string;
  tenant_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  status: 'active' | 'inactive';
  table_view_mode: 'cards' | 'board_16_9' | 'board_9_16' | null;
  created_at?: string;
  updated_at?: string;
};
