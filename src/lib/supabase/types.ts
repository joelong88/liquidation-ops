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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      batch: {
        Row: {
          batch_id: number
          batch_number: number
          batch_type: string
          ceiling_price: number | null
          channel: string
          created_at: string
          created_by: string | null
          floor_price: number | null
          month: string | null
          priced_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          batch_id?: number
          batch_number: number
          batch_type?: string
          ceiling_price?: number | null
          channel?: string
          created_at?: string
          created_by?: string | null
          floor_price?: number | null
          month?: string | null
          priced_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          batch_id?: number
          batch_number?: number
          batch_type?: string
          ceiling_price?: number | null
          channel?: string
          created_at?: string
          created_by?: string | null
          floor_price?: number | null
          month?: string | null
          priced_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      cod_sync_snapshot: {
        Row: {
          cod_amount: number | null
          global_shipper_id: string | null
          granular_status: string | null
          id: number
          is_phone_case: boolean | null
          item_description: string | null
          order_id: string | null
          raw_payload: Json | null
          shipper_name: string | null
          synced_at: string
          tid: string
        }
        Insert: {
          cod_amount?: number | null
          global_shipper_id?: string | null
          granular_status?: string | null
          id?: number
          is_phone_case?: boolean | null
          item_description?: string | null
          order_id?: string | null
          raw_payload?: Json | null
          shipper_name?: string | null
          synced_at?: string
          tid: string
        }
        Update: {
          cod_amount?: number | null
          global_shipper_id?: string | null
          granular_status?: string | null
          id?: number
          is_phone_case?: boolean | null
          item_description?: string | null
          order_id?: string | null
          raw_payload?: Json | null
          shipper_name?: string | null
          synced_at?: string
          tid?: string
        }
        Relationships: []
      }
      expected_arrival: {
        Row: {
          id: number
          pets_reason: string | null
          pets_ticket_id: string | null
          raw_payload: Json | null
          source_system: string
          synced_at: string
          tid: string
        }
        Insert: {
          id?: number
          pets_reason?: string | null
          pets_ticket_id?: string | null
          raw_payload?: Json | null
          source_system?: string
          synced_at?: string
          tid: string
        }
        Update: {
          id?: number
          pets_reason?: string | null
          pets_ticket_id?: string | null
          raw_payload?: Json | null
          source_system?: string
          synced_at?: string
          tid?: string
        }
        Relationships: [
          {
            foreignKeyName: "expected_arrival_tid_fkey"
            columns: ["tid"]
            isOneToOne: false
            referencedRelation: "parcel"
            referencedColumns: ["tid"]
          },
        ]
      }
      parcel: {
        Row: {
          batch_id: number | null
          cod_source: string | null
          cod_synced_at: string | null
          cod_value: number | null
          created_at: string
          current_stage: string
          hold_forced_at: string | null
          hold_forced_by: string | null
          hold_forced_reason: string | null
          hold_forced_success: boolean
          hold_until: string | null
          is_synthetic_tid: boolean
          item_type: string | null
          order_id: string | null
          pallet_code: string | null
          parcel_category: string | null
          pets_resolved: boolean | null
          pets_ticket_outcome: string | null
          pets_ticket_type: string | null
          received_at: string | null
          shipper_segment: string
          tid: string
          updated_at: string
        }
        Insert: {
          batch_id?: number | null
          cod_source?: string | null
          cod_synced_at?: string | null
          cod_value?: number | null
          created_at?: string
          current_stage?: string
          hold_forced_at?: string | null
          hold_forced_by?: string | null
          hold_forced_reason?: string | null
          hold_forced_success?: boolean
          hold_until?: string | null
          is_synthetic_tid?: boolean
          item_type?: string | null
          order_id?: string | null
          pallet_code?: string | null
          parcel_category?: string | null
          pets_resolved?: boolean | null
          pets_ticket_outcome?: string | null
          pets_ticket_type?: string | null
          received_at?: string | null
          shipper_segment?: string
          tid: string
          updated_at?: string
        }
        Update: {
          batch_id?: number | null
          cod_source?: string | null
          cod_synced_at?: string | null
          cod_value?: number | null
          created_at?: string
          current_stage?: string
          hold_forced_at?: string | null
          hold_forced_by?: string | null
          hold_forced_reason?: string | null
          hold_forced_success?: boolean
          hold_until?: string | null
          is_synthetic_tid?: boolean
          item_type?: string | null
          order_id?: string | null
          pallet_code?: string | null
          parcel_category?: string | null
          pets_resolved?: boolean | null
          pets_ticket_outcome?: string | null
          pets_ticket_type?: string | null
          received_at?: string | null
          shipper_segment?: string
          tid?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parcel_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batch"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "parcel_current_stage_fkey"
            columns: ["current_stage"]
            isOneToOne: false
            referencedRelation: "ref_stage"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "parcel_item_type_fkey"
            columns: ["item_type"]
            isOneToOne: false
            referencedRelation: "ref_item_type"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "parcel_parcel_category_fkey"
            columns: ["parcel_category"]
            isOneToOne: false
            referencedRelation: "ref_parcel_category"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "parcel_shipper_segment_fkey"
            columns: ["shipper_segment"]
            isOneToOne: false
            referencedRelation: "ref_shipper_segment"
            referencedColumns: ["code"]
          },
        ]
      }
      profile: {
        Row: {
          full_name: string | null
          id: string
          is_active: boolean
          role: string
        }
        Insert: {
          full_name?: string | null
          id: string
          is_active?: boolean
          role: string
        }
        Update: {
          full_name?: string | null
          id?: string
          is_active?: boolean
          role?: string
        }
        Relationships: []
      }
      ref_item_type: {
        Row: {
          code: string
          label: string
        }
        Insert: {
          code: string
          label: string
        }
        Update: {
          code?: string
          label?: string
        }
        Relationships: []
      }
      ref_parcel_category: {
        Row: {
          code: string
          for_liquidation: boolean
          label: string
          next_action: string | null
          outgoing_status_map: string | null
        }
        Insert: {
          code: string
          for_liquidation: boolean
          label: string
          next_action?: string | null
          outgoing_status_map?: string | null
        }
        Update: {
          code?: string
          for_liquidation?: boolean
          label?: string
          next_action?: string | null
          outgoing_status_map?: string | null
        }
        Relationships: []
      }
      ref_shipper_segment: {
        Row: {
          code: string
          hold_days: number
          is_active: boolean
          label: string
        }
        Insert: {
          code: string
          hold_days?: number
          is_active?: boolean
          label: string
        }
        Update: {
          code?: string
          hold_days?: number
          is_active?: boolean
          label?: string
        }
        Relationships: []
      }
      ref_stage: {
        Row: {
          code: string
          label: string
          requires_hold_check: boolean
          seq_order: number
        }
        Insert: {
          code: string
          label: string
          requires_hold_check?: boolean
          seq_order: number
        }
        Update: {
          code?: string
          label?: string
          requires_hold_check?: boolean
          seq_order?: number
        }
        Relationships: []
      }
      sale: {
        Row: {
          batch_id: number | null
          buyer_id: string | null
          buyer_name: string | null
          channel: string
          created_at: string
          created_by: string | null
          payment_date: string | null
          payment_status: string
          sale_amount: number
          sale_id: number
          tid: string | null
        }
        Insert: {
          batch_id?: number | null
          buyer_id?: string | null
          buyer_name?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          payment_date?: string | null
          payment_status?: string
          sale_amount: number
          sale_id?: number
          tid?: string | null
        }
        Update: {
          batch_id?: number | null
          buyer_id?: string | null
          buyer_name?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          payment_date?: string | null
          payment_status?: string
          sale_amount?: number
          sale_id?: number
          tid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batch"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "sale_tid_fkey"
            columns: ["tid"]
            isOneToOne: false
            referencedRelation: "parcel"
            referencedColumns: ["tid"]
          },
        ]
      }
      stage_event: {
        Row: {
          created_at: string
          event_id: number
          event_ts: string
          metadata: Json | null
          scanned_by: string | null
          stage: string
          station: string | null
          tid: string
        }
        Insert: {
          created_at?: string
          event_id?: number
          event_ts?: string
          metadata?: Json | null
          scanned_by?: string | null
          stage: string
          station?: string | null
          tid: string
        }
        Update: {
          created_at?: string
          event_id?: number
          event_ts?: string
          metadata?: Json | null
          scanned_by?: string | null
          stage?: string
          station?: string | null
          tid?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_event_stage_fkey"
            columns: ["stage"]
            isOneToOne: false
            referencedRelation: "ref_stage"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "stage_event_tid_fkey"
            columns: ["tid"]
            isOneToOne: false
            referencedRelation: "parcel"
            referencedColumns: ["tid"]
          },
        ]
      }
      sync_run: {
        Row: {
          completed_at: string | null
          error_detail: string | null
          id: number
          job_name: string
          records_seen: number | null
          records_upserted: number | null
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          error_detail?: string | null
          id?: number
          job_name: string
          records_seen?: number | null
          records_upserted?: number | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          error_detail?: string | null
          id?: number
          job_name?: string
          records_seen?: number | null
          records_upserted?: number | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_app_role: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
