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
      email_templates: {
        Row: {
          id: number
          status: string
          template_id: string
          subject: string
          visibility: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          status: string
          template_id: string
          subject: string
          visibility?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          status?: string
          template_id?: string
          subject?: string
          visibility?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      order_communications: {
        Row: {
          id: number
          order_id: number
          user_id: string | null
          user_email: string | null
          recipient_email: string
          subject: string | null
          body: string | null
          template_id: string | null
          visibility: string
          sent_at: string
        }
        Insert: {
          id?: number
          order_id: number
          user_id?: string | null
          user_email?: string | null
          recipient_email: string
          subject?: string | null
          body?: string | null
          template_id?: string | null
          visibility?: string
          sent_at?: string
        }
        Update: {
          id?: number
          order_id?: number
          user_id?: string | null
          user_email?: string | null
          recipient_email?: string
          subject?: string | null
          body?: string | null
          template_id?: string | null
          visibility?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_communications_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_communications_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      orders: {
        Row: {
          id: number
          order_number: string | null
          customer_name: string
          customer_email: string | null
          customer_phone: string | null
          customer_profile_url: string | null
          shipping_address: string | null
          design_name: string | null
          instructions: string | null
          production_file_urls: string[] | null
          shipping_attachment_urls: string[] | null
          design_size: string | null
          design_backing: string | null
          patches_type: string | null
          patches_quantity: number
          revision_notes: string | null
          customer_attachment_urls: string[] | null
          mockup_urls: string[] | null
          redo_notes: string | null
          redo_attachments: string[] | null
          packing: string | null
          shipping_carrier: string | null
          shipping_tracking_number: string | null
          order_amount: number
          amount_paid: number
          production_cost: number
          shipping_cost: number
          marketing_cost: number
          status: string
          reason_category: string | null
          reason_details: string | null
          profit: number
          sales_agent: string
          is_urgent: boolean
          is_urgent_approved: boolean | null
          lead_source: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: number
          order_number?: string | null
          customer_name: string
          customer_email?: string | null
          customer_phone?: string | null
          customer_profile_url?: string | null
          shipping_address?: string | null
          design_name?: string | null
          instructions?: string | null
          production_file_urls?: string[] | null
          shipping_attachment_urls?: string[] | null
          design_size?: string | null
          design_backing?: string | null
          patches_type?: string | null
          patches_quantity?: number
          revision_notes?: string | null
          customer_attachment_urls?: string[] | null
          mockup_urls?: string[] | null
          redo_notes?: string | null
          redo_attachments?: string[] | null
          packing?: string | null
          shipping_carrier?: string | null
          shipping_tracking_number?: string | null
          order_amount?: number
          amount_paid?: number
          production_cost?: number
          shipping_cost?: number
          marketing_cost?: number
          status?: string
          reason_category?: string | null
          reason_details?: string | null
          profit?: number
          sales_agent: string
          is_urgent?: boolean
          is_urgent_approved?: boolean | null
          lead_source?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: number
          order_number?: string | null
          customer_name?: string
          customer_email?: string | null
          customer_phone?: string | null
          customer_profile_url?: string | null
          shipping_address?: string | null
          design_name?: string | null
          instructions?: string | null
          production_file_urls?: string[] | null
          shipping_attachment_urls?: string[] | null
          design_size?: string | null
          design_backing?: string | null
          patches_type?: string | null
          patches_quantity?: number
          revision_notes?: string | null
          customer_attachment_urls?: string[] | null
          mockup_urls?: string[] | null
          redo_notes?: string | null
          redo_attachments?: string[] | null
          packing?: string | null
          shipping_carrier?: string | null
          shipping_tracking_number?: string | null
          order_amount?: number
          amount_paid?: number
          production_cost?: number
          shipping_cost?: number
          marketing_cost?: number
          status?: string
          reason_category?: string | null
          reason_details?: string | null
          profit?: number
          sales_agent?: string
          is_urgent?: boolean
          is_urgent_approved?: boolean | null
          lead_source?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      attendance_sessions: {
        Row: {
          id: string
          user_id: string | null
          user_email: string
          user_name: string | null
          clock_in_time: string
          clock_out_time: string | null
          duration_hours: number
          work_date: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          user_email: string
          user_name?: string | null
          clock_in_time: string
          clock_out_time?: string | null
          duration_hours?: number
          work_date: string
        }
        Update: {
          id?: string
          user_id?: string | null
          user_email?: string
          user_name?: string | null
          clock_in_time?: string
          clock_out_time?: string | null
          duration_hours?: number
          work_date?: string
        }
        Relationships: []
      }
      attendance_summary: {
        Row: {
          id: string
          user_id: string
          user_email: string
          user_name: string
          month: string
          total_days_worked: number
          total_hours: number
          late_days: number
          overtime_hours: number
          undertime_hours: number
          incomplete_days: number
          salary_status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          user_email: string
          user_name: string
          month: string
          total_days_worked?: number
          total_hours?: number
          late_days?: number
          overtime_hours?: number
          undertime_hours?: number
          incomplete_days?: number
          salary_status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          user_email?: string
          user_name?: string
          month?: string
          total_days_worked?: number
          total_hours?: number
          late_days?: number
          overtime_hours?: number
          undertime_hours?: number
          incomplete_days?: number
          salary_status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_summary_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      user_profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          role: string
          permissions: Json | null
          last_seen: string | null
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          role?: string
          permissions?: Json | null
          last_seen?: string | null
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          role?: string
          permissions?: Json | null
          last_seen?: string | null
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
      orders_with_details: {
        Row: {
          id: number | null
          orderNumber: string | null
          customerName: string | null
          customerEmail: string | null
          customerPhone: string | null
          customerProfileUrl: string | null
          shippingAddress: string | null
          designName: string | null
          instructions: string | null
          productionFileUrls: string[] | null
          shippingAttachmentUrls: string[] | null
          designSize: string | null
          designBacking: string | null
          patchesType: string | null
          patchesQuantity: number | null
          revisionNotes: string | null
          customerAttachmentUrls: string[] | null
          mockupUrls: string[] | null
          redoNotes: string | null
          redoAttachments: string[] | null
          packing: string | null
          shippingCarrier: string | null
          shippingTrackingNumber: string | null
          orderAmount: number | null
          amountPaid: number | null
          productionCost: number | null
          shippingCost: number | null
          marketingCost: number | null
          status: string | null
          reasonCategory: string | null
          reasonDetails: string | null
          profit: number | null
          salesAgent: string | null
          isUrgent: boolean | null
          isUrgentApproved: boolean | null
          leadSource: string | null
          createdAt: string | null
          updatedAt: string | null
          createdBy: string | null
          amountRemaining: number | null
        }
        Relationships: []
      }
      sales_agent_reports: {
        Row: {
          sales_agent: string | null
          totalSalesAmount: number | null
          totalProfit: number | null
          totalOrders: number | null
          totalAmountPaid: number | null
          totalAmountRemaining: number | null
          averageProfitPerOrder: number | null
          orders_by_status: Json | null
        }
        Relationships: []
      }
    }
    Functions: {
      generate_order_number: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      handle_updated_at: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      log_order_changes: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      check_production_updates: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      has_permission: {
        Args: {
          required_permission: string
        }
        Returns: boolean
      }
      handle_new_user: {
        Args: Record<PropertyKey, never>
        Returns: undefined
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
