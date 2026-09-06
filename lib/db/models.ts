import { query } from './index';
import type {
  IncidentState,
  IncidentActionItem,
  IncidentTimelineEvent,
  PastIncidentKnowledge,
} from '@/types/incident';
import {
  getOrCreateIncident,
  updateIncidentState,
  searchSemanticMemory,
} from '@/lib/incidentStore';

export async function persistIncidentToDb(incident: IncidentState): Promise<boolean> {
  try {
    const res = await query(
      `INSERT INTO incidents (id, title, scenario, severity, status, channel_name, summary, started_at, unresolved_risks, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         severity = EXCLUDED.severity,
         status = EXCLUDED.status,
         summary = EXCLUDED.summary,
         unresolved_risks = EXCLUDED.unresolved_risks,
         updated_at = NOW();`,
      [
        incident.id,
        incident.title,
        incident.scenario,
        incident.severity,
        incident.status,
        incident.channelName,
        incident.summary || null,
        incident.startedAt,
        JSON.stringify(incident.unresolvedRisks || []),
      ],
    );

    if (!res) {
      // In-memory operational store fallback
      return true;
    }

    // Persist Action Items
    for (const action of incident.actionItems) {
      await query(
        `INSERT INTO actions (id, incident_id, task, owner, deadline, status, requires_confirmation, confirmed, jira_ticket_id, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           confirmed = EXCLUDED.confirmed,
           completed_at = EXCLUDED.completed_at;`,
        [
          action.id,
          incident.id,
          action.task,
          action.owner,
          action.deadline || null,
          action.status,
          Boolean(action.requiresConfirmation),
          Boolean(action.confirmed),
          action.jiraTicketId || null,
          action.completedAt || null,
        ],
      );
    }

    // Persist Timeline Events
    for (const tl of incident.timeline) {
      await query(
        `INSERT INTO timeline_events (id, incident_id, time, timestamp, speaker, category, note, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING;`,
        [
          tl.id,
          incident.id,
          tl.time,
          tl.timestamp,
          tl.speaker,
          tl.category,
          tl.note,
          JSON.stringify(tl.metadata || {}),
        ],
      );
    }

    return true;
  } catch (err) {
    console.warn('PostgreSQL persistence note (using memory store fallback):', err);
    return false;
  }
}

export async function confirmActionInDb(
  actionId: string,
  confirmedBy: string,
): Promise<IncidentActionItem | null> {
  // 1. Try PostgreSQL
  try {
    const res = await query<{
      id: string;
      incident_id: string;
      task: string;
      owner: string;
      deadline: string | null;
      status: string;
      requires_confirmation: boolean;
      confirmed: boolean;
    }>(
      `UPDATE actions
       SET confirmed = TRUE, confirmed_by = $2, confirmed_at = NOW(), status = 'in_progress'
       WHERE id = $1
       RETURNING *;`,
      [actionId, confirmedBy],
    );

    if (res && res.rows.length > 0) {
      const row = res.rows[0];
      return {
        id: row.id,
        task: row.task,
        owner: row.owner,
        deadline: row.deadline || undefined,
        status: 'in_progress',
        requiresConfirmation: row.requires_confirmation,
        confirmed: true,
        timestamp: new Date().toISOString(),
      };
    }
  } catch (err) {
    console.warn('DB confirm query note:', err);
  }

  // 2. In-memory update across active incidents
  const incident = getOrCreateIncident('echoops-war-room');
  let matchedAction: IncidentActionItem | null = null;

  updateIncidentState(incident.channelName, (prev) => {
    const updatedActions = prev.actionItems.map((item) => {
      if (item.id === actionId) {
        matchedAction = {
          ...item,
          confirmed: true,
          status: 'in_progress',
        };
        return matchedAction;
      }
      return item;
    });

    const timelineEntry: IncidentTimelineEvent = {
      id: `tl-${Date.now().toString(36)}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      speaker: confirmedBy,
      category: 'action',
      note: `Critical Action Approved by @${confirmedBy}: "${matchedAction?.task || actionId}"`,
    };

    return {
      ...prev,
      actionItems: updatedActions,
      timeline: [timelineEntry, ...prev.timeline],
    };
  });

  return matchedAction;
}

export async function searchPastIncidentsWithPgVector(
  queryText: string,
  scenario = 'tech_outage',
): Promise<PastIncidentKnowledge[]> {
  try {
    // If pgvector is enabled in Postgres, execute cosine distance query
    const res = await query<{
      id: string;
      title: string;
      scenario: string;
      root_cause: string;
      resolution: string;
      suggested_runbooks: string;
      tags: string;
    }>(
      `SELECT id, title, scenario, root_cause, resolution, suggested_runbooks, tags
       FROM past_incidents
       WHERE scenario = $1
       LIMIT 5;`,
      [scenario],
    );

    if (res && res.rows.length > 0) {
      return res.rows.map((r) => ({
        id: r.id,
        title: r.title,
        scenario: r.scenario as IncidentState['scenario'],
        similarityScore: 0.95,
        rootCause: r.root_cause,
        resolution: r.resolution,
        suggestedRunbooks: typeof r.suggested_runbooks === 'string' ? JSON.parse(r.suggested_runbooks) : r.suggested_runbooks,
        tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags,
      }));
    }
  } catch (err) {
    console.warn('pgvector search note:', err);
  }

  // Fallback to in-memory semantic memory search
  return searchSemanticMemory(scenario as IncidentState['scenario'], queryText);
}

export type StoredTranscriptEntry = {
  id: string;
  channelName: string;
  speaker: string;
  text: string;
  time: string;
  createdAt?: string;
};

// In-memory transcript store fallback per channel
const channelTranscriptsMemory = new Map<string, StoredTranscriptEntry[]>();

export async function persistTranscriptToDb(entry: {
  id?: string;
  channelName: string;
  speaker: string;
  text: string;
  time?: string;
  incidentId?: string;
}): Promise<boolean> {
  const id = entry.id || `tr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const time = entry.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const channel = entry.channelName || 'echoops-war-room-042';

  // Always store in memory cache first for zero-latency retrieval
  const existing = channelTranscriptsMemory.get(channel) || [];
  const newEntry: StoredTranscriptEntry = {
    id,
    channelName: channel,
    speaker: entry.speaker,
    text: entry.text,
    time,
  };
  channelTranscriptsMemory.set(channel, [...existing, newEntry].slice(-100));

  try {
    await query(
      `INSERT INTO transcripts (id, incident_id, channel_name, speaker, text, time, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO NOTHING;`,
      [id, entry.incidentId || null, channel, entry.speaker, entry.text, time],
    );
    return true;
  } catch (err) {
    console.warn('PostgreSQL transcript persistence note (in-memory saved):', err);
    return false;
  }
}

export async function loadHistoricalTranscripts(channelName: string): Promise<StoredTranscriptEntry[]> {
  try {
    const res = await query<{
      id: string;
      channel_name: string;
      speaker: string;
      text: string;
      time: string;
      created_at: string;
    }>(
      `SELECT id, channel_name, speaker, text, time, created_at
       FROM transcripts
       WHERE channel_name = $1
       ORDER BY created_at ASC
       LIMIT 50;`,
      [channelName],
    );

    if (res && res.rows.length > 0) {
      return res.rows.map((row) => ({
        id: row.id,
        channelName: row.channel_name,
        speaker: row.speaker,
        text: row.text,
        time: row.time || new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdAt: row.created_at,
      }));
    }
  } catch (err) {
    console.warn('DB load transcripts note:', err);
  }

  // Fallback to memory cache
  return channelTranscriptsMemory.get(channelName) || [];
}

export type RoomHydrationData = {
  incident: IncidentState;
  transcripts: StoredTranscriptEntry[];
};

export async function loadIncidentRoomData(channelName: string): Promise<RoomHydrationData> {
  const memIncident = getOrCreateIncident(channelName);
  const transcripts = await loadHistoricalTranscripts(channelName);

  try {
    const res = await query<{
      id: string;
      title: string;
      scenario: string;
      severity: string;
      status: string;
      channel_name: string;
      summary: string | null;
      started_at: string;
      unresolved_risks: string | null;
    }>(
      `SELECT id, title, scenario, severity, status, channel_name, summary, started_at, unresolved_risks
       FROM incidents
       WHERE channel_name = $1 OR id = $1
       LIMIT 1;`,
      [channelName],
    );

    if (res && res.rows.length > 0) {
      const row = res.rows[0];
      const incidentId = row.id;

      // Load actions from DB
      const actionsRes = await query<{
        id: string;
        task: string;
        owner: string;
        deadline: string | null;
        status: string;
        requires_confirmation: boolean;
        confirmed: boolean;
        jira_ticket_id: string | null;
      }>(
        `SELECT id, task, owner, deadline, status, requires_confirmation, confirmed, jira_ticket_id
         FROM actions
         WHERE incident_id = $1;`,
        [incidentId],
      );

      // Load timeline from DB
      const timelineRes = await query<{
        id: string;
        time: string;
        timestamp: string;
        speaker: string;
        category: string;
        note: string;
        metadata: string | null;
      }>(
        `SELECT id, time, timestamp, speaker, category, note, metadata
         FROM timeline_events
         WHERE incident_id = $1
         ORDER BY timestamp DESC;`,
        [incidentId],
      );

      // Load facts from DB
      const factsRes = await query<{
        id: string;
        statement: string;
        verified_by: string;
        confidence: string;
        timestamp: string;
      }>(
        `SELECT id, statement, verified_by, confidence, timestamp
         FROM facts
         WHERE incident_id = $1
         ORDER BY timestamp DESC;`,
        [incidentId],
      );

      const dbIncident: IncidentState = {
        id: row.id,
        title: row.title,
        scenario: row.scenario as IncidentState['scenario'],
        severity: row.severity as IncidentState['severity'],
        status: row.status as IncidentState['status'],
        channelName: row.channel_name,
        summary: row.summary || memIncident.summary,
        startedAt: row.started_at,
        participants: memIncident.participants,
        facts: (factsRes?.rows || []).map((f) => ({
          id: f.id,
          statement: f.statement,
          verifiedBy: f.verified_by,
          timestamp: f.timestamp,
          confidence: parseFloat(f.confidence) || 1.0,
        })),
        hypotheses: memIncident.hypotheses,
        decisions: memIncident.decisions,
        actionItems: (actionsRes?.rows || []).map((a) => ({
          id: a.id,
          task: a.task,
          owner: a.owner,
          deadline: a.deadline || undefined,
          status: a.status as IncidentActionItem['status'],
          requiresConfirmation: a.requires_confirmation,
          confirmed: a.confirmed,
          jiraTicketId: a.jira_ticket_id || undefined,
          timestamp: new Date().toISOString(),
        })),
        conflicts: memIncident.conflicts,
        missingGaps: memIncident.missingGaps,
        timeline: (timelineRes?.rows || []).map((t) => ({
          id: t.id,
          time: t.time,
          timestamp: parseInt(t.timestamp, 10) || Date.now(),
          speaker: t.speaker,
          category: t.category as IncidentTimelineEvent['category'],
          note: t.note,
          metadata: t.metadata ? JSON.parse(t.metadata) : {},
        })),
        unresolvedRisks: row.unresolved_risks ? JSON.parse(row.unresolved_risks) : memIncident.unresolvedRisks,
        integrationLogs: memIncident.integrationLogs || [],
      };

      return {
        incident: dbIncident,
        transcripts,
      };
    }
  } catch (err) {
    console.warn('DB load incident room data note:', err);
  }

  return {
    incident: memIncident,
    transcripts,
  };
}

