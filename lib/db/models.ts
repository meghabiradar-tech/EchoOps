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
  getAllActiveIncidents,
  getAllArchivedIncidents,
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

export type IncidentRoomSummary = {
  channelName: string;
  incident: IncidentState;
  transcripts: StoredTranscriptEntry[];
  transcriptsCount: number;
  lastTurn: StoredTranscriptEntry | null;
};

const DEFAULT_ROOM_SEEDS = [
  {
    channel: 'echoops-war-room-042',
    scenario: 'tech_outage' as IncidentState['scenario'],
    title: 'Core API Elevated Latency & Database Saturation',
    severity: 'Sev-1' as IncidentState['severity'],
    status: 'investigating' as IncidentState['status'],
    transcripts: [
      { speaker: 'System', text: 'Incident opened: Core API Elevated Latency & Database Saturation (Sev-1)', time: '08:14 PM' },
      { speaker: 'Monisha (Lead)', text: 'War Room established. API latency alert fired for checkout cluster.', time: '08:15 PM' },
      { speaker: 'EchoOps AI Commander', text: 'EchoOps Incident Commander active. I am monitoring the voice room and tracking verified incident state.', time: '08:15 PM' },
      { speaker: 'You (Human Operator)', text: 'Database connection pool is exhausted on postgres-primary. We need to rollback to v2.4.0 immediately.', time: '08:16 PM' },
      { speaker: 'EchoOps AI Commander', text: 'PostgreSQL connection pool exhausted at 100/100 locked connections. Recommended action staged: Drain pool and recycle worker threads.', time: '08:17 PM' },
      { speaker: 'Alex (SRE)', text: 'Confirmed. 14 worker processes holding locks on order checkout queries.', time: '08:18 PM' },
      { speaker: 'EchoOps AI Commander', text: 'Pending Human-in-the-loop authorization to execute connection pool drain on postgres-primary.', time: '08:19 PM' },
    ],
  },
  {
    channel: 'incident-prod-checkout-402',
    scenario: 'payment_outage' as IncidentState['scenario'],
    title: 'Payment Gateway Outage - 504 Timeout Spike',
    severity: 'Sev-1' as IncidentState['severity'],
    status: 'investigating' as IncidentState['status'],
    transcripts: [
      { speaker: 'System', text: 'Incident opened: Payment Gateway Outage - 504 Timeout Spike (Sev-1)', time: '07:30 PM' },
      { speaker: 'Alex (SRE)', text: 'Checkout failure rate spiked to 78 percent with 504 gateway timeouts.', time: '07:31 PM' },
      { speaker: 'EchoOps AI Commander', text: 'Anomaly detected in Stripe webhook listener. Downstream timeouts cascading to API gateway.', time: '07:32 PM' },
      { speaker: 'You (Human Operator)', text: 'Enable circuit breaker and route transactions through secondary gateway Adyen.', time: '07:33 PM' },
      { speaker: 'EchoOps AI Commander', text: 'Circuit breaker triggered. Routing 100% checkout traffic to Adyen backup processor. Failure rate dropped to 2.4%.', time: '07:35 PM' },
    ],
  },
  {
    channel: 'incident-db-deadlock-109',
    scenario: 'tech_outage' as IncidentState['scenario'],
    title: 'PostgreSQL Deadlock Cascade & Connection Starvation',
    severity: 'Sev-1' as IncidentState['severity'],
    status: 'monitoring' as IncidentState['status'],
    transcripts: [
      { speaker: 'System', text: 'Incident opened: PostgreSQL Deadlock Cascade (Sev-1)', time: '06:10 PM' },
      { speaker: 'Jordan (Ops)', text: 'Deadlocks detected on order_line_items table during inventory sync.', time: '06:12 PM' },
      { speaker: 'EchoOps AI Commander', text: 'Deadlock graph indicates circular wait between PID 4821 and PID 4839. Recommending cancel query on PID 4821.', time: '06:13 PM' },
      { speaker: 'You (Human Operator)', text: 'Authorize query cancellation on PID 4821.', time: '06:14 PM' },
      { speaker: 'EchoOps AI Commander', text: 'Query cancelled. Deadlock resolved. Worker queue backlog clearing.', time: '06:15 PM' },
    ],
  },
  {
    channel: 'incident-auth-latency-88',
    scenario: 'tech_outage' as IncidentState['scenario'],
    title: 'OAuth Token Refresh Cache Exhaustion',
    severity: 'Sev-2' as IncidentState['severity'],
    status: 'resolved' as IncidentState['status'],
    transcripts: [
      { speaker: 'System', text: 'Incident opened: OAuth Token Refresh Cache Exhaustion (Sev-2)', time: '04:00 PM' },
      { speaker: 'Monisha (Lead)', text: 'User logins failing intermittently across mobile clients.', time: '04:02 PM' },
      { speaker: 'EchoOps AI Commander', text: 'Redis auth cache hit ratio dropped below 45%. Eviction rate peaking.', time: '04:03 PM' },
      { speaker: 'Alex (SRE)', text: 'Scaling Redis cache cluster to 6 shards.', time: '04:15 PM' },
      { speaker: 'EchoOps AI Commander', text: 'Cache cluster scaled. Hit ratio restored to 99.4%. Incident resolved.', time: '04:30 PM' },
    ],
  },
  {
    channel: 'incident-k8s-pod-crash-501',
    scenario: 'tech_outage' as IncidentState['scenario'],
    title: 'Payment Worker Pod OOMKilled Crash Loop',
    severity: 'Sev-2' as IncidentState['severity'],
    status: 'monitoring' as IncidentState['status'],
    transcripts: [
      { speaker: 'System', text: 'Incident opened: Payment Worker Pod Crash Loop (Sev-2)', time: '02:15 PM' },
      { speaker: 'Jordan (Ops)', text: 'Payment worker pods restarting every 3 minutes in us-east-1.', time: '02:16 PM' },
      { speaker: 'EchoOps AI Commander', text: 'Pod logs show OOMKilled: memory limit 512Mi exceeded during batch receipt generation.', time: '02:17 PM' },
      { speaker: 'You (Human Operator)', text: 'Patch deployment to increase worker memory limits to 2Gi.', time: '02:20 PM' },
      { speaker: 'EchoOps AI Commander', text: 'Deployment patched and rolled out to 12 replicas. Memory stabilized at 720Mi.', time: '02:25 PM' },
    ],
  },
];

let isSeeded = false;
function initDefaultSeeds() {
  if (isSeeded) return;
  isSeeded = true;

  for (const seed of DEFAULT_ROOM_SEEDS) {
    const inc = getOrCreateIncident(seed.channel, seed.scenario);
    inc.title = seed.title;
    inc.severity = seed.severity;
    inc.status = seed.status;

    if (!channelTranscriptsMemory.has(seed.channel)) {
      const turns: StoredTranscriptEntry[] = seed.transcripts.map((t, idx) => ({
        id: `tr-${seed.channel}-${idx + 1}`,
        channelName: seed.channel,
        speaker: t.speaker,
        text: t.text,
        time: t.time,
      }));
      channelTranscriptsMemory.set(seed.channel, turns);
    }
  }
}

export async function getAllIncidentRooms(): Promise<IncidentRoomSummary[]> {
  initDefaultSeeds();

  const active = getAllActiveIncidents();
  const archived = getAllArchivedIncidents();
  const allIncidents = [...active, ...archived];

  // Also scan all channels stored in memory
  const allChannels = new Set<string>();
  allIncidents.forEach((inc) => allChannels.add(inc.channelName));
  for (const ch of channelTranscriptsMemory.keys()) {
    allChannels.add(ch);
  }

  const summaries: IncidentRoomSummary[] = [];

  for (const ch of allChannels) {
    const inc = getOrCreateIncident(ch);
    const transcripts = await loadHistoricalTranscripts(ch);
    const lastTurn = transcripts.length > 0 ? transcripts[transcripts.length - 1] : null;

    summaries.push({
      channelName: ch,
      incident: inc,
      transcripts,
      transcriptsCount: transcripts.length,
      lastTurn,
    });
  }

  // Sort with most active / recent first
  return summaries.sort((a, b) => {
    if (a.incident.status === 'investigating' && b.incident.status !== 'investigating') return -1;
    if (b.incident.status === 'investigating' && a.incident.status !== 'investigating') return 1;
    return b.transcriptsCount - a.transcriptsCount;
  });
}


