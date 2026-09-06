'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface IncidentRecord {
  id: string;
  title: string;
  scenario: string;
  severity: 'Sev-1' | 'Sev-2' | 'Sev-3' | string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved' | string;
  channel_name: string;
  summary?: string | null;
  started_at?: string;
  resolved_at?: string | null;
  unresolved_risks?: string[] | unknown;
  active_impact?: string | null;
  est_revenue_loss?: string | null;
  sla_breach_in?: string | null;
  impacted_traffic?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TranscriptRecord {
  id: string;
  incident_id?: string | null;
  channel_name: string;
  speaker: string;
  text: string;
  time?: string | null;
  created_at?: string;
}

export interface TimelineEventRecord {
  id: string;
  incident_id: string;
  time: string;
  timestamp: number;
  speaker: string;
  category: string;
  note: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface Database {
  public: {
    Tables: {
      incidents: {
        Row: IncidentRecord;
        Insert: Partial<IncidentRecord> & { channel_name: string; title: string };
        Update: Partial<IncidentRecord>;
      };
      Incident: {
        Row: IncidentRecord;
        Insert: Partial<IncidentRecord> & { channel_name: string; title: string };
        Update: Partial<IncidentRecord>;
      };
      transcripts: {
        Row: TranscriptRecord;
        Insert: Partial<TranscriptRecord> & { channel_name: string; speaker: string; text: string };
        Update: Partial<TranscriptRecord>;
      };
      Transcript: {
        Row: TranscriptRecord;
        Insert: Partial<TranscriptRecord> & { channel_name: string; speaker: string; text: string };
        Update: Partial<TranscriptRecord>;
      };
      timeline_events: {
        Row: TimelineEventRecord;
        Insert: Partial<TimelineEventRecord> & { incident_id: string; note: string };
        Update: Partial<TimelineEventRecord>;
      };
      TimelineEvent: {
        Row: TimelineEventRecord;
        Insert: Partial<TimelineEventRecord> & { incident_id: string; note: string };
        Update: Partial<TimelineEventRecord>;
      };
    };
  };
}

let supabaseInstance: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (supabaseInstance) return supabaseInstance;

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://echoops-fallback.supabase.co';
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

  supabaseInstance = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 20,
      },
    },
  });

  return supabaseInstance;
}

export const supabase = getSupabaseClient();
