export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string;
          host_token_hash: string;
          share_code: string;
          name: string;
          sport: "badminton";
          venue: string;
          scheduled_start: string;
          duration_minutes: number;
          timezone: string;
          court_count: number;
          game_format: "singles" | "doubles";
          status: "draft" | "live" | "ended";
          current_round_number: number;
          created_at: string;
          updated_at: string;
          ended_at: string | null;
        };
        Insert: {
          id?: string;
          host_token_hash: string;
          share_code: string;
          name: string;
          sport?: "badminton";
          venue: string;
          scheduled_start: string;
          duration_minutes: number;
          timezone?: string;
          court_count: number;
          game_format: "singles" | "doubles";
          status?: "draft" | "live" | "ended";
          current_round_number?: number;
          created_at?: string;
          updated_at?: string;
          ended_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sessions"]["Insert"]>;
        Relationships: [];
      };
      players: {
        Row: {
          id: string;
          session_id: string;
          name: string;
          level: "beginner" | "intermediate" | "pro";
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          name: string;
          level: "beginner" | "intermediate" | "pro";
          active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["players"]["Insert"]>;
        Relationships: [];
      };
      rounds: {
        Row: {
          id: string;
          session_id: string;
          round_number: number;
          status: "planned" | "live" | "completed";
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          round_number: number;
          status?: "planned" | "live" | "completed";
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["rounds"]["Insert"]>;
        Relationships: [];
      };
      matches: {
        Row: {
          id: string;
          session_id: string;
          round_id: string;
          court_number: number;
          status: "planned" | "live" | "completed";
          team_a_score: number;
          team_b_score: number;
          winner: "a" | "b" | null;
          started_at: string | null;
          completed_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          round_id: string;
          court_number: number;
          status?: "planned" | "live" | "completed";
          team_a_score?: number;
          team_b_score?: number;
          winner?: "a" | "b" | null;
          started_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["matches"]["Insert"]>;
        Relationships: [];
      };
      match_assignments: {
        Row: {
          id: number;
          match_id: string;
          player_id: string;
          team: "a" | "b";
          slot: number;
          active: boolean;
          joined_at: string;
          left_at: string | null;
        };
        Insert: {
          id?: never;
          match_id: string;
          player_id: string;
          team: "a" | "b";
          slot: number;
          active?: boolean;
          joined_at?: string;
          left_at?: string | null;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["match_assignments"]["Insert"], "id">>;
        Relationships: [];
      };
      match_substitutions: {
        Row: {
          id: number;
          match_id: string;
          outgoing_assignment_id: number;
          incoming_assignment_id: number;
          created_at: string;
        };
        Insert: {
          id?: never;
          match_id: string;
          outgoing_assignment_id: number;
          incoming_assignment_id: number;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
