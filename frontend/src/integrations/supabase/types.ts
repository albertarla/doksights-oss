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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ai_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_sessions: {
        Row: {
          chat_type: string
          classification_attempts: number
          company_id: string
          conclusion: string | null
          created_at: string
          error_message: string | null
          id: string
          label: string | null
          manual_id: string | null
          theme_id: string | null
          updated_at: string
        }
        Insert: {
          chat_type: string
          classification_attempts?: number
          company_id: string
          conclusion?: string | null
          created_at?: string
          error_message?: string | null
          id: string
          label?: string | null
          manual_id?: string | null
          theme_id?: string | null
          updated_at?: string
        }
        Update: {
          chat_type?: string
          classification_attempts?: number
          company_id?: string
          conclusion?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          label?: string | null
          manual_id?: string | null
          theme_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_chat_sessions_manual_id_fkey"
            columns: ["manual_id"]
            isOneToOne: false
            referencedRelation: "manuals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_chat_sessions_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "ai_chat_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_themes: {
        Row: {
          company_id: string
          created_at: string
          embedding: string | null
          id: string
          label: string
          needs_retitle: boolean
          session_count: number
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          embedding?: string | null
          id?: string
          label: string
          needs_retitle?: boolean
          session_count?: number
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          embedding?: string | null
          id?: string
          label?: string
          needs_retitle?: boolean
          session_count?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_themes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_token_usage_logs: {
        Row: {
          company_id: string
          completion_tokens: number
          created_at: string
          feature: string
          id: string
          model: string
          prompt_tokens: number
          related_id: string | null
          total_tokens: number
        }
        Insert: {
          company_id: string
          completion_tokens?: number
          created_at?: string
          feature: string
          id?: string
          model: string
          prompt_tokens?: number
          related_id?: string | null
          total_tokens?: number
        }
        Update: {
          company_id?: string
          completion_tokens?: number
          created_at?: string
          feature?: string
          id?: string
          model?: string
          prompt_tokens?: number
          related_id?: string | null
          total_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_token_usage_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          portal_background_color: string | null
          portal_description: string | null
          portal_enabled: boolean
          portal_primary_color: string | null
          portal_privacy: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          portal_background_color?: string | null
          portal_description?: string | null
          portal_enabled?: boolean
          portal_primary_color?: string | null
          portal_privacy?: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          portal_background_color?: string | null
          portal_description?: string | null
          portal_enabled?: boolean
          portal_primary_color?: string | null
          portal_privacy?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_invite_permissions: {
        Row: {
          created_at: string
          id: string
          invite_id: string
          permission_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_id: string
          permission_key: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_id?: string
          permission_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_invite_permissions_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "company_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_invite_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      company_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          email: string
          id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_licenses: {
        Row: {
          company_id: string
          created_at: string | null
          license_id: string
          subscription_status: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          license_id: string
          subscription_status?: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          license_id?: string
          subscription_status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_licenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_licenses_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      company_user_permissions: {
        Row: {
          company_user_id: string
          created_at: string
          id: string
          permission_key: string
        }
        Insert: {
          company_user_id: string
          created_at?: string
          id?: string
          permission_key: string
        }
        Update: {
          company_user_id?: string
          created_at?: string
          id?: string
          permission_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_user_permissions_company_user_id_fkey"
            columns: ["company_user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_user_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      company_users: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_locks: {
        Row: {
          job_name: string
          locked_until: string
        }
        Insert: {
          job_name: string
          locked_until: string
        }
        Update: {
          job_name?: string
          locked_until?: string
        }
        Relationships: []
      }
      folders: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          created_at: string | null
          features: Json
          id: string
          max_ai_tokens: number | null
          max_manuals: number
          max_public_manuals: number
          max_users: number
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          features?: Json
          id?: string
          max_ai_tokens?: number | null
          max_manuals?: number
          max_public_manuals?: number
          max_users?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          features?: Json
          id?: string
          max_ai_tokens?: number | null
          max_manuals?: number
          max_public_manuals?: number
          max_users?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      manual_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          embedding: string
          id: string
          manual_id: string
          metadata: Json
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          embedding: string
          id?: string
          manual_id: string
          metadata?: Json
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string
          id?: string
          manual_id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "manual_chunks_manual_id_fkey"
            columns: ["manual_id"]
            isOneToOne: false
            referencedRelation: "manuals"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_sections: {
        Row: {
          content: string
          created_at: string
          display_order: number
          id: string
          manual_id: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          display_order?: number
          id?: string
          manual_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          display_order?: number
          id?: string
          manual_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_sections_manual_id_fkey"
            columns: ["manual_id"]
            isOneToOne: false
            referencedRelation: "manuals"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_views: {
        Row: {
          company_id: string | null
          country: string | null
          hashed_identifier: string | null
          id: string
          link_id: string | null
          manual_id: string
          pages_viewed: number | null
          reading_duration_seconds: number | null
          referrer: string | null
          source: string | null
          total_pages: number | null
          user_agent: string | null
          viewed_at: string
        }
        Insert: {
          company_id?: string | null
          country?: string | null
          hashed_identifier?: string | null
          id?: string
          link_id?: string | null
          manual_id: string
          pages_viewed?: number | null
          reading_duration_seconds?: number | null
          referrer?: string | null
          source?: string | null
          total_pages?: number | null
          user_agent?: string | null
          viewed_at?: string
        }
        Update: {
          company_id?: string | null
          country?: string | null
          hashed_identifier?: string | null
          id?: string
          link_id?: string | null
          manual_id?: string
          pages_viewed?: number | null
          reading_duration_seconds?: number | null
          referrer?: string | null
          source?: string | null
          total_pages?: number | null
          user_agent?: string | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_views_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_views_manual_id_fkey"
            columns: ["manual_id"]
            isOneToOne: false
            referencedRelation: "manuals"
            referencedColumns: ["id"]
          },
        ]
      }
      manuals: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          display_order: number
          extracted_text: string | null
          extraction_status: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          folder_id: string | null
          id: string
          is_public: boolean
          manual_type: string
          page_count: number | null
          rag_error: string | null
          rag_status: string | null
          summary: string | null
          summary_embedding: string | null
          title: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          extracted_text?: string | null
          extraction_status?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          folder_id?: string | null
          id?: string
          is_public?: boolean
          manual_type?: string
          page_count?: number | null
          rag_error?: string | null
          rag_status?: string | null
          summary?: string | null
          summary_embedding?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          extracted_text?: string | null
          extraction_status?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          folder_id?: string | null
          id?: string
          is_public?: boolean
          manual_type?: string
          page_count?: number | null
          rag_error?: string | null
          rag_status?: string | null
          summary?: string | null
          summary_embedding?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manuals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manuals_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          key: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          key: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          key?: string
        }
        Relationships: []
      }
      portal_invites: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          id?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_users: {
        Row: {
          company_id: string
          created_at: string
          email: string
          id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          email: string
          id?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          is_superadmin: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          is_superadmin?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_superadmin?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      web_manual_images: {
        Row: {
          created_at: string | null
          file_name: string
          file_size: number
          id: string
          manual_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_size?: number
          id?: string
          manual_id: string
          storage_path: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_size?: number
          id?: string
          manual_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_manual_images_manual_id_fkey"
            columns: ["manual_id"]
            isOneToOne: false
            referencedRelation: "manuals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_cron_lock: {
        Args: { p_job_name: string; p_lock_duration_minutes: number }
        Returns: boolean
      }
      delete_user: { Args: { target_user_id: string }; Returns: undefined }
      ensure_company_membership: { Args: never; Returns: string }
      generate_company_slug: { Args: { company_name: string }; Returns: string }
      get_current_period_token_usage: {
        Args: { p_company_id: string; p_reset_day?: number }
        Returns: number
      }
      get_invite_context: {
        Args: { invite_token: string }
        Returns: {
          accepted_at: string
          company_id: string
          company_name: string
          email: string
          invite_id: string
          permissions: string[]
        }[]
      }
      get_monthly_token_usage: {
        Args: { company_id_param: string }
        Returns: {
          feature: string
          month: string
          total_completion_tokens: number
          total_prompt_tokens: number
          total_tokens: number
        }[]
      }
      get_portal_invite_context: {
        Args: { invite_token: string }
        Returns: {
          accepted_at: string
          company_id: string
          company_name: string
          company_slug: string
          email: string
          expires_at: string
          invite_id: string
        }[]
      }
      get_unclassified_sessions: {
        Args: { p_limit?: number }
        Returns: {
          chat_type: string
          classification_attempts: number
          company_id: string
          conclusion: string | null
          created_at: string
          error_message: string | null
          id: string
          label: string | null
          manual_id: string | null
          theme_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ai_chat_sessions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_company_permission: {
        Args: { company_id: string; permission_key: string }
        Returns: boolean
      }
      increment_theme_session_count: {
        Args: { p_milestones: number[]; p_theme_id: string }
        Returns: number
      }
      is_company_member: { Args: { company_id: string }; Returns: boolean }
      is_portal_user: { Args: { p_company_id: string }; Returns: boolean }
      is_superadmin: { Args: { user_id: string }; Returns: boolean }
      match_chat_themes: {
        Args: {
          p_company_id: string
          p_embedding: string
          p_label: string
          p_threshold?: number
        }
        Returns: {
          id: string
          session_count: number
          similarity: number
          title: string
        }[]
      }
      match_manual_chunks: {
        Args: {
          manual_ids: string[]
          match_count?: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          manual_id: string
          metadata: Json
          similarity: number
        }[]
      }
      match_manual_summaries_by_company: {
        Args: {
          company_id_param: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          created_at: string
          description: string
          id: string
          similarity: number
          summary: string
          title: string
        }[]
      }
      match_public_manual_summaries_by_company: {
        Args: {
          company_id_param: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          created_at: string
          description: string
          id: string
          similarity: number
          summary: string
          title: string
        }[]
      }
      release_cron_lock: { Args: { p_job_name: string }; Returns: undefined }
      update_session_classification: {
        Args: {
          p_conclusion: string
          p_error_message: string
          p_label: string
          p_session_id: string
          p_theme_id: string
        }
        Returns: undefined
      }
      update_user_role: {
        Args: { new_role: string; target_company_user_id: string }
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
    Enums: {},
  },
} as const
