'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, type IncidentRecord, type TranscriptRecord } from '@/lib/supabase/client';
import type { IncidentState, IncidentSeverity, IncidentStatus } from '@/types/incident';
import type { StoredTranscriptEntry } from '@/lib/db/models';

export interface RealtimeImpactMetrics {
  activeImpact: string;
  estRevenueLoss: string;
  slaBreachIn: string;
  impactedTraffic: string;
}

export interface PresenceUser {
  userId: string;
  name: string;
  role: string;
  onlineAt: string;
}

export function useRealtimeIncident(channelName: string) {
  const cleanChannel = (channelName || 'echoops-war-room-042').trim();

  const [incident, setIncident] = useState<IncidentState | null>(null);
  const [transcripts, setTranscripts] = useState<StoredTranscriptEntry[]>([]);
  const [respondersCount, setRespondersCount] = useState<number>(4);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [impactMetrics, setImpactMetrics] = useState<RealtimeImpactMetrics>({
    activeImpact: '74% Checkout Transactions Failing',
    estRevenueLoss: '$42,000 / hr',
    slaBreachIn: '12m 45s',
    impactedTraffic: '1,420 Users Affected',
  });

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const userUidRef = useRef<string>(`user-${Math.floor(Math.random() * 90000) + 10000}`);

  // 1. Initial Load from backend
  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Primary: /api/incidents/[channelName]
      let res = await fetch(`/api/incidents/${encodeURIComponent(cleanChannel)}`);
      if (!res.ok) {
        // Fallback: /api/room/[channelName]
        res = await fetch(`/api/room/${encodeURIComponent(cleanChannel)}`);
      }

      if (res.ok) {
        const data = await res.json();
        if (data && data.incident) {
          setIncident(data.incident);
          if (Array.isArray(data.transcripts)) {
            setTranscripts(data.transcripts);
          }
          // Populate impact metrics from incident data or defaults
          const inc = data.incident;
          setImpactMetrics({
            activeImpact: inc.activeImpact || inc.impact || '74% Checkout Transactions Failing',
            estRevenueLoss: inc.estRevenueLoss || inc.estimatedRevenueImpact || '$42,000 / hr',
            slaBreachIn: inc.slaBreachIn || inc.slaTimeRemaining || '12m 45s',
            impactedTraffic: inc.impactedTraffic || inc.impactedCustomers || '1,420 Users Affected',
          });
        }
      }
    } catch (err) {
      console.warn('Initial realtime incident fetch fallback:', err);
      setError((err as Error).message || 'Failed to load incident data');
    } finally {
      setIsLoading(false);
    }
  }, [cleanChannel]);

  // 2. Setup Supabase Realtime Subscription & Presence
  useEffect(() => {
    loadInitialData();

    const realtimeChannelName = `incident-room-${cleanChannel}`;
    const channel = supabase.channel(realtimeChannelName, {
      config: {
        presence: {
          key: userUidRef.current,
        },
      },
    });

    channelRef.current = channel;

    // A. Listen for UPDATE events on Incident table
    const handleIncidentUpdate = (payload: { new: IncidentRecord }) => {
      if (!payload.new) return;
      const row = payload.new;
      setIncident((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          title: row.title || prev.title,
          severity: (row.severity as IncidentSeverity) || prev.severity,
          status: (row.status as IncidentStatus) || prev.status,
          summary: row.summary !== undefined ? (row.summary || '') : prev.summary,
        };
      });

      // Update impact metrics if present in row
      setImpactMetrics((prev) => ({
        activeImpact: row.active_impact || prev.activeImpact,
        estRevenueLoss: row.est_revenue_loss || prev.estRevenueLoss,
        slaBreachIn: row.sla_breach_in || prev.slaBreachIn,
        impactedTraffic: row.impacted_traffic || prev.impactedTraffic,
      }));
    };

    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'incidents',
          filter: `channel_name=eq.${cleanChannel}`,
        },
        handleIncidentUpdate,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'Incident',
          filter: `channel_name=eq.${cleanChannel}`,
        },
        handleIncidentUpdate,
      );

    // B. Listen for INSERT events on Transcript table
    const handleTranscriptInsert = (payload: { new: TranscriptRecord }) => {
      if (!payload.new) return;
      const row = payload.new;
      const newEntry: StoredTranscriptEntry = {
        id: row.id || `tr-${Date.now()}`,
        channelName: row.channel_name || cleanChannel,
        speaker: row.speaker,
        text: row.text,
        time:
          row.time ||
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setTranscripts((prev) => {
        if (prev.some((t) => t.id === newEntry.id)) return prev;
        return [...prev, newEntry].slice(-100);
      });
    };

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transcripts',
          filter: `channel_name=eq.${cleanChannel}`,
        },
        handleTranscriptInsert,
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'Transcript',
          filter: `channel_name=eq.${cleanChannel}`,
        },
        handleTranscriptInsert,
      );

    // C. Supabase Presence Tracking for Connected Responders
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const responders: PresenceUser[] = [];

        Object.keys(state).forEach((key) => {
          const presences = state[key];
          if (Array.isArray(presences)) {
            presences.forEach((p: unknown) => {
              const user = p as { user_id?: string; name?: string; role?: string; online_at?: string };
              responders.push({
                userId: user.user_id || key,
                name: user.name || 'Responder',
                role: user.role || 'Incident Responder',
                onlineAt: user.online_at || new Date().toISOString(),
              });
            });
          }
        });

        // Minimum 1 responder (local user) if sync returns empty in demo/offline mode
        setRespondersCount(Math.max(1, responders.length));
        setPresenceUsers(responders);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await channel.track({
              user_id: userUidRef.current,
              name: 'Incident Responder',
              role: 'Operator',
              online_at: new Date().toISOString(),
            });
          } catch (trackErr) {
            console.warn('Presence track note:', trackErr);
          }
        }
      });

    // Cleanup: Unsubscribe and remove channel on unmount
    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [cleanChannel, loadInitialData]);

  // 3. Helper to append a transcript entry and persist it
  const addTranscript = useCallback(
    async (entry: { speaker: string; text: string; time?: string }) => {
      const time =
        entry.time ||
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const newTurn: StoredTranscriptEntry = {
        id: `tr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        channelName: cleanChannel,
        speaker: entry.speaker,
        text: entry.text,
        time,
      };

      // Optimistic update
      setTranscripts((prev) => [...prev, newTurn].slice(-100));

      // Persist to backend
      try {
        await fetch(`/api/incidents/${encodeURIComponent(cleanChannel)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add_transcript',
            transcript: { speaker: entry.speaker, text: entry.text, time },
          }),
        });
      } catch (err) {
        console.warn('Failed to persist transcript to backend:', err);
      }
    },
    [cleanChannel],
  );

  // 4. Helper to patch incident state
  const updateIncident = useCallback(
    async (patch: Partial<IncidentState>) => {
      setIncident((prev) => (prev ? { ...prev, ...patch } : null));
      try {
        await fetch(`/api/incidents/${encodeURIComponent(cleanChannel)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ incident: patch }),
        });
      } catch (err) {
        console.warn('Failed to update incident state:', err);
      }
    },
    [cleanChannel],
  );

  return {
    incident,
    transcripts,
    respondersCount,
    presenceUsers,
    impactMetrics,
    isLoading,
    error,
    addTranscript,
    updateIncident,
    refetch: loadInitialData,
  };
}
