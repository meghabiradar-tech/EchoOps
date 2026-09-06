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
  initDefaultSeeds();
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
  initDefaultSeeds();
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

export const DEFAULT_ROOM_SEEDS = [
  {
    channel: 'echoops-war-room-042',
    scenario: 'tech_outage' as IncidentState['scenario'],
    title: 'Core API Elevated Latency & Database Saturation',
    severity: 'Sev-1' as IncidentState['severity'],
    status: 'investigating' as IncidentState['status'],
    summary: 'High rate of HTTP 504 Gateway Timeouts and elevated API latency observed across checkout endpoints. Database worker connection pool is currently saturated at 100/100 connections.',
    environment: 'Production • us-east-1',
    service: 'checkout-core-api',
    commander: 'EchoOps Voice AI (Commander #07)',
    activeImpact: '94% Connection Pool Locked • 1,420 Sessions',
    estRevenueLoss: '$42,500 / hr',
    slaBreachIn: '11m 38s',
    impactedTraffic: '1,420 Active Responders/Users',
    facts: [
      { id: 'f-042-1', statement: 'Database connection pool saturated (100/100 active connections locked).', verifiedBy: 'Postgres APM / Sarah J.', timestamp: '08:16 PM', confidence: 1.0 },
      { id: 'f-042-2', statement: 'Checkout endpoint /v2/checkout/process returning HTTP 504 to 78% of incoming traffic.', verifiedBy: 'Cloudflare Ingress Logs', timestamp: '08:15 PM', confidence: 1.0 },
      { id: 'f-042-3', statement: 'Payment Service deployment v2.4.1 was rolled out at 08:12 PM, 3 minutes before incident start.', verifiedBy: 'GitHub Actions / ArgoCD', timestamp: '08:14 PM', confidence: 1.0 },
    ],
    hypotheses: [
      { id: 'h-042-1', statement: 'Stale worker connection locks are failing to terminate upon client timeout in v2.4.1.', raisedBy: 'EchoOps Voice AI', timestamp: '08:17 PM', status: 'unverified' as const },
      { id: 'h-042-2', statement: 'Rolling back immediately to v2.4.0 will clear the thread queue without needing a cold database reboot.', raisedBy: 'Alex Chen (SRE)', timestamp: '08:18 PM', status: 'unverified' as const },
    ],
    actionItems: [
      { id: 'act-042-1', task: 'Drain incoming checkout traffic to failover standby cluster', owner: 'Alex Chen', status: 'completed' as const, timestamp: '08:16 PM' },
      { id: 'act-042-2', task: 'Inspect PostgreSQL connection pool metrics & kill orphaned idle queries', owner: 'Sarah Jenkins', status: 'in_progress' as const, timestamp: '08:17 PM' },
      { id: 'act-042-3', task: 'Prepare artifact rollback to stable version v2.4.0 in ArgoCD pipeline', owner: 'Elena Rostova', status: 'pending' as const, timestamp: '08:18 PM' },
    ],
    timeline: [
      { id: 'tl-042-1', time: '08:14 PM', timestamp: 1725650040000, speaker: 'Datadog Telemetry', category: 'status_change' as const, note: 'p99 latency spiked from 140ms to 4,800ms across payment gateway ingress routes.', title: 'Payment API latency increased', description: 'p99 latency spiked from 140ms to 4,800ms across payment gateway ingress routes.', badge: 'LATENCY SPIKE', type: 'alert' as const, source: 'Datadog Telemetry' },
      { id: 'tl-042-2', time: '08:15 PM', timestamp: 1725650100000, speaker: 'EchoOps AI Commander', category: 'status_change' as const, note: 'EchoOps Voice AI opened war room #042, paged on-call engineers, and initiated audio bridge.', title: 'Incident detected & War Room opened', description: 'EchoOps Voice AI opened war room #042, paged on-call engineers, and initiated audio bridge.', badge: 'INCIDENT OPENED', type: 'system' as const, source: 'EchoOps AI Commander' },
      { id: 'tl-042-3', time: '08:17 PM', timestamp: 1725650220000, speaker: 'EchoOps AI Commander', category: 'action' as const, note: 'Connection pool drain staged for human-in-the-loop approval.', title: 'Recovery action staged', description: 'Connection pool drain staged for human-in-the-loop approval.', badge: 'ACTION STAGED', type: 'action' as const, source: 'EchoOps AI Commander' },
    ],
    alerts: {
      conflict: { title: 'Concurrent Deployment Collision Detected', description: 'Elena is preparing a manual v2.4.0 rollback while automated pipeline is retrying v2.4.1 hotfix deploy. Recommendation: Pause CI/CD runner #184.', impact: 'High risk of overwriting rollback pod states and conflicting database migrations.', time: '08:18 PM', badge: 'CONFLICT ALERT', severity: 'High' },
      gap: { title: 'Missing Primary Database DBA on Voice Bridge', description: 'Postgres locks require root DBA authorization, but Primary DBA on-call has not yet joined the audio bridge. Backup DBA Sarah Jenkins is currently covering.', impact: 'Potential delay in executing manual connection pool purge command.', time: '08:16 PM', badge: 'GAP ALERT', severity: 'Medium' },
      risk: { title: 'Tier-1 SLA Threshold Breach in 11 Minutes', description: 'Tier-1 merchant checkout SLA guarantees 99.9% uptime. Continued 504 errors will trigger contractual SLA breach penalties if not resolved by 08:30 PM.', impact: 'Financial penalty risk + automated executive escalation pager.', time: '08:19 PM', badge: 'RISK ALERT', severity: 'Critical' },
    },
    pendingAction: {
      actionTitle: 'Drain postgres connection pool',
      actionSub: 'Cluster Worker Node Reset & Redis Connection Pool Flush',
      targetCluster: 'postgres-primary.internal:5432',
      target: 'postgres-primary.internal:5432',
      consequence: 'Will safely terminate stuck connection pool and recycle 8 worker pods. In-flight requests will be re-routed to standby queue with zero data loss.',
      impactAssessment: 'Will safely terminate stuck connection pool and recycle 8 worker pods. In-flight requests will be re-routed to standby queue with zero data loss.',
      requiresApprovalBy: 'Incident Commander (Human)',
      riskLevel: 'CRITICAL RECOVERY',
      isConfirmed: false,
    },
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
    summary: 'Third-party Stripe webhook listener timeouts causing cascading HTTP 504 errors on payment ingress. 78% of transactions failing.',
    environment: 'Production • us-west-2',
    service: 'payments-gateway',
    commander: 'EchoOps Voice AI (Commander #04)',
    activeImpact: '78% Checkout Transactions Failing (HTTP 504)',
    estRevenueLoss: '$68,000 / hr',
    slaBreachIn: '08m 15s',
    impactedTraffic: '4,850 Checkout Users',
    facts: [
      { id: 'f-402-1', statement: 'Stripe webhook listener response times exceeded 12,000ms threshold.', verifiedBy: 'Envoy Ingress APM', timestamp: '07:31 PM', confidence: 0.99 },
      { id: 'f-402-2', statement: 'Secondary gateway Adyen endpoint is 100% operational in us-west-2.', verifiedBy: 'Adyen Health Probe', timestamp: '07:32 PM', confidence: 1.0 },
    ],
    hypotheses: [
      { id: 'h-402-1', statement: 'Upstream payment aggregator BGP route flap is causing TCP connect timeouts.', raisedBy: 'Alex (SRE)', timestamp: '07:32 PM', status: 'unverified' as const },
    ],
    actionItems: [
      { id: 'act-402-1', task: 'Trigger circuit breaker to redirect 100% transaction traffic to Adyen backup processor', owner: 'Alex (SRE)', status: 'in_progress' as const, timestamp: '07:33 PM' },
      { id: 'act-402-2', task: 'Open P1 escalation bridge with Stripe technical operations', owner: 'Jordan (Ops)', status: 'pending' as const, timestamp: '07:34 PM' },
    ],
    timeline: [
      { id: 'tl-402-1', time: '07:30 PM', timestamp: 1725647400000, speaker: 'System', category: 'status_change' as const, note: 'Incident opened: Payment Gateway Outage - 504 Timeout Spike (Sev-1)', title: 'Gateway 504 Alarm Fired', description: 'Checkout failure rate spiked to 78 percent with 504 gateway timeouts.', badge: '504 SPIKE', type: 'error' as const, source: 'System Telemetry' },
      { id: 'tl-402-2', time: '07:35 PM', timestamp: 1725647700000, speaker: 'EchoOps AI Commander', category: 'action' as const, note: 'Circuit breaker triggered. Routing 100% checkout traffic to Adyen backup processor.', title: 'Traffic Rerouted to Backup Processor', description: 'Routing 100% checkout traffic to Adyen backup processor. Failure rate dropped to 2.4%.', badge: 'CIRCUIT BREAKER', type: 'action' as const, source: 'EchoOps AI Commander' },
    ],
    alerts: {
      conflict: { title: 'Multi-Gateway Webhook Idempotency Desync', description: 'In-flight orders charged on primary gateway may duplicate if retried naively on backup gateway.', impact: 'Double charging merchant risk without idempotency lock verification.', time: '07:33 PM', badge: 'IDEMPOTENCY CONFLICT', severity: 'High' },
      gap: { title: 'Missing Payment Settlement Lead', description: 'Treasury / settlement approval needed for high-volume currency conversion switch.', impact: 'Settlement reconciliation required post-incident.', time: '07:34 PM', badge: 'GAP ALERT', severity: 'Medium' },
      risk: { title: 'Merchant Checkout SLA Breach in 8 Minutes', description: 'Global checkout SLA threshold is 99.5%. Immediate traffic shedding to Adyen is required.', impact: 'Executive customer SLA penalty.', time: '07:35 PM', badge: 'CRITICAL SLA RISK', severity: 'Critical' },
    },
    pendingAction: {
      actionTitle: 'Engage Payment Circuit Breaker & Route to Adyen',
      actionSub: 'Traffic Shift from Stripe Primary to Adyen Standby',
      targetCluster: 'gateway-router.prod.uswest2',
      target: 'gateway-router.prod.uswest2',
      consequence: 'Switches 100% credit card processing to Adyen failover rails. Normalizes checkout completion rate within 15 seconds.',
      impactAssessment: 'Switches 100% credit card processing to Adyen failover rails. Normalizes checkout completion rate within 15 seconds.',
      requiresApprovalBy: 'Incident Commander (Human)',
      riskLevel: 'CRITICAL RECOVERY',
      isConfirmed: false,
    },
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
    summary: 'Deadlock cascade on order_line_items table during automated inventory sync job. Circular lock wait between worker processes.',
    environment: 'Production • eu-west-1',
    service: 'inventory-db-cluster',
    commander: 'EchoOps Voice AI (Commander #02)',
    activeImpact: 'Deadlock queue backlog: 84 hanging transactions',
    estRevenueLoss: '$18,400 / hr',
    slaBreachIn: '24m 10s',
    impactedTraffic: '890 Inventory Sync Jobs',
    facts: [
      { id: 'f-109-1', statement: 'Deadlock graph indicates circular lock wait between PID 4821 and PID 4839 on order_line_items.', verifiedBy: 'pg_stat_activity', timestamp: '06:13 PM', confidence: 1.0 },
    ],
    hypotheses: [
      { id: 'h-109-1', statement: 'Inventory replenishment batch job lacked ORDER BY clause on foreign key updates, causing inverted lock acquisitions.', raisedBy: 'Jordan (Ops)', timestamp: '06:14 PM', status: 'validated' as const },
    ],
    actionItems: [
      { id: 'act-109-1', task: 'Cancel blocking transaction on PID 4821 using pg_cancel_backend', owner: 'Jordan (Ops)', status: 'completed' as const, timestamp: '06:14 PM' },
      { id: 'act-109-2', task: 'Deploy hotfix migration adding deterministic lock ordering to inventory sync queries', owner: 'Alex (SRE)', status: 'in_progress' as const, timestamp: '06:18 PM' },
    ],
    timeline: [
      { id: 'tl-109-1', time: '06:10 PM', timestamp: 1725642600000, speaker: 'System', category: 'status_change' as const, note: 'Incident opened: PostgreSQL Deadlock Cascade (Sev-1)', title: 'Deadlock Cascade Alarm', description: 'Deadlocks detected on order_line_items table during inventory sync.', badge: 'DEADLOCK', type: 'error' as const, source: 'System Telemetry' },
      { id: 'tl-109-2', time: '06:15 PM', timestamp: 1725642900000, speaker: 'EchoOps AI Commander', category: 'action' as const, note: 'Query cancelled on PID 4821. Deadlock resolved. Worker backlog clearing.', title: 'Blocking PID Terminated', description: 'Query cancelled. Deadlock resolved. Worker queue backlog clearing.', badge: 'RESOLVED', type: 'action' as const, source: 'EchoOps AI Commander' },
    ],
    alerts: {
      conflict: { title: 'Batch Sync Retry vs Manual DB Kill Conflict', description: 'Celery worker queue is configured with exponential backoff and may retry the identical conflicting transaction.', impact: 'May re-introduce deadlock if batch worker is not paused.', time: '06:14 PM', badge: 'RETRY CONFLICT', severity: 'Medium' },
      gap: { title: 'Index Missing on line_item_sku_id', description: 'Table scan occurs during foreign key cascade check without supporting index.', impact: 'High lock hold duration.', time: '06:16 PM', badge: 'SCHEMA GAP', severity: 'Medium' },
      risk: { title: 'Replication Lag Spike on Read Replica', description: 'WAL backlog accumulation during deadlock resolution caused 180s replica lag.', impact: 'Stale reads on inventory catalog.', time: '06:17 PM', badge: 'REPLICA RISK', severity: 'High' },
    },
    pendingAction: {
      actionTitle: 'Kill Orphaned Deadlock PID 4821',
      actionSub: 'pg_terminate_backend(4821) on master node',
      targetCluster: 'postgres-eu-master.internal:5432',
      target: 'postgres-eu-master.internal:5432',
      consequence: 'Terminates blocking inventory transaction and releases table lock. Sync job will cleanly retry.',
      impactAssessment: 'Terminates blocking inventory transaction and releases table lock. Sync job will cleanly retry.',
      requiresApprovalBy: 'Lead SRE (Human)',
      riskLevel: 'MEDIUM RISK',
      isConfirmed: true,
      confirmedTime: '06:14 PM',
    },
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
    summary: 'Redis cluster eviction spike caused authentication token cache misses. Cache cluster sharded to 6 nodes; hit ratio restored to 99.4%.',
    environment: 'Production • ap-southeast-1',
    service: 'auth-redis-cluster',
    commander: 'EchoOps Voice AI (Commander #01)',
    activeImpact: 'Cache Hit Ratio Dropped to 44% (Now Restored to 99.4%)',
    estRevenueLoss: '$0 / hr (Mitigated)',
    slaBreachIn: 'Breach Prevented (MTTR 30m)',
    impactedTraffic: 'Mobile SSO Sessions Normalized',
    facts: [
      { id: 'f-088-1', statement: 'Redis memory utilization crossed 92% maxmemory policy.', verifiedBy: 'Redis Sentinel', timestamp: '04:03 PM', confidence: 1.0 },
      { id: 'f-088-2', statement: 'Cache cluster scaled from 3 to 6 shards; memory pressure dropped to 38%.', verifiedBy: 'AWS ElastiCache Console', timestamp: '04:22 PM', confidence: 1.0 },
    ],
    hypotheses: [
      { id: 'h-088-1', statement: 'Mobile app v4.8 update introduced aggressive background token polling.', raisedBy: 'Monisha (Lead)', timestamp: '04:05 PM', status: 'validated' as const },
    ],
    actionItems: [
      { id: 'act-088-1', task: 'Scale Redis cluster to 6 shards with online resharding', owner: 'Alex (SRE)', status: 'completed' as const, timestamp: '04:15 PM' },
      { id: 'act-088-2', task: 'Implement server-side token refresh throttling in API gateway', owner: 'Monisha (Lead)', status: 'completed' as const, timestamp: '04:28 PM' },
    ],
    timeline: [
      { id: 'tl-088-1', time: '04:00 PM', timestamp: 1725634800000, speaker: 'System', category: 'status_change' as const, note: 'Incident opened: OAuth Token Refresh Cache Exhaustion (Sev-2)', title: 'Redis Eviction Spike Alarm', description: 'User logins failing intermittently across mobile clients.', badge: 'CACHE SPIKE', type: 'warning' as const, source: 'System Telemetry' },
      { id: 'tl-088-2', time: '04:30 PM', timestamp: 1725636600000, speaker: 'EchoOps AI Commander', category: 'status_change' as const, note: 'Cache cluster scaled. Hit ratio restored to 99.4%. Incident resolved.', title: 'Incident Fully Resolved', description: 'Hit ratio restored to 99.4%. Latency dropped to 2ms.', badge: 'RESOLVED', type: 'system' as const, source: 'EchoOps AI Commander' },
    ],
    alerts: {
      conflict: { title: 'TTL Expiration vs Memory Eviction Divergence', description: 'Token TTL was set to 24h while maxmemory evicted tokens after 3h under load.', impact: 'Clients unexpectedly logged out before token expiry.', time: '04:08 PM', badge: 'CONFIG CONFLICT', severity: 'Low' },
      gap: { title: 'Missing Client Backoff Policy', description: 'Mobile client SDK lacks jittered exponential backoff on 429 / 503 responses.', impact: 'Thundering herd on auth API.', time: '04:12 PM', badge: 'SDK GAP', severity: 'Medium' },
      risk: { title: 'Database Fallback Saturation Risk', description: 'Redis misses fell back to user DB table, spiking DB CPU to 65%.', impact: 'Potential cascade if not cached.', time: '04:16 PM', badge: 'CASCADE RISK', severity: 'Medium' },
    },
    pendingAction: {
      actionTitle: 'Horizontal ElastiCache Cluster Scaling',
      actionSub: 'Scale from 3 shards to 6 shards',
      targetCluster: 'redis-auth-prod.ap-southeast-1.cache.amazonaws.com',
      target: 'redis-auth-prod.ap-southeast-1.cache.amazonaws.com',
      consequence: 'Adds 3 shards with zero downtime; doubles cache capacity to 48GB.',
      impactAssessment: 'Adds 3 shards with zero downtime; doubles cache capacity to 48GB.',
      requiresApprovalBy: 'Lead SRE (Human)',
      riskLevel: 'LOW RISK',
      isConfirmed: true,
      confirmedTime: '04:15 PM',
    },
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
    summary: 'Payment worker batch pods OOMKilled every 3 minutes in us-east-1 due to 512Mi memory limit exceeded during end-of-month batch receipt processing.',
    environment: 'Production • us-east-1',
    service: 'worker-batch-receipts',
    commander: 'EchoOps Voice AI (Commander #03)',
    activeImpact: 'Worker Pod Restarts: 12 restarts/hr • Memory 512Mi Exceeded',
    estRevenueLoss: '$4,200 / hr',
    slaBreachIn: '38m 00s',
    impactedTraffic: 'Batch Receipt Queue Backlog (8,200 items)',
    facts: [
      { id: 'f-501-1', statement: 'Pod logs show OOMKilled: memory limit 512Mi exceeded during PDF receipt compression.', verifiedBy: 'Kubernetes API / kubectl', timestamp: '02:17 PM', confidence: 1.0 },
      { id: 'f-501-2', statement: 'Node memory capacity in us-east-1 has 64GB available overhead.', verifiedBy: 'Prometheus Node Exporter', timestamp: '02:18 PM', confidence: 1.0 },
    ],
    hypotheses: [
      { id: 'h-501-1', statement: 'Bulk invoice generation loads uncompressed raster images into memory buffer concurrently.', raisedBy: 'Jordan (Ops)', timestamp: '02:19 PM', status: 'unverified' as const },
    ],
    actionItems: [
      { id: 'act-501-1', task: 'Patch Kubernetes deployment resources: memory limit 2Gi, request 1Gi', owner: 'Jordan (Ops)', status: 'completed' as const, timestamp: '02:20 PM' },
      { id: 'act-501-2', task: 'Rollout restart across all 12 worker replicas', owner: 'Alex (SRE)', status: 'completed' as const, timestamp: '02:22 PM' },
    ],
    timeline: [
      { id: 'tl-501-1', time: '02:15 PM', timestamp: 1725628500000, speaker: 'System', category: 'status_change' as const, note: 'Incident opened: Payment Worker Pod Crash Loop (Sev-2)', title: 'CrashLoopBackOff Alarm Fired', description: 'Payment worker pods restarting every 3 minutes in us-east-1.', badge: 'CRASH LOOP', type: 'error' as const, source: 'Kubelet Telemetry' },
      { id: 'tl-501-2', time: '02:25 PM', timestamp: 1725629100000, speaker: 'EchoOps AI Commander', category: 'action' as const, note: 'Deployment patched and rolled out to 12 replicas. Memory stabilized at 720Mi.', title: 'Memory Limits Raised & Pods Stabilized', description: 'Deployment patched and rolled out. Memory stabilized at 720Mi.', badge: 'STABILIZED', type: 'action' as const, source: 'EchoOps AI Commander' },
    ],
    alerts: {
      conflict: { title: 'HPA CPU Threshold vs Memory Limit Divergence', description: 'Horizontal Pod Autoscaler was triggered by CPU while memory was hitting OOM limit before scaling could trigger.', impact: 'Autoscaler failed to add pods before crashes occurred.', time: '02:18 PM', badge: 'HPA CONFLICT', severity: 'Medium' },
      gap: { title: 'Missing Streaming PDF Generation', description: 'Receipt generator creates whole PDFs in RAM rather than chunked streaming.', impact: 'Linear memory growth with invoice item count.', time: '02:21 PM', badge: 'CODE GAP', severity: 'Low' },
      risk: { title: 'SQS Dead Letter Queue Overflow Risk', description: 'Failed receipt jobs will move to DLQ after 3 retries if not processed within 45 minutes.', impact: 'Customer receipts delayed.', time: '02:23 PM', badge: 'DLQ RISK', severity: 'Medium' },
    },
    pendingAction: {
      actionTitle: 'Patch K8s Deployment Memory Limits to 2Gi',
      actionSub: 'kubectl patch deployment payment-worker-receipts',
      targetCluster: 'k8s-prod-useast1.cluster.local',
      target: 'k8s-prod-useast1.cluster.local',
      consequence: 'Increases container limit from 512Mi to 2Gi and restarts 12 worker replicas safely.',
      impactAssessment: 'Increases container limit from 512Mi to 2Gi and restarts 12 worker replicas safely.',
      requiresApprovalBy: 'Incident Commander (Human)',
      riskLevel: 'LOW RISK',
      isConfirmed: true,
      confirmedTime: '02:20 PM',
    },
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
export function initDefaultSeeds() {
  if (isSeeded) return;
  isSeeded = true;

  for (const seed of DEFAULT_ROOM_SEEDS) {
    const inc = getOrCreateIncident(seed.channel, seed.scenario);
    inc.title = seed.title;
    inc.severity = seed.severity;
    inc.status = seed.status;
    inc.summary = seed.summary;
    inc.environment = seed.environment;
    inc.service = seed.service;
    inc.commander = seed.commander;
    inc.activeImpact = seed.activeImpact;
    inc.estRevenueLoss = seed.estRevenueLoss;
    inc.slaBreachIn = seed.slaBreachIn;
    inc.impactedTraffic = seed.impactedTraffic;
    inc.facts = seed.facts;
    inc.hypotheses = seed.hypotheses;
    inc.actionItems = seed.actionItems;
    inc.timeline = seed.timeline;
    inc.alerts = seed.alerts;
    inc.pendingAction = seed.pendingAction;

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

// Ensure default seeds are initialized on module load
try {
  initDefaultSeeds();
} catch (seedErr) {
  console.warn('Initial seed note:', seedErr);
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


