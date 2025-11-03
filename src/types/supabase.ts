export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      monthly_costs: {
        Row: {
          added_by: string | null
          amount: number
          category: string
          created_at: string
          id: number
          month_year: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          amount: number
          category: string
          created_at?: string
          id?: number
          month_year: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          amount?: number
          category?: string
          created_at?: string
          id?: number
          month_year?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_costs_added_by_fkey"
            columns: ["added_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      order_history: {
        Row: {
          changed_at: string
          field_changed: string
          id: number
          new_value: string | null
          old_value: string | null
          order_id: number
          user_email: string
        }
        Insert: {
          changed_at?: string
          field_changed: string
          id?: number
          new_value?: string | null
          old_value?: string | null
          order_id: number
          user_email: string
        }
        Update: {
          changed_at?: string
          field_changed?: string
          id?: number
          new_value?: string | null
          old_value?: string | null
          order_id?: number
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_history_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          }
        ]
      }
      orders: {
        Row: {
          amount_paid: number
          courier: string | null
          created_at: string
          created_by: string | null
          customer_attachment_urls: string[] | null
          customer_email: string
          customer_name: string
          customer_phone: string | null
          customer_profile_url: string | null
          design_backing: string | null
          design_name: string
          design_size: string | null
          id: number
          instructions: string | null
          is_urgent_approved: boolean
          is_urgent: boolean
          lead_source: string | null
          mockup_urls: string[] | null
          order_amount: number
          order_number: string
          packing: string | null
          patches_quantity: number
          patches_type: string | null
          redo_attachments: string[] | null
          redo_notes: string | null
          revision_notes: string | null
          sales_agent: string
          shipping_address: string | null
          status: string
          tracking_number: string | null
          updated_at: string
          amount_remaining: number
        }
        Insert: {
          amount_paid?: number
          courier?: string | null
          created_at?: string
          created_by?: string | null
          customer_attachment_urls?: string[] | null
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          customer_profile_url?: string | null
          design_backing?: string | null
          design_name: string
          design_size?: string | null
          id?: number
          instructions?: string | null
          is_urgent_approved?: boolean
          is_urgent?: boolean
          lead_source?: string | null
          mockup_urls?: string[] | null
          order_amount?: number
          order_number: string
          packing?: string | null
          patches_quantity: number
          patches_type?: string | null
          redo_attachments?: string[] | null
          redo_notes?: string | null
          revision_notes?: string | null
          sales_agent: string
          shipping_address?: string | null
          status: string
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          courier?: string | null
          created_at?: string
          created_by?: string | null
          customer_attachment_urls?: string[] | null
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          customer_profile_url?: string | null
          design_backing?: string | null
          design_name?: string
          design_size?: string | null
          id?: number
          instructions?: string | null
          is_urgent_approved?: boolean
          is_urgent?: boolean
          lead_source?: string | null
          mockup_urls?: string[] | null
          order_amount?: number
          order_number?: string
          packing?: string | null
          patches_quantity?: number
          patches_type?: string | null
          redo_attachments?: string[] | null
          redo_notes?: string | null
          revision_notes?: string | null
          sales_agent?: string
          shipping_address?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      user_profiles: {
        Row: {
          email: string | null
          id: string
          role: string
        }
        Insert: {
          email?: string | null
          id: string
          role?: string
        }
        Update: {
          email?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_id_fkey"
            columns: ["id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_sales_report: {
        Args: {
          start_date: string
          end_date: string
        }
        Returns: {
          total_revenue: number
          total_orders: number
          total_collected: number
          sales_by_agent: Json
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}