import type {
  IncidentState,
  IncidentScenario,
  PastIncidentKnowledge,
  PostIncidentReview,
  IncidentTimelineEvent,
  IncidentFact,
  IncidentActionItem,
  IncidentConflict,
  MissingInfoGap,
  IntegrationLog,
} from '@/types/incident';

// Seed initial historical knowledge base (pgvector simulated semantic memory layer)
const PAST_INCIDENTS_KNOWLEDGE_BASE: PastIncidentKnowledge[] = [
  {
    id: 'kb-inc-2025-081',
    title: 'Postgres Connection Pool Saturation during Flash Sale',
    scenario: 'payment_outage',
    similarityScore: 0.94,
    rootCause: 'Leaked DB connections in payment-service v2.4.1 webhook handler under high concurrency.',
    resolution: 'Scaled PgBouncer pool limits, rolled back webhook worker deploy, enabled circuit breaker.',
    suggestedRunbooks: [
      'runbook-pgbouncer-pool-drain.md',
      'runbook-payment-canary-rollback.md',
    ],
    tags: ['database', 'connection-pool', 'payment-gateway', 'timeout'],
  },
  {
    id: 'kb-inc-2025-044',
    title: 'Zone Outage with Unhealthy Canary Deploy in us-east-1',
    scenario: 'tech_outage',
    similarityScore: 0.88,
    rootCause: 'Envoy ingress route configuration typo routed 100% traffic to failing canary pods.',
    resolution: 'Emergency traffic shift to us-west-2, automated canary rollback via Argo Rollouts.',
    suggestedRunbooks: [
      'runbook-cross-region-traffic-shift.md',
      'runbook-ingress-config-validation.md',
    ],
    tags: ['traffic-shift', 'canary', 'ingress', 'us-east-1'],
  },
  {
    id: 'kb-inc-2025-112',
    title: 'Flash Flood Route Disruption & Pump Allocation',
    scenario: 'urban_flood',
    similarityScore: 0.92,
    rootCause: 'Sector 7 drainage canal obstruction during peak monsoon rainfall hours.',
    resolution: 'Dispatched 2 high-capacity mobile pumps to Sector 7, rerouted logistics via Western Corridor.',
    suggestedRunbooks: [
      'sop-urban-flood-pump-dispatch.md',
      'sop-traffic-reroute-emergency-corridor.md',
    ],
    tags: ['urban-flood', 'water-level', 'pump-dispatch', 'sector-7'],
  },
];

// In-memory operational storage for incidents
const activeIncidents = new Map<string, IncidentState>();
const archivedIncidents: IncidentState[] = [];

// Seed a default active incident if empty
function createDefaultIncident(
  scenario: IncidentScenario = 'tech_outage',
  channelName = 'echoops-war-room',
): IncidentState {
  const isFlood = scenario === 'urban_flood';
  const isPayment = scenario === 'payment_outage';

  const title = isFlood
    ? 'Urban Flood Response - Sector 7 Drainage Surge'
    : isPayment
    ? 'Payment Gateway Outage - 504 Timeout Spike'
    : 'Core API Elevated Latency & Database Saturation';

  const severity = isFlood ? 'Sev-1' : isPayment ? 'Sev-1' : 'Sev-2';

  return {
    id: `inc-${Date.now().toString(36)}`,
    title,
    scenario,
    severity,
    status: 'investigating',
    startedAt: new Date().toISOString(),
    channelName,
    participants: [
      {
        uid: 'user-ic',
        name: 'Monisha (Lead)',
        role: 'Incident Commander',
        joinedAt: new Date().toISOString(),
      },
      {
        uid: 'user-sre',
        name: 'Alex (SRE)',
        role: isFlood ? 'Field Officer' : 'Lead SRE',
        joinedAt: new Date().toISOString(),
      },
      {
        uid: 'user-logistics',
        name: 'Jordan (Ops)',
        role: isFlood ? 'Logistics Lead' : 'DevOps Engineer',
        joinedAt: new Date().toISOString(),
      },
    ],
    facts: [
      {
        id: 'fact-1',
        statement: isFlood
          ? 'Water level near Sector 7 drainage reached 2.1 meters at 10:26 AM.'
          : 'HTTP 504 gateway timeouts jumped to 14.2% on /checkout/pay route.',
        verifiedBy: 'Alex (SRE)',
        timestamp: new Date().toISOString(),
        confidence: 0.98,
      },
    ],
    hypotheses: [
      {
        id: 'hyp-1',
        statement: isFlood
          ? 'Access Road 9 may be completely impassable for heavy pump carriers.'
          : 'Recent payment-service v2.4.1 release may have unindexed database queries.',
        raisedBy: 'Jordan (Ops)',
        timestamp: new Date().toISOString(),
        status: 'unverified',
      },
    ],
    decisions: [],
    actionItems: [
      {
        id: 'action-1',
        task: isFlood
          ? 'Confirm whether Sector 9 road is blocked before dispatching warehouse pump.'
          : 'Check connection pool telemetry on the database and inspect latest 10m logs.',
        owner: 'Alex (SRE)',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
      },
    ],
    conflicts: [],
    missingGaps: [
      {
        id: 'gap-1',
        question: isFlood
          ? 'What is the verified water depth on Sector 9 alternate route?'
          : 'Are payment partner webhooks also failing or only internal transactions?',
        impactLevel: 'high',
        status: 'open',
        timestamp: new Date().toISOString(),
      },
    ],
    timeline: [
      {
        id: 'tl-1',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(),
        speaker: 'System',
        category: 'status_change',
        note: `Incident opened: ${title} (${severity})`,
      },
    ],
    integrationLogs: [
      {
        id: 'log-1',
        tool: 'slack',
        action: 'incident_room_created',
        status: 'success',
        details: `Dispatched incident notification to #incident-war-room`,
        timestamp: new Date().toISOString(),
      },
    ],
    unresolvedRisks: [
      isFlood
        ? 'Secondary rainfall peak forecast in 45 minutes could compromise Sector 3 substation.'
        : 'Database connection exhaustion could cascade to authentication cluster within 15 minutes.',
    ],
  };
}

export function getOrCreateIncident(
  channelName: string,
  scenario: IncidentScenario = 'tech_outage',
): IncidentState {
  let incident = activeIncidents.get(channelName);
  if (!incident) {
    incident = createDefaultIncident(scenario, channelName);
    activeIncidents.set(channelName, incident);
  }
  return incident;
}

export function getIncidentByChannel(channelName: string): IncidentState | undefined {
  return activeIncidents.get(channelName) || [...activeIncidents.values()][0];
}

export function updateIncidentState(
  channelName: string,
  updater: (prev: IncidentState) => IncidentState,
): IncidentState {
  const current = getOrCreateIncident(channelName);
  const updated = updater(current);
  activeIncidents.set(channelName, updated);
  return updated;
}

export function addFactToIncident(channelName: string, fact: Omit<IncidentFact, 'id' | 'timestamp'>): IncidentFact {
  const newFact: IncidentFact = {
    ...fact,
    id: `fact-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
  };

  updateIncidentState(channelName, (prev) => {
    // Avoid exact duplicate statements
    if (prev.facts.some((f) => f.statement.toLowerCase() === newFact.statement.toLowerCase())) {
      return prev;
    }
    const timelineEntry: IncidentTimelineEvent = {
      id: `tl-${Date.now().toString(36)}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      speaker: newFact.verifiedBy || 'EchoOps',
      category: 'fact',
      note: `Verified Fact: ${newFact.statement}`,
    };
    return {
      ...prev,
      facts: [newFact, ...prev.facts],
      timeline: [timelineEntry, ...prev.timeline],
    };
  });

  return newFact;
}

export function addActionItemToIncident(
  channelName: string,
  action: Omit<IncidentActionItem, 'id' | 'timestamp'>,
): IncidentActionItem {
  const newAction: IncidentActionItem = {
    ...action,
    id: `act-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
  };

  updateIncidentState(channelName, (prev) => {
    const timelineEntry: IncidentTimelineEvent = {
      id: `tl-${Date.now().toString(36)}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      speaker: 'EchoOps',
      category: 'action',
      note: `Task Assigned to @${newAction.owner}: ${newAction.task}`,
    };
    return {
      ...prev,
      actionItems: [newAction, ...prev.actionItems],
      timeline: [timelineEntry, ...prev.timeline],
    };
  });

  return newAction;
}

export function addConflictToIncident(
  channelName: string,
  conflict: Omit<IncidentConflict, 'id' | 'timestamp'>,
): IncidentConflict {
  const newConflict: IncidentConflict = {
    ...conflict,
    id: `conf-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
  };

  updateIncidentState(channelName, (prev) => {
    const timelineEntry: IncidentTimelineEvent = {
      id: `tl-${Date.now().toString(36)}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      speaker: 'EchoOps',
      category: 'conflict',
      note: `Conflict Detected: ${newConflict.description}`,
    };
    return {
      ...prev,
      conflicts: [newConflict, ...prev.conflicts],
      timeline: [timelineEntry, ...prev.timeline],
    };
  });

  return newConflict;
}

export function addGapToIncident(
  channelName: string,
  gap: Omit<MissingInfoGap, 'id' | 'timestamp'>,
): MissingInfoGap {
  const newGap: MissingInfoGap = {
    ...gap,
    id: `gap-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
  };

  updateIncidentState(channelName, (prev) => {
    return {
      ...prev,
      missingGaps: [newGap, ...prev.missingGaps],
    };
  });

  return newGap;
}

export function logIntegrationAction(channelName: string, log: Omit<IntegrationLog, 'id' | 'timestamp'>): void {
  const newLog: IntegrationLog = {
    ...log,
    id: `log-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
  };
  updateIncidentState(channelName, (prev) => ({
    ...prev,
    integrationLogs: [newLog, ...prev.integrationLogs],
  }));
}

export function searchSemanticMemory(scenario: IncidentScenario, query = ''): PastIncidentKnowledge[] {
  const normalizedQuery = query.toLowerCase();
  return PAST_INCIDENTS_KNOWLEDGE_BASE.filter(
    (kb) =>
      kb.scenario === scenario ||
      normalizedQuery.length === 0 ||
      kb.tags.some((t) => normalizedQuery.includes(t)) ||
      kb.title.toLowerCase().includes(normalizedQuery),
  );
}

export function archiveIncident(channelName: string, pir: PostIncidentReview): IncidentState | null {
  const incident = activeIncidents.get(channelName);
  if (!incident) return null;

  const resolvedIncident: IncidentState = {
    ...incident,
    status: 'resolved',
    resolvedAt: new Date().toISOString(),
    summary: pir.executiveSummary,
  };

  archivedIncidents.unshift(resolvedIncident);
  activeIncidents.delete(channelName);
  return resolvedIncident;
}

export function getAllArchivedIncidents(): IncidentState[] {
  return archivedIncidents;
}

export function getAllActiveIncidents(): IncidentState[] {
  return Array.from(activeIncidents.values());
}
