export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      ads: {
        Row: {
          created_at: string | null;
          display_order: number;
          ends_at: string | null;
          id: string;
          image_url: string;
          is_active: boolean;
          link_url: string | null;
          media_type: string;
          placement: string;
          starts_at: string | null;
          title: string;
        };
        Insert: {
          created_at?: string | null;
          display_order?: number;
          ends_at?: string | null;
          id?: string;
          image_url: string;
          is_active?: boolean;
          link_url?: string | null;
          media_type?: string;
          placement?: string;
          starts_at?: string | null;
          title?: string;
        };
        Update: {
          created_at?: string | null;
          display_order?: number;
          ends_at?: string | null;
          id?: string;
          image_url?: string;
          is_active?: boolean;
          link_url?: string | null;
          media_type?: string;
          placement?: string;
          starts_at?: string | null;
          title?: string;
        };
        Relationships: [];
      };
      animal_entries: {
        Row: {
          created_at: string | null;
          game_id: string;
          id: string;
          label: string | null;
          name: string;
          number: number;
        };
        Insert: {
          created_at?: string | null;
          game_id: string;
          id?: string;
          label?: string | null;
          name: string;
          number: number;
        };
        Update: {
          created_at?: string | null;
          game_id?: string;
          id?: string;
          label?: string | null;
          name?: string;
          number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "animal_entries_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      animal_images: {
        Row: {
          animal_number: number;
          game_id: string | null;
          id: string;
          image_url: string;
          updated_at: string | null;
        };
        Insert: {
          animal_number: number;
          game_id?: string | null;
          id?: string;
          image_url: string;
          updated_at?: string | null;
        };
        Update: {
          animal_number?: number;
          game_id?: string | null;
          id?: string;
          image_url?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "animal_images_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      app_settings: {
        Row: {
          background_color: string;
          base_font_size: number;
          card_color: string;
          font_family: string;
          id: string;
          primary_color: string;
          result_row_color: string;
          rotation_enabled: boolean;
          rotation_interval_seconds: number;
          start_view: string;
          surface_color: string;
          text_color: string;
          updated_at: string;
        };
        Insert: {
          background_color?: string;
          base_font_size?: number;
          card_color?: string;
          font_family?: string;
          id?: string;
          primary_color?: string;
          result_row_color?: string;
          rotation_enabled?: boolean;
          rotation_interval_seconds?: number;
          start_view?: string;
          surface_color?: string;
          text_color?: string;
          updated_at?: string;
        };
        Update: {
          background_color?: string;
          base_font_size?: number;
          card_color?: string;
          font_family?: string;
          id?: string;
          primary_color?: string;
          result_row_color?: string;
          rotation_enabled?: boolean;
          rotation_interval_seconds?: number;
          start_view?: string;
          surface_color?: string;
          text_color?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      games: {
        Row: {
          color: string;
          created_at: string;
          display_order: number;
          id: string;
          is_active: boolean;
          loading_mode: string;
          logo_url: string | null;
          name: string;
          slug: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          loading_mode?: string;
          logo_url?: string | null;
          name: string;
          slug: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          loading_mode?: string;
          logo_url?: string | null;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          subscription_expires_at: string | null;
          subscription_status: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id: string;
          subscription_expires_at?: string | null;
          subscription_status?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          subscription_expires_at?: string | null;
          subscription_status?: string;
        };
        Relationships: [];
      };
      results: {
        Row: {
          animal_name: string;
          animal_number: number;
          created_at: string;
          draw_date: string;
          draw_time: string;
          game_id: string;
          id: string;
          source: string;
        };
        Insert: {
          animal_name: string;
          animal_number: number;
          created_at?: string;
          draw_date: string;
          draw_time: string;
          game_id: string;
          id?: string;
          source?: string;
        };
        Update: {
          animal_name?: string;
          animal_number?: number;
          created_at?: string;
          draw_date?: string;
          draw_time?: string;
          game_id?: string;
          id?: string;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "results_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_admin: { Args: never; Returns: boolean };
      set_subscription_status: {
        Args: {
          new_expires_at?: string;
          new_status: string;
          target_user_id: string;
        };
        Returns: undefined;
      };
      sync_automatic_result: {
        Args: {
          p_animal_name: string;
          p_animal_number: number;
          p_draw_date: string;
          p_draw_time: string;
          p_game_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "viewer";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "viewer"],
    },
  },
} as const;
