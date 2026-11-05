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
    PostgrestVersion: "14.18"
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
      dispute_evidence: {
        Row: {
          created_at: string
          id: string
          kind: string
          note: string | null
          order_pda: string
          storage_path: string | null
          uploader_pubkey: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          note?: string | null
          order_pda: string
          storage_path?: string | null
          uploader_pubkey: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          order_pda?: string
          storage_path?: string | null
          uploader_pubkey?: string
        }
        Relationships: []
      }
      listings: {
        Row: {
          amount_units: number
          created_at: string
          description: string | null
          id: string
          listing_hash: string | null
          order_id: number
          order_pda: string | null
          photo_paths: string[]
          publication: string
          seller_pubkey: string
          title: string
        }
        Insert: {
          amount_units: number
          created_at?: string
          description?: string | null
          id?: string
          listing_hash?: string | null
          order_id: number
          order_pda?: string | null
          photo_paths: string[]
          publication?: string
          seller_pubkey: string
          title: string
        }
        Update: {
          amount_units?: number
          created_at?: string
          description?: string | null
          id?: string
          listing_hash?: string | null
          order_id?: number
          order_pda?: string | null
          photo_paths?: string[]
          publication?: string
          seller_pubkey?: string
          title?: string
        }
        Relationships: []
      }
      order_events: {
        Row: {
          block_time: string | null
          event_index: number
          event_type: string
          order_pda: string
          payload: Json
          signature: string
          slot: number
        }
        Insert: {
          block_time?: string | null
          event_index: number
          event_type: string
          order_pda: string
          payload?: Json
          signature: string
          slot: number
        }
        Update: {
          block_time?: string | null
          event_index?: number
          event_type?: string
          order_pda?: string
          payload?: Json
          signature?: string
          slot?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          privy_user_id: string
          wallet_pubkey: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          privy_user_id: string
          wallet_pubkey: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          privy_user_id?: string
          wallet_pubkey?: string
        }
        Relationships: []
      }
      shipments: {
        Row: {
          carrier: string
          created_at: string
          order_pda: string
          tracking_number: string
        }
        Insert: {
          carrier: string
          created_at?: string
          order_pda: string
          tracking_number: string
        }
        Update: {
          carrier?: string
          created_at?: string
          order_pda?: string
          tracking_number?: string
        }
        Relationships: []
      }
      shipping_info: {
        Row: {
          buyer_pubkey: string
          city: string
          created_at: string
          full_name: string
          notes: string | null
          order_pda: string
          phone: string
          postal_code: string
          province: string
          street: string
        }
        Insert: {
          buyer_pubkey: string
          city: string
          created_at?: string
          full_name: string
          notes?: string | null
          order_pda: string
          phone: string
          postal_code: string
          province: string
          street: string
        }
        Update: {
          buyer_pubkey?: string
          city?: string
          created_at?: string
          full_name?: string
          notes?: string | null
          order_pda?: string
          phone?: string
          postal_code?: string
          province?: string
          street?: string
        }
        Relationships: []
      }
      sponsor_usage: {
        Row: {
          count: number
          day: string
          privy_user_id: string
        }
        Insert: {
          count?: number
          day: string
          privy_user_id: string
        }
        Update: {
          count?: number
          day?: string
          privy_user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      metrics: {
        Row: {
          completion_rate: number | null
          conversion_rate: number | null
          disputes_open: number | null
          disputes_opened: number | null
          disputes_resolved: number | null
          links_created: number | null
          links_paid: number | null
          orders_released: number | null
          volume_units: number | null
        }
        Relationships: []
      }
      reputation: {
        Row: {
          disputes_lost_as_buyer: number | null
          pubkey: string | null
          purchases_completed: number | null
          sales_completed: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      increment_sponsor_usage: {
        Args: { p_day: string; p_user: string }
        Returns: number
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
