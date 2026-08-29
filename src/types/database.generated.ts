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
      audit_log: {
        Row: {
          actor_id: string | null
          created_at: string
          diff: Json
          entity_id: string
          entity_type: string
          id: string
          operation: string
          organization_id: string
          record_id: string
          request_id: string | null
          source: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          diff: Json
          entity_id: string
          entity_type: string
          id?: string
          operation: string
          organization_id: string
          record_id: string
          request_id?: string | null
          source: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          diff?: Json
          entity_id?: string
          entity_type?: string
          id?: string
          operation?: string
          organization_id?: string
          record_id?: string
          request_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_documents: {
        Row: {
          amount: number | null
          customer_id: string
          document_date: string
          document_name: string
          document_type: Database["public"]["Enums"]["customer_document_type"]
          file_path: string
          id: string
          organization_id: string
          sales_order_id: string | null
          upload_attestation_version: string | null
          upload_attested_at: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          amount?: number | null
          customer_id: string
          document_date: string
          document_name: string
          document_type?: Database["public"]["Enums"]["customer_document_type"]
          file_path: string
          id?: string
          organization_id: string
          sales_order_id?: string | null
          upload_attestation_version?: string | null
          upload_attested_at?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          amount?: number | null
          customer_id?: string
          document_date?: string
          document_name?: string
          document_type?: Database["public"]["Enums"]["customer_document_type"]
          file_path?: string
          id?: string
          organization_id?: string
          sales_order_id?: string | null
          upload_attestation_version?: string | null
          upload_attested_at?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_documents_customer_id_organization_id_fkey"
            columns: ["customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "customer_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_documents_sales_order_id_customer_id_organization_id_f"
            columns: ["sales_order_id", "customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id", "customer_id", "organization_id"]
          },
          {
            foreignKeyName: "customer_documents_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_messages: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          message: string
          organization_id: string
          read_at: string | null
          sales_order_id: string | null
          sender_display_name: string
          sender_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          message: string
          organization_id: string
          read_at?: string | null
          sales_order_id?: string | null
          sender_display_name: string
          sender_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          message?: string
          organization_id?: string
          read_at?: string | null
          sales_order_id?: string | null
          sender_display_name?: string
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_messages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_messages_customer_id_organization_id_fkey"
            columns: ["customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "customer_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_messages_sales_order_id_customer_id_organization__fkey"
            columns: ["sales_order_id", "customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id", "customer_id", "organization_id"]
          },
          {
            foreignKeyName: "customer_messages_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_stage_mappings: {
        Row: {
          customer_stage_name: string
          organization_id: string
          routing_step_id: string
          sequence_number: number
          work_order_id: string
        }
        Insert: {
          customer_stage_name: string
          organization_id: string
          routing_step_id: string
          sequence_number: number
          work_order_id: string
        }
        Update: {
          customer_stage_name?: string
          organization_id?: string
          routing_step_id?: string
          sequence_number?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_stage_mappings_step_work_order_organization_fkey"
            columns: ["routing_step_id", "work_order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "routing_steps"
            referencedColumns: ["id", "work_order_id", "organization_id"]
          },
          {
            foreignKeyName: "customer_stage_mappings_work_order_organization_fkey"
            columns: ["work_order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          customer_name: string
          default_bill_to_address: string
          default_ship_to_address: string
          id: string
          logo_url: string | null
          organization_id: string
          portal_email_domain: string | null
          primary_address: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          default_bill_to_address?: string
          default_ship_to_address?: string
          id?: string
          logo_url?: string | null
          organization_id: string
          portal_email_domain?: string | null
          primary_address?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          default_bill_to_address?: string
          default_ship_to_address?: string
          id?: string
          logo_url?: string | null
          organization_id?: string
          portal_email_domain?: string | null
          primary_address?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          account_claim_name: string
          account_email_domain: string | null
          created_at: string
          id: string
          name: string
          onboarding_completed_at: string | null
          plant_timezone: string
          updated_at: string
        }
        Insert: {
          account_claim_name: string
          account_email_domain?: string | null
          created_at?: string
          id?: string
          name: string
          onboarding_completed_at?: string | null
          plant_timezone?: string
          updated_at?: string
        }
        Update: {
          account_claim_name?: string
          account_email_domain?: string | null
          created_at?: string
          id?: string
          name?: string
          onboarding_completed_at?: string | null
          plant_timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      production_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_routing_step_id: string | null
          id: string
          organization_id: string
          quantity: number
          request_id: string | null
          reversed_event_id: string | null
          routing_step_id: string
          to_routing_step_id: string | null
          work_order_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          from_routing_step_id?: string | null
          id?: string
          organization_id: string
          quantity: number
          request_id?: string | null
          reversed_event_id?: string | null
          routing_step_id: string
          to_routing_step_id?: string | null
          work_order_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          from_routing_step_id?: string | null
          id?: string
          organization_id?: string
          quantity?: number
          request_id?: string | null
          reversed_event_id?: string | null
          routing_step_id?: string
          to_routing_step_id?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_events_from_step_work_order_organization_fkey"
            columns: [
              "from_routing_step_id",
              "work_order_id",
              "organization_id",
            ]
            isOneToOne: false
            referencedRelation: "routing_steps"
            referencedColumns: ["id", "work_order_id", "organization_id"]
          },
          {
            foreignKeyName: "production_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_events_reversed_event_organization_fkey"
            columns: ["reversed_event_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "production_events"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "production_events_routing_step_work_order_organization_fkey"
            columns: ["routing_step_id", "work_order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "routing_steps"
            referencedColumns: ["id", "work_order_id", "organization_id"]
          },
          {
            foreignKeyName: "production_events_to_step_work_order_organization_fkey"
            columns: ["to_routing_step_id", "work_order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "routing_steps"
            referencedColumns: ["id", "work_order_id", "organization_id"]
          },
          {
            foreignKeyName: "production_events_work_order_id_organization_id_fkey"
            columns: ["work_order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      profiles: {
        Row: {
          activated_at: string | null
          created_at: string
          customer_id: string | null
          display_name: string
          email: string
          id: string
          invited_at: string | null
          invited_by: string | null
          is_super_admin: boolean
          organization_id: string
          position: string | null
          role: Database["public"]["Enums"]["profile_role"]
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          customer_id?: string | null
          display_name: string
          email: string
          id: string
          invited_at?: string | null
          invited_by?: string | null
          is_super_admin?: boolean
          organization_id: string
          position?: string | null
          role: Database["public"]["Enums"]["profile_role"]
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          customer_id?: string | null
          display_name?: string
          email?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_super_admin?: boolean
          organization_id?: string
          position?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_customer_organization_fkey"
            columns: ["customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      routing_operation_tools: {
        Row: {
          created_at: string
          id: string
          notes: string
          organization_id: string
          routing_operation_id: string
          sequence_number: number
          tool_assembly_id: string
          tool_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string
          organization_id: string
          routing_operation_id: string
          sequence_number: number
          tool_assembly_id: string
          tool_number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string
          organization_id?: string
          routing_operation_id?: string
          sequence_number?: number
          tool_assembly_id?: string
          tool_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routing_operation_tools_operation_organization_fkey"
            columns: ["routing_operation_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "routing_template_steps"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "routing_operation_tools_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routing_operation_tools_tool_assembly_id_organization_id_fkey"
            columns: ["tool_assembly_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "tool_assemblies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "routing_operation_tools_tool_assembly_id_organization_id_fkey"
            columns: ["tool_assembly_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "tool_assembly_status"
            referencedColumns: ["tool_assembly_id", "organization_id"]
          },
        ]
      }
      routing_steps: {
        Row: {
          created_at: string
          customer_stage_name: string
          id: string
          notes: string
          organization_id: string
          routing_step_name: string
          sequence_number: number
          updated_at: string
          work_instructions: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          customer_stage_name?: string
          id?: string
          notes?: string
          organization_id: string
          routing_step_name: string
          sequence_number: number
          updated_at?: string
          work_instructions?: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          customer_stage_name?: string
          id?: string
          notes?: string
          organization_id?: string
          routing_step_name?: string
          sequence_number?: number
          updated_at?: string
          work_instructions?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routing_steps_work_order_organization_fkey"
            columns: ["work_order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      routing_template_steps: {
        Row: {
          created_at: string
          customer_stage_name: string
          id: string
          organization_id: string
          routing_step_name: string
          routing_template_id: string
          sequence_number: number
          updated_at: string
          work_instructions: string
        }
        Insert: {
          created_at?: string
          customer_stage_name: string
          id?: string
          organization_id: string
          routing_step_name: string
          routing_template_id: string
          sequence_number: number
          updated_at?: string
          work_instructions?: string
        }
        Update: {
          created_at?: string
          customer_stage_name?: string
          id?: string
          organization_id?: string
          routing_step_name?: string
          routing_template_id?: string
          sequence_number?: number
          updated_at?: string
          work_instructions?: string
        }
        Relationships: [
          {
            foreignKeyName: "routing_template_steps_template_organization_fkey"
            columns: ["routing_template_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "routing_templates"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      routing_templates: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          organization_id: string
          template_name: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          organization_id: string
          template_name: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          template_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routing_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_line_items: {
        Row: {
          archived_at: string | null
          created_at: string
          creation_request_hash: string | null
          creation_request_id: string | null
          description: string
          flat_rate_amount: number | null
          id: string
          line_number: number
          line_total: number | null
          manufactured_item: boolean
          organization_id: string
          part_number: string | null
          pricing_type: string
          quantity: number
          sales_order_id: string
          sort_order: number
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          creation_request_hash?: string | null
          creation_request_id?: string | null
          description: string
          flat_rate_amount?: number | null
          id?: string
          line_number: number
          line_total?: number | null
          manufactured_item?: boolean
          organization_id: string
          part_number?: string | null
          pricing_type: string
          quantity?: number
          sales_order_id: string
          sort_order?: number
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          creation_request_hash?: string | null
          creation_request_id?: string | null
          description?: string
          flat_rate_amount?: number | null
          id?: string
          line_number?: number
          line_total?: number | null
          manufactured_item?: boolean
          organization_id?: string
          part_number?: string | null
          pricing_type?: string
          quantity?: number
          sales_order_id?: string
          sort_order?: number
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_line_items_sales_order_organization_fkey"
            columns: ["sales_order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          archived_at: string | null
          bill_to_address: string
          created_at: string
          creation_request_hash: string | null
          creation_request_id: string | null
          customer_address: string
          customer_id: string
          customer_name: string
          customer_po_number: string
          date_received: string
          id: string
          invoiced_at: string | null
          notes: string
          order_due_date: string
          organization_id: string
          sales_order_name: string
          sales_order_number: string
          ship_to_address: string
          shipped_at: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          bill_to_address?: string
          created_at?: string
          creation_request_hash?: string | null
          creation_request_id?: string | null
          customer_address?: string
          customer_id: string
          customer_name: string
          customer_po_number: string
          date_received: string
          id?: string
          invoiced_at?: string | null
          notes?: string
          order_due_date: string
          organization_id: string
          sales_order_name: string
          sales_order_number: string
          ship_to_address?: string
          shipped_at?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          bill_to_address?: string
          created_at?: string
          creation_request_hash?: string | null
          creation_request_id?: string | null
          customer_address?: string
          customer_id?: string
          customer_name?: string
          customer_po_number?: string
          date_received?: string
          id?: string
          invoiced_at?: string | null
          notes?: string
          order_due_date?: string
          organization_id?: string
          sales_order_name?: string
          sales_order_number?: string
          ship_to_address?: string
          shipped_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_customer_id_organization_id_fkey"
            columns: ["customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_assemblies: {
        Row: {
          archived_at: string | null
          assembly_number: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          image_path: string | null
          notes: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assembly_number: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          image_path?: string | null
          notes?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assembly_number?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          image_path?: string | null
          notes?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_assemblies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_checkout_transactions: {
        Row: {
          actor_display_name: string
          actor_id: string | null
          created_at: string
          event_sequence: number
          id: string
          note: string
          organization_id: string
          request_hash: string
          request_id: string
          tool_assembly_id: string
          transaction_type: string
        }
        Insert: {
          actor_display_name: string
          actor_id?: string | null
          created_at?: string
          event_sequence?: never
          id?: string
          note?: string
          organization_id: string
          request_hash: string
          request_id: string
          tool_assembly_id: string
          transaction_type: string
        }
        Update: {
          actor_display_name?: string
          actor_id?: string | null
          created_at?: string
          event_sequence?: never
          id?: string
          note?: string
          organization_id?: string
          request_hash?: string
          request_id?: string
          tool_assembly_id?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_checkout_transactions_tool_assembly_id_organization_i_fkey"
            columns: ["tool_assembly_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "tool_assemblies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tool_checkout_transactions_tool_assembly_id_organization_i_fkey"
            columns: ["tool_assembly_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "tool_assembly_status"
            referencedColumns: ["tool_assembly_id", "organization_id"]
          },
        ]
      }
      user_invitations: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          customer_id: string | null
          display_name: string
          email: string
          id: string
          invited_by: string | null
          organization_id: string
          position: string | null
          role: Database["public"]["Enums"]["profile_role"]
          user_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          display_name: string
          email: string
          id?: string
          invited_by?: string | null
          organization_id: string
          position?: string | null
          role: Database["public"]["Enums"]["profile_role"]
          user_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          display_name?: string
          email?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          position?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_invitations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invitations_customer_id_organization_id_fkey"
            columns: ["customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "user_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_operation_tools: {
        Row: {
          created_at: string
          id: string
          notes: string
          organization_id: string
          sequence_number: number
          source_routing_operation_tool_id: string | null
          tool_assembly_id: string
          tool_number: string
          updated_at: string
          work_order_operation_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string
          organization_id: string
          sequence_number: number
          source_routing_operation_tool_id?: string | null
          tool_assembly_id: string
          tool_number: string
          updated_at?: string
          work_order_operation_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string
          organization_id?: string
          sequence_number?: number
          source_routing_operation_tool_id?: string | null
          tool_assembly_id?: string
          tool_number?: string
          updated_at?: string
          work_order_operation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_operation_tools_operation_organization_fkey"
            columns: ["work_order_operation_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "routing_steps"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "work_order_operation_tools_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_operation_tools_source_organization_fkey"
            columns: ["source_routing_operation_tool_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "routing_operation_tools"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "work_order_operation_tools_tool_assembly_id_organization_i_fkey"
            columns: ["tool_assembly_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "tool_assemblies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "work_order_operation_tools_tool_assembly_id_organization_i_fkey"
            columns: ["tool_assembly_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "tool_assembly_status"
            referencedColumns: ["tool_assembly_id", "organization_id"]
          },
        ]
      }
      work_orders: {
        Row: {
          archived_at: string | null
          completion_date: string | null
          created_at: string
          creation_request_hash: string | null
          creation_request_id: string | null
          due_date: string
          id: string
          notes: string
          organization_id: string
          part_number: string
          quantity_ordered: number
          released_at: string
          sales_order_id: string
          sales_order_line_item_id: string
          updated_at: string
          work_order_name: string
          work_order_number: string
        }
        Insert: {
          archived_at?: string | null
          completion_date?: string | null
          created_at?: string
          creation_request_hash?: string | null
          creation_request_id?: string | null
          due_date: string
          id?: string
          notes?: string
          organization_id: string
          part_number: string
          quantity_ordered: number
          released_at?: string
          sales_order_id: string
          sales_order_line_item_id: string
          updated_at?: string
          work_order_name: string
          work_order_number: string
        }
        Update: {
          archived_at?: string | null
          completion_date?: string | null
          created_at?: string
          creation_request_hash?: string | null
          creation_request_id?: string | null
          due_date?: string
          id?: string
          notes?: string
          organization_id?: string
          part_number?: string
          quantity_ordered?: number
          released_at?: string
          sales_order_id?: string
          sales_order_line_item_id?: string
          updated_at?: string
          work_order_name?: string
          work_order_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_line_order_organization_fkey"
            columns: [
              "sales_order_line_item_id",
              "sales_order_id",
              "organization_id",
            ]
            isOneToOne: false
            referencedRelation: "sales_order_line_items"
            referencedColumns: ["id", "sales_order_id", "organization_id"]
          },
          {
            foreignKeyName: "work_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_sales_order_id_organization_id_fkey"
            columns: ["sales_order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
    }
    Views: {
      tool_assembly_status: {
        Row: {
          future_requirements: number | null
          organization_id: string | null
          quantity_checked_out: number | null
          quantity_in_use: number | null
          tool_assembly_id: string | null
          usage_warning: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "tool_assemblies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_my_profile: { Args: never; Returns: undefined }
      add_sales_order_line: {
        Args: { p_line: Json; p_sales_order_id: string }
        Returns: string
      }
      cancel_user_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      claim_shop_account: {
        Args: {
          p_display_name: string
          p_organization_name: string
          p_plant_timezone: string
        }
        Returns: Json
      }
      complete_my_organization_onboarding: {
        Args: { p_organization_name: string; p_plant_timezone: string }
        Returns: Json
      }
      complete_user_invitation: {
        Args: { p_invitation_id: string; p_user_id: string }
        Returns: undefined
      }
      create_sales_order: {
        Args: { p_lines: Json; p_order: Json }
        Returns: string
      }
      create_user_invitation:
        | {
            Args: {
              p_customer_id?: string
              p_display_name: string
              p_email: string
              p_role: Database["public"]["Enums"]["profile_role"]
            }
            Returns: Json
          }
        | {
            Args: {
              p_customer_id: string
              p_display_name: string
              p_email: string
              p_position: string
              p_role: Database["public"]["Enums"]["profile_role"]
            }
            Returns: Json
          }
      create_work_order: {
        Args: { p_routing: Json; p_work_order: Json }
        Returns: string
      }
      customer_portal_sales_order_lines: {
        Args: never
        Returns: {
          description: string
          id: string
          line_number: number
          manufactured_item: boolean
          part_number: string
          quantity: number
          sales_order_id: string
          sort_order: number
        }[]
      }
      customer_portal_sales_orders: {
        Args: never
        Returns: {
          customer_completed: boolean
          customer_id: string
          customer_name: string
          customer_po_number: string
          date_received: string
          id: string
          invoiced_at: string
          order_due_date: string
          organization_id: string
          sales_order_name: string
          shipped_at: string
        }[]
      }
      customer_portal_work_orders: {
        Args: never
        Returns: {
          completion_date: string
          customer_progress_percent: number
          customer_stage_name: string
          due_date: string
          id: string
          organization_id: string
          part_number: string
          quantity_ordered: number
          sales_order_id: string
          sales_order_line_item_id: string
        }[]
      }
      dashboard_metrics: {
        Args: { p_bucket?: string; p_end_date?: string; p_start_date?: string }
        Returns: Json
      }
      dashboard_production_complete_open_orders: {
        Args: never
        Returns: {
          customer_name: string
          customer_po_number: string
          invoiced_at: string
          order_due_date: string
          production_completed_at: string
          sales_order_id: string
          sales_order_name: string
          shipped_at: string
        }[]
      }
      mark_sales_order_milestone: {
        Args: { p_milestone: string; p_sales_order_id: string }
        Returns: string
      }
      production_step_snapshot: {
        Args: { p_routing_step_id: string; p_work_order_id: string }
        Returns: {
          archived_at: string
          available: number
          next_step_id: string
          next_step_name: string
          part_number: string
          routing_step_name: string
          scrapped: number
          sequence_number: number
          step_id: string
          transferred: number
          work_order_id: string
          work_order_name: string
        }[]
      }
      production_tool_checkout_requirements: {
        Args: { p_routing_step_id: string; p_work_order_id: string }
        Returns: {
          assembly_number: string
          checked_out: boolean
          operation_role: string
          routing_step_id: string
          routing_step_name: string
          sequence_number: number
          tool_assembly_id: string
          tool_description: string
          tool_name: string
        }[]
      }
      record_production_event: {
        Args: {
          p_event_type: string
          p_quantity: number
          p_routing_step_id: string
          p_to_routing_step_id?: string
          p_work_order_id: string
        }
        Returns: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_routing_step_id: string | null
          id: string
          organization_id: string
          quantity: number
          request_id: string | null
          reversed_event_id: string | null
          routing_step_id: string
          to_routing_step_id: string | null
          work_order_id: string
        }
        SetofOptions: {
          from: "*"
          to: "production_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_production_event_v2: {
        Args: {
          p_event_type: string
          p_quantity: number
          p_request_id: string
          p_routing_step_id: string
          p_to_routing_step_id: string
          p_work_order_id: string
        }
        Returns: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_routing_step_id: string | null
          id: string
          organization_id: string
          quantity: number
          request_id: string | null
          reversed_event_id: string | null
          routing_step_id: string
          to_routing_step_id: string | null
          work_order_id: string
        }
        SetofOptions: {
          from: "*"
          to: "production_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_tool_checkout: {
        Args: {
          p_note: string
          p_quantity: number
          p_request_id: string
          p_tool_assembly_id: string
          p_transaction_type: string
        }
        Returns: string
      }
      remove_user_access: { Args: { p_user_id: string }; Returns: string }
      reverse_production_event: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      save_routing_operation_tools: {
        Args: { p_routing_operation_id: string; p_tools: Json }
        Returns: undefined
      }
      save_routing_template: {
        Args: {
          p_organization_id: string
          p_steps: Json
          p_template_id: string
          p_template_name: string
        }
        Returns: string
      }
      save_tool_assembly: {
        Args: {
          p_assembly_number: string
          p_description: string
          p_notes: string
          p_organization_id: string
          p_quantity_owned: number
          p_tool_assembly_id: string
        }
        Returns: string
      }
      save_work_order_operation_tools: {
        Args: { p_tools: Json; p_work_order_operation_id: string }
        Returns: undefined
      }
      set_routing_template_archived: {
        Args: { p_archived: boolean; p_template_id: string }
        Returns: undefined
      }
      set_sales_order_archived: {
        Args: { p_archived: boolean; p_sales_order_id: string }
        Returns: string
      }
      set_sales_order_line_archived: {
        Args: { p_archived: boolean; p_line_id: string }
        Returns: string
      }
      set_tool_assembly_archived: {
        Args: { p_archived: boolean; p_tool_assembly_id: string }
        Returns: undefined
      }
      set_tool_assembly_image: {
        Args: { p_image_path: string; p_tool_assembly_id: string }
        Returns: string
      }
      set_work_order_archived: {
        Args: { p_archived: boolean; p_work_order_id: string }
        Returns: string
      }
      update_sales_order_line: {
        Args: { p_line: Json; p_line_id: string }
        Returns: undefined
      }
      update_work_order: {
        Args: {
          p_due_date: string
          p_notes: string
          p_routing: Json
          p_work_order_id: string
        }
        Returns: undefined
      }
      work_order_step_metrics: {
        Args: { p_work_order_ids: string[] }
        Returns: {
          available: number
          completed_at: string
          entered: number
          entered_at: string
          processed: number
          scrapped: number
          started_at: string
          step_id: string
          transferred: number
          work_order_id: string
        }[]
      }
    }
    Enums: {
      customer_document_type: "customer_po" | "invoice" | "drawing" | "other"
      profile_role: "manufacturer" | "customer"
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
      customer_document_type: ["customer_po", "invoice", "drawing", "other"],
      profile_role: ["manufacturer", "customer"],
    },
  },
} as const
