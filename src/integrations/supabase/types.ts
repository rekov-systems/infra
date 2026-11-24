export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_channel_configs: {
        Row: {
          ai_model: string | null
          branch_id: string
          channel: string
          config: Json
          created_at: string
          daily_recommendation: string | null
          delivery_delay_minutes: number
          id: string
          is_active: boolean
          phone_number: string | null
          system_prompt: string | null
          temperature: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ai_model?: string | null
          branch_id: string
          channel?: string
          config?: Json
          created_at?: string
          daily_recommendation?: string | null
          delivery_delay_minutes?: number
          id?: string
          is_active?: boolean
          phone_number?: string | null
          system_prompt?: string | null
          temperature?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ai_model?: string | null
          branch_id?: string
          channel?: string
          config?: Json
          created_at?: string
          daily_recommendation?: string | null
          delivery_delay_minutes?: number
          id?: string
          is_active?: boolean
          phone_number?: string | null
          system_prompt?: string | null
          temperature?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_channel_configs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_channel_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          branch_id: string
          channel: string
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          external_conversation_id: string
          handoff_reason: string | null
          id: string
          last_message_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          channel?: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          external_conversation_id: string
          handoff_reason?: string | null
          id?: string
          last_message_at?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          channel?: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          external_conversation_id?: string
          handoff_reason?: string | null
          id?: string
          last_message_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge_docs: {
        Row: {
          branch_id: string
          content: string
          created_at: string
          embedding: string | null
          id: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_docs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_docs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          direction: string
          id: string
          payload: Json | null
          tenant_id: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          payload?: Json | null
          tenant_id: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          payload?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_order_drafts: {
        Row: {
          branch_id: string
          conversation_id: string | null
          created_at: string
          digital_order_id: string | null
          id: string
          items: Json
          quote: Json
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          conversation_id?: string | null
          created_at?: string
          digital_order_id?: string | null
          id?: string
          items?: Json
          quote?: Json
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          conversation_id?: string | null
          created_at?: string
          digital_order_id?: string | null
          id?: string
          items?: Json
          quote?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance_logs: {
        Row: {
          branch_id: string
          created_at: string
          employee_id: string
          id: string
          tenant_id: string
          type: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          employee_id: string
          id?: string
          tenant_id: string
          type: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          metadata: Json | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_products: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          is_available: boolean
          local_price: number | null
          product_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          is_available?: boolean
          local_price?: number | null
          product_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          is_available?: boolean
          local_price?: number | null
          product_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          status: Database["public"]["Enums"]["entity_status"]
          table_view_mode: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          table_view_mode?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          table_view_mode?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          created_at: string
          id: string
          reason: string | null
          session_id: string
          tenant_id: string
          type: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reason?: string | null
          session_id: string
          tenant_id: string
          type: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reason?: string | null
          session_id?: string
          tenant_id?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          name: string
          status: Database["public"]["Enums"]["entity_status"]
          tenant_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["entity_status"]
          tenant_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["entity_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_registers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          branch_id: string
          closed_at: string | null
          closing_amount: number | null
          counted_card: number | null
          counted_cash: number | null
          counted_qr: number | null
          counted_transfer: number | null
          difference: number | null
          expected_amount: number | null
          id: string
          notes: string | null
          opened_at: string
          opening_amount: number
          register_id: string | null
          status: Database["public"]["Enums"]["cash_session_status"]
          tenant_id: string
          total_card: number
          total_cash: number
          total_in: number
          total_out: number
          total_qr: number
          total_transfer: number
          user_id: string
        }
        Insert: {
          branch_id: string
          closed_at?: string | null
          closing_amount?: number | null
          counted_card?: number | null
          counted_cash?: number | null
          counted_qr?: number | null
          counted_transfer?: number | null
          difference?: number | null
          expected_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opening_amount?: number
          register_id?: string | null
          status?: Database["public"]["Enums"]["cash_session_status"]
          tenant_id: string
          total_card?: number
          total_cash?: number
          total_in?: number
          total_out?: number
          total_qr?: number
          total_transfer?: number
          user_id: string
        }
        Update: {
          branch_id?: string
          closed_at?: string | null
          closing_amount?: number | null
          counted_card?: number | null
          counted_cash?: number | null
          counted_qr?: number | null
          counted_transfer?: number | null
          difference?: number | null
          expected_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opening_amount?: number
          register_id?: string | null
          status?: Database["public"]["Enums"]["cash_session_status"]
          tenant_id?: string
          total_card?: number
          total_cash?: number
          total_in?: number
          total_out?: number
          total_qr?: number
          total_transfer?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          schedule_days: number[] | null
          schedule_enabled: boolean
          schedule_from: string | null
          schedule_until: string | null
          sort_order: number | null
          status: Database["public"]["Enums"]["entity_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          schedule_days?: number[] | null
          schedule_enabled?: boolean
          schedule_from?: string | null
          schedule_until?: string | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["entity_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          schedule_days?: number[] | null
          schedule_enabled?: boolean
          schedule_from?: string | null
          schedule_until?: string | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["entity_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          document_number: string | null
          email: string | null
          id: string
          loyalty_points: number
          name: string
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          document_number?: string | null
          email?: string | null
          id?: string
          loyalty_points?: number
          name: string
          phone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          document_number?: string | null
          email?: string | null
          id?: string
          loyalty_points?: number
          name?: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_orders: {
        Row: {
          address: string
          assigned_at: string | null
          branch_id: string
          courier_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          delivered_at: string | null
          delivery_fee: number
          id: string
          neighborhood: string | null
          notes: string | null
          sale_id: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address: string
          assigned_at?: string | null
          branch_id: string
          courier_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          delivery_fee?: number
          id?: string
          neighborhood?: string | null
          notes?: string | null
          sale_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string
          assigned_at?: string | null
          branch_id?: string
          courier_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          delivery_fee?: number
          id?: string
          neighborhood?: string | null
          notes?: string | null
          sale_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      digital_orders: {
        Row: {
          branch_id: string
          channel: Database["public"]["Enums"]["sales_channel"]
          created_at: string
          external_order_number: string | null
          external_payload: Json | null
          external_status: string | null
          gross_total: number
          id: string
          net_total: number
          notes: string | null
          platform_commission: number
          rappi_order_id: string | null
          sale_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          branch_id: string
          channel?: Database["public"]["Enums"]["sales_channel"]
          created_at?: string
          external_order_number?: string | null
          external_payload?: Json | null
          external_status?: string | null
          gross_total?: number
          id?: string
          net_total?: number
          notes?: string | null
          platform_commission?: number
          rappi_order_id?: string | null
          sale_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          branch_id?: string
          channel?: Database["public"]["Enums"]["sales_channel"]
          created_at?: string
          external_order_number?: string | null
          external_payload?: Json | null
          external_status?: string | null
          gross_total?: number
          id?: string
          net_total?: number
          notes?: string | null
          platform_commission?: number
          rappi_order_id?: string | null
          sale_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      employee_shifts: {
        Row: {
          branch_id: string
          check_in: string | null
          check_out: string | null
          created_at: string
          employee_id: string
          id: string
          scheduled_end: string
          scheduled_start: string
          status: string
          tenant_id: string
        }
        Insert: {
          branch_id: string
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          employee_id: string
          id?: string
          scheduled_end: string
          scheduled_start: string
          status?: string
          tenant_id: string
        }
        Update: {
          branch_id?: string
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          scheduled_end?: string
          scheduled_start?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_shifts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_shifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          branch_id: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          pin: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["entity_status"]
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          pin?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["entity_status"]
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          pin?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["entity_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          product_id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          product_id: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          movement_type?: Database["public"]["Enums"]["movement_type"]
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_stocks: {
        Row: {
          branch_id: string
          id: string
          product_id: string
          quantity: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          id?: string
          product_id: string
          quantity?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          id?: string
          product_id?: string
          quantity?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stocks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stocks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stocks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          reference: string | null
          sale_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
          sale_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
          sale_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_channel_prices: {
        Row: {
          branch_id: string | null
          channel: Database["public"]["Enums"]["sales_channel"]
          created_at: string
          id: string
          price: number
          product_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          channel: Database["public"]["Enums"]["sales_channel"]
          created_at?: string
          id?: string
          price: number
          product_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          channel?: Database["public"]["Enums"]["sales_channel"]
          created_at?: string
          id?: string
          price?: number
          product_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_components: {
        Row: {
          component_product_id: string
          created_at: string
          id: string
          parent_product_id: string
          quantity: number
          tenant_id: string
          waste_pct: number | null
        }
        Insert: {
          component_product_id: string
          created_at?: string
          id?: string
          parent_product_id: string
          quantity: number
          tenant_id: string
          waste_pct?: number | null
        }
        Update: {
          component_product_id?: string
          created_at?: string
          id?: string
          parent_product_id?: string
          quantity?: number
          tenant_id?: string
          waste_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_components_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_components_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_components_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_consumptions: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          quantity: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          quantity: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_consumptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_consumptions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_consumptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          branch_id: string
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          planned_quantity: number
          produced_quantity: number | null
          product_id: string
          status: Database["public"]["Enums"]["production_status"]
          tenant_id: string
          updated_at: string
          user_id: string | null
          waste_quantity: number | null
        }
        Insert: {
          branch_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          planned_quantity: number
          produced_quantity?: number | null
          product_id: string
          status?: Database["public"]["Enums"]["production_status"]
          tenant_id: string
          updated_at?: string
          user_id?: string | null
          waste_quantity?: number | null
        }
        Update: {
          branch_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          planned_quantity?: number
          produced_quantity?: number | null
          product_id?: string
          status?: Database["public"]["Enums"]["production_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
          waste_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category_id: string | null
          color: string | null
          cost: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          min_stock: number | null
          name: string
          price: number
          product_type: Database["public"]["Enums"]["product_type"]
          rappi_product_id: string | null
          sku: string | null
          sort_order: number
          station: string | null
          status: Database["public"]["Enums"]["entity_status"]
          tax_rate: number
          tenant_id: string
          unit_code: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          color?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          min_stock?: number | null
          name: string
          price?: number
          product_type?: Database["public"]["Enums"]["product_type"]
          rappi_product_id?: string | null
          sku?: string | null
          sort_order?: number
          station?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tax_rate?: number
          tenant_id: string
          unit_code?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          color?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          min_stock?: number | null
          name?: string
          price?: number
          product_type?: Database["public"]["Enums"]["product_type"]
          rappi_product_id?: string | null
          sku?: string | null
          sort_order?: number
          station?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tax_rate?: number
          tenant_id?: string
          unit_code?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_branch_id: string | null
          default_tenant_id: string | null
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          pin: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_branch_id?: string | null
          default_tenant_id?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          pin?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_branch_id?: string | null
          default_tenant_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          pin?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_branch_id_fkey"
            columns: ["default_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_default_tenant_id_fkey"
            columns: ["default_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rappi_integrations: {
        Row: {
          auto_accept: boolean
          branch_id: string
          created_at: string
          id: string
          last_menu_sync_at: string | null
          prep_time_min: number
          status: string
          store_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_accept?: boolean
          branch_id: string
          created_at?: string
          id?: string
          last_menu_sync_at?: string | null
          prep_time_min?: number
          status?: string
          store_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auto_accept?: boolean
          branch_id?: string
          created_at?: string
          id?: string
          last_menu_sync_at?: string | null
          prep_time_min?: number
          status?: string
          store_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rappi_webhook_logs: {
        Row: {
          branch_id: string | null
          created_at: string
          error: string | null
          event_type: string | null
          id: string
          payload: Json | null
          rappi_order_id: string | null
          status: string
          store_id: string | null
          tenant_id: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          payload?: Json | null
          rappi_order_id?: string | null
          status?: string
          store_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          payload?: Json | null
          rappi_order_id?: string | null
          status?: string
          store_id?: string | null
          tenant_id?: string | null
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          created_at: string
          discount: number
          id: string
          line_total: number
          modifiers: Json
          product_id: string
          product_name: string
          product_type: Database["public"]["Enums"]["product_type"]
          quantity: number
          sale_id: string
          tax_rate: number
          tenant_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount?: number
          id?: string
          line_total: number
          modifiers?: Json
          product_id: string
          product_name: string
          product_type: Database["public"]["Enums"]["product_type"]
          quantity: number
          sale_id: string
          tax_rate?: number
          tenant_id: string
          unit_price: number
        }
        Update: {
          created_at?: string
          discount?: number
          id?: string
          line_total?: number
          modifiers?: Json
          product_id?: string
          product_name?: string
          product_type?: Database["public"]["Enums"]["product_type"]
          quantity?: number
          sale_id?: string
          tax_rate?: number
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          branch_id: string
          channel: Database["public"]["Enums"]["sales_channel"]
          client_mutation_id: string | null
          coupon_code: string | null
          created_at: string
          customer_id: string | null
          discount_total: number
          id: string
          notes: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          tax_total: number
          tenant_id: string
          ticket_number: number
          tip_amount: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id: string
          channel?: Database["public"]["Enums"]["sales_channel"]
          client_mutation_id?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_id?: string | null
          discount_total?: number
          id?: string
          notes?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          tax_total?: number
          tenant_id: string
          ticket_number?: number
          tip_amount?: number
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          channel?: Database["public"]["Enums"]["sales_channel"]
          client_mutation_id?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_id?: string | null
          discount_total?: number
          id?: string
          notes?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          tax_total?: number
          tenant_id?: string
          ticket_number?: number
          tip_amount?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      table_order_items: {
        Row: {
          created_at: string
          discount: number
          dispatched_at: string | null
          dispatched_by: string | null
          id: string
          line_total: number
          modifiers: Json
          notes: string | null
          order_id: string
          product_id: string
          product_name: string
          product_type: Database["public"]["Enums"]["product_type"]
          quantity: number
          ready_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["table_item_status"]
          tax_rate: number
          tenant_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount?: number
          dispatched_at?: string | null
          dispatched_by?: string | null
          id?: string
          line_total?: number
          modifiers?: Json
          notes?: string | null
          order_id: string
          product_id: string
          product_name: string
          product_type: Database["public"]["Enums"]["product_type"]
          quantity?: number
          ready_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["table_item_status"]
          tax_rate?: number
          tenant_id: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount?: number
          dispatched_at?: string | null
          dispatched_by?: string | null
          id?: string
          line_total?: number
          modifiers?: Json
          notes?: string | null
          order_id?: string
          product_id?: string
          product_name?: string
          product_type?: Database["public"]["Enums"]["product_type"]
          quantity?: number
          ready_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["table_item_status"]
          tax_rate?: number
          tenant_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      table_orders: {
        Row: {
          branch_id: string
          closed_at: string | null
          created_at: string
          guests: number | null
          id: string
          notes: string | null
          opened_at: string
          sale_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["table_order_status"]
          subtotal: number
          table_id: string
          tax_total: number
          tenant_id: string
          total: number
          updated_at: string
          waiter_id: string
        }
        Insert: {
          branch_id: string
          closed_at?: string | null
          created_at?: string
          guests?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          sale_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["table_order_status"]
          subtotal?: number
          table_id: string
          tax_total?: number
          tenant_id: string
          total?: number
          updated_at?: string
          waiter_id: string
        }
        Update: {
          branch_id?: string
          closed_at?: string | null
          created_at?: string
          guests?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          sale_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["table_order_status"]
          subtotal?: number
          table_id?: string
          tax_total?: number
          tenant_id?: string
          total?: number
          updated_at?: string
          waiter_id?: string
        }
        Relationships: []
      }
      tables: {
        Row: {
          assigned_waiter_id: string | null
          branch_id: string
          capacity: number | null
          created_at: string
          id: string
          name: string
          sort_order: number | null
          status: Database["public"]["Enums"]["table_status"]
          tenant_id: string
          updated_at: string
          x_pos: number | null
          y_pos: number | null
        }
        Insert: {
          assigned_waiter_id?: string | null
          branch_id: string
          capacity?: number | null
          created_at?: string
          id?: string
          name: string
          sort_order?: number | null
          status?: Database["public"]["Enums"]["table_status"]
          tenant_id: string
          updated_at?: string
          x_pos?: number | null
          y_pos?: number | null
        }
        Update: {
          assigned_waiter_id?: string | null
          branch_id?: string
          capacity?: number | null
          created_at?: string
          id?: string
          name?: string
          sort_order?: number | null
          status?: Database["public"]["Enums"]["table_status"]
          tenant_id?: string
          updated_at?: string
          x_pos?: number | null
          y_pos?: number | null
        }
        Relationships: []
      }
      tenants: {
        Row: {
          allow_negative_stock: boolean
          created_at: string
          currency: string
          dev_mode: boolean
          domain: string | null
          id: string
          logo_url: string | null
          name: string
          points_per_thousand: number
          primary_color: string | null
          receipt_config: Json
          return_supervisor_threshold: number
          slug: string | null
          status: Database["public"]["Enums"]["entity_status"]
          tax_rate: number
          theme_kind: string | null
          updated_at: string
          active_channels: Database["public"]["Enums"]["sales_channel"][] | null
        }
        Insert: {
          allow_negative_stock?: boolean
          created_at?: string
          currency?: string
          dev_mode?: boolean
          domain?: string | null
          id?: string
          logo_url?: string | null
          name: string
          points_per_thousand?: number
          primary_color?: string | null
          receipt_config?: Json
          return_supervisor_threshold?: number
          slug?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tax_rate?: number
          theme_kind?: string | null
          updated_at?: string
          active_channels?: Database["public"]["Enums"]["sales_channel"][] | null
        }
        Update: {
          allow_negative_stock?: boolean
          created_at?: string
          currency?: string
          dev_mode?: boolean
          domain?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          points_per_thousand?: number
          primary_color?: string | null
          receipt_config?: Json
          return_supervisor_threshold?: number
          slug?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tax_rate?: number
          theme_kind?: string | null
          updated_at?: string
          active_channels?: Database["public"]["Enums"]["sales_channel"][] | null
        }
        Relationships: []
      }
      units: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          created_at: string
          id: string
          max_selections: number
          min_selections: number
          name: string
          product_id: string
          required: boolean
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_selections?: number
          min_selections?: number
          name: string
          product_id: string
          required?: boolean
          sort_order?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          max_selections?: number
          min_selections?: number
          name?: string
          product_id?: string
          required?: boolean
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_options: {
        Row: {
          group_id: string
          id: string
          is_available: boolean
          name: string
          price_delta: number
          sort_order: number
        }
        Insert: {
          group_id: string
          id?: string
          is_available?: boolean
          name: string
          price_delta?: number
          sort_order?: number
        }
        Update: {
          group_id?: string
          id?: string
          is_available?: boolean
          name?: string
          price_delta?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "modifier_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      product_complementaries: {
        Row: {
          complementary_id: string
          product_id: string
          sort_order: number
        }
        Insert: {
          complementary_id: string
          product_id: string
          sort_order?: number
        }
        Update: {
          complementary_id?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_complementaries_complementary_id_fkey"
            columns: ["complementary_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_complementaries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_channel_configs: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          channel: string
          phone_number: string | null
          is_active: boolean
          config: Json
          system_prompt: string | null
          ai_model: string | null
          temperature: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          channel: string
          phone_number?: string | null
          is_active?: boolean
          config?: Json
          system_prompt?: string | null
          ai_model?: string | null
          temperature?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          channel?: string
          phone_number?: string | null
          is_active?: boolean
          config?: Json
          system_prompt?: string | null
          ai_model?: string | null
          temperature?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_knowledge_docs: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          title: string
          content: string
          embedding: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          title: string
          content: string
          embedding?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          title?: string
          content?: string
          embedding?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [key: string]: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      add_cash_movement: {
        Args: {
          _amount: number
          _reason?: string
          _session_id: string
          _type: string
        }
        Returns: {
          amount: number
          created_at: string
          id: string
          reason: string | null
          session_id: string
          tenant_id: string
          type: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "cash_movements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_inventory_movement: {
        Args: {
          _branch_id: string
          _movement_type: Database["public"]["Enums"]["movement_type"]
          _product_id: string
          _quantity: number
          _reason: string
          _reference_id: string
          _reference_type: string
          _tenant_id: string
          _user_id: string
        }
        Returns: string
      }
      checkout_sale:
        | {
            Args: {
              _branch_id: string
              _customer_id?: string
              _discount_total?: number
              _items: Json
              _notes?: string
              _payments: Json
              _tenant_id: string
            }
            Returns: string
          }
        | {
            Args: {
              _branch_id: string
              _channel?: Database["public"]["Enums"]["sales_channel"]
              _customer_id?: string
              _discount_total?: number
              _items: Json
              _notes?: string
              _payments: Json
              _tenant_id: string
            }
            Returns: string
          }
      checkout_table_order: {
        Args: { _order_id: string; _payments: Json }
        Returns: string
      }
      close_cash_session: {
        Args: { _counted_amount: number; _notes?: string; _session_id: string }
        Returns: {
          branch_id: string
          closed_at: string | null
          closing_amount: number | null
          difference: number | null
          expected_amount: number | null
          id: string
          notes: string | null
          opened_at: string
          opening_amount: number
          register_id: string | null
          status: Database["public"]["Enums"]["cash_session_status"]
          tenant_id: string
          total_card: number
          total_cash: number
          total_in: number
          total_out: number
          total_qr: number
          total_transfer: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_production_order: {
        Args: { _order_id: string; _produced: number; _waste?: number }
        Returns: {
          branch_id: string
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          planned_quantity: number
          produced_quantity: number | null
          product_id: string
          status: Database["public"]["Enums"]["production_status"]
          tenant_id: string
          updated_at: string
          user_id: string | null
          waste_quantity: number | null
        }
        SetofOptions: {
          from: "*"
          to: "production_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dispatch_table_item: {
        Args: { _item_id: string }
        Returns: {
          created_at: string
          discount: number
          dispatched_at: string | null
          dispatched_by: string | null
          id: string
          line_total: number
          notes: string | null
          order_id: string
          product_id: string
          product_name: string
          product_type: Database["public"]["Enums"]["product_type"]
          quantity: number
          ready_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["table_item_status"]
          tax_rate: number
          tenant_id: string
          unit_price: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "table_order_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_branch_role: {
        Args: {
          _branch_id: string
          _roles: Database["public"]["Enums"]["app_role"][]
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
      match_knowledge_docs: {
        Args: {
          _tenant_id: string
          _branch_id: string
          _embedding: string
          _match_count?: number
        }
        Returns: {
          id: string
          title: string
          content: string
          similarity: number
        }[]
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
      is_tenant_member: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      mark_table_item_ready: {
        Args: { _item_id: string }
        Returns: {
          created_at: string
          discount: number
          dispatched_at: string | null
          dispatched_by: string | null
          id: string
          line_total: number
          notes: string | null
          order_id: string
          product_id: string
          product_name: string
          product_type: Database["public"]["Enums"]["product_type"]
          quantity: number
          ready_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["table_item_status"]
          tax_rate: number
          tenant_id: string
          unit_price: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "table_order_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_table_order_ready: { Args: { _order_id: string }; Returns: number }
      match_knowledge_docs: {
        Args: {
          _branch_id: string
          _embedding: string
          _match_count?: number
          _tenant_id: string
        }
        Returns: {
          content: string
          id: string
          similarity: number
          title: string
        }[]
      }

      recalc_table_order: { Args: { _order_id: string }; Returns: undefined }
      register_delivery_order: {
        Args: {
          _address: string
          _branch_id: string
          _customer_id?: string
          _customer_name: string
          _customer_phone: string
          _delivery_fee?: number
          _items: Json
          _neighborhood: string
          _notes?: string
          _tenant_id: string
        }
        Returns: string
      }
      register_delivery_payment: {
        Args: {
          _amount: number
          _method: Database["public"]["Enums"]["payment_method"]
          _order_id: string
          _reference?: string
        }
        Returns: string
      }
      register_digital_order: {
        Args: {
          _branch_id: string
          _channel: Database["public"]["Enums"]["sales_channel"]
          _commission?: number
          _external_no: string
          _items: Json
          _notes?: string
          _tenant_id: string
        }
        Returns: string
      }
      send_table_order_to_cashier: {
        Args: { _order_id: string }
        Returns: {
          branch_id: string
          closed_at: string | null
          created_at: string
          guests: number | null
          id: string
          notes: string | null
          opened_at: string
          sale_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["table_order_status"]
          subtotal: number
          table_id: string
          tax_total: number
          tenant_id: string
          total: number
          updated_at: string
          waiter_id: string
        }
        SetofOptions: {
          from: "*"
          to: "table_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_table_order_to_kitchen: {
        Args: { _order_id: string }
        Returns: number
      }
      start_preparing_table_item: {
        Args: { _item_id: string }
        Returns: {
          created_at: string
          discount: number
          dispatched_at: string | null
          dispatched_by: string | null
          id: string
          line_total: number
          notes: string | null
          order_id: string
          product_id: string
          product_name: string
          product_type: Database["public"]["Enums"]["product_type"]
          quantity: number
          ready_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["table_item_status"]
          tax_rate: number
          tenant_id: string
          unit_price: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "table_order_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      undispatch_table_item: {
        Args: { _item_id: string }
        Returns: {
          created_at: string
          discount: number
          dispatched_at: string | null
          dispatched_by: string | null
          id: string
          line_total: number
          notes: string | null
          order_id: string
          product_id: string
          product_name: string
          product_type: Database["public"]["Enums"]["product_type"]
          quantity: number
          ready_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["table_item_status"]
          tax_rate: number
          tenant_id: string
          unit_price: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "table_order_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_delivery_status: {
        Args: {
          _courier_id?: string
          _order_id: string
          _status: Database["public"]["Enums"]["delivery_status"]
        }
        Returns: {
          address: string
          assigned_at: string | null
          branch_id: string
          courier_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          delivered_at: string | null
          delivery_fee: number
          id: string
          neighborhood: string | null
          notes: string | null
          sale_id: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "delivery_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "owner"
        | "admin"
        | "manager"
        | "cashier"
        | "kitchen"
        | "inventory"
        | "courier"
        | "staff"
        | "waiter"
      cash_session_status: "open" | "closed"
      delivery_status:
        | "received"
        | "preparing"
        | "ready"
        | "assigned"
        | "on_way"
        | "delivered"
        | "cancelled"
      entity_status: "active" | "inactive"
      movement_type:
        | "purchase"
        | "sale"
        | "production"
        | "waste"
        | "adjustment"
        | "transfer"
        | "return"
        | "consumption"
      payment_method: "cash" | "card" | "transfer" | "qr"
      product_type:
        | "simple"
        | "composite"
        | "production"
        | "combo"
        | "ingredient"
        | "modifier"
      production_status: "draft" | "in_progress" | "completed" | "cancelled"
      sale_status: "completed" | "cancelled" | "refunded" | "partially_refunded"
      sales_channel:
        | "pos"
        | "rappi"
        | "delivery"
        | "tables"
        | "didi"
        | "uber"
        | "whatsapp"
        | "qr"
      table_item_status:
        | "pending"
        | "preparing"
        | "ready"
        | "dispatched"
        | "cancelled"
      table_order_status: "open" | "sent_to_cashier" | "closed" | "cancelled"
      table_status: "available" | "occupied" | "reserved" | "inactive"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "owner",
        "admin",
        "manager",
        "cashier",
        "kitchen",
        "inventory",
        "courier",
        "staff",
        "waiter",
      ],
      cash_session_status: ["open", "closed"],
      delivery_status: [
        "received",
        "preparing",
        "ready",
        "assigned",
        "on_way",
        "delivered",
        "cancelled",
      ],
      entity_status: ["active", "inactive"],
      movement_type: [
        "purchase",
        "sale",
        "production",
        "waste",
        "adjustment",
        "transfer",
        "return",
        "consumption",
      ],
      payment_method: ["cash", "card", "transfer", "qr"],
      product_type: [
        "simple",
        "composite",
        "production",
        "combo",
        "ingredient",
        "modifier",
      ],
      production_status: ["draft", "in_progress", "completed", "cancelled"],
      sale_status: ["completed", "cancelled", "refunded", "partially_refunded"],
      sales_channel: ["pos", "rappi", "delivery", "tables", "didi", "uber", "whatsapp", "qr"],
      table_item_status: [
        "pending",
        "preparing",
        "ready",
        "dispatched",
        "cancelled",
      ],
      table_order_status: ["open", "sent_to_cashier", "closed", "cancelled"],
      table_status: ["available", "occupied", "reserved", "inactive"],
    },
  },
} as const
