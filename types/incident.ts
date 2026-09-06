export type IncidentSeverity = 'Sev-1' | 'Sev-2' | 'Sev-3';

export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';

export type IncidentScenario = 'tech_outage' | 'urban_flood' | 'payment_outage' | 'custom';

export type ParticipantRole =
  | 'Incident Commander'
  | 'Lead SRE'
  | 'DevOps Engineer'
  | 'Database Admin'
  | 'Field Officer'
  | 'Logistics Lead'
  | 'Police Unit'
  | 'Support Lead'
  | 'Security Lead'
  | 'Observer';

export type Participant = {
  uid: string;
  name: string;
  role: ParticipantRole;
  joinedAt: string;
  isSpeaking?: boolean;
};

export type IncidentFact = {
  id: string;
  statement: string;
  verifiedBy: string;
  timestamp: string;
  confidence: number;
  sourceSpeaker?: string;
};

export type IncidentHypothesis = {
  id: string;
  statement: string;
  raisedBy: string;
  timestamp: string;
  status: 'unverified' | 'validated' | 'refuted';
  validationNote?: string;
};

export type IncidentDecision = {
  id: string;
  decision: string;
  decidedBy: string;
  timestamp: string;
  rationale?: string;
};

export type ActionItemStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

export type IncidentActionItem = {
  id: string;
  task: string;
  owner: string;
  deadline?: string;
  status: ActionItemStatus;
  timestamp: string;
  requiresConfirmation?: boolean;
  confirmed?: boolean;
  jiraTicketId?: string;
  completedAt?: string;
};

export type IncidentConflict = {
  id: string;
  description: string;
  partiesInvolved: string[];
  conflictingStatements: string[];
  status: 'open' | 'resolved';
  resolution?: string;
  timestamp: string;
};

export type MissingInfoGap = {
  id: string;
  question: string;
  impactLevel: 'high' | 'medium' | 'low';
  status: 'open' | 'addressed';
  addressedBy?: string;
  timestamp: string;
};

export type TimelineEventCategory =
  | 'fact'
  | 'hypothesis'
  | 'decision'
  | 'action'
  | 'conflict'
  | 'gap'
  | 'status_change'
  | 'tool_execution';

export type IncidentTimelineEvent = {
  id: string;
  time: string;
  timestamp: number;
  speaker: string;
  category: TimelineEventCategory;
  note: string;
  metadata?: Record<string, unknown>;
  title?: string;
  description?: string;
  badge?: string;
  type?: 'alert' | 'error' | 'system' | 'warning' | 'action';
  source?: string;
};

export type IntegrationType = 'slack' | 'jira' | 'pagerduty' | 'monitoring' | 'sms_email';

export type IntegrationLog = {
  id: string;
  tool: IntegrationType;
  action: string;
  status: 'success' | 'pending_confirmation' | 'failed';
  details: string;
  timestamp: string;
  payload?: Record<string, unknown>;
};

export type IncidentState = {
  id: string;
  title: string;
  scenario: IncidentScenario;
  severity: IncidentSeverity;
  status: IncidentStatus;
  startedAt: string;
  resolvedAt?: string;
  channelName: string;
  participants: Participant[];
  facts: IncidentFact[];
  hypotheses: IncidentHypothesis[];
  decisions: IncidentDecision[];
  actionItems: IncidentActionItem[];
  conflicts: IncidentConflict[];
  missingGaps: MissingInfoGap[];
  timeline: IncidentTimelineEvent[];
  integrationLogs: IntegrationLog[];
  unresolvedRisks: string[];
  summary?: string;
  environment?: string;
  service?: string;
  commander?: string;
  activeImpact?: string;
  estRevenueLoss?: string;
  slaBreachIn?: string;
  impactedTraffic?: string;
  impactedCustomers?: string;
  alerts?: {
    conflict?: { title: string; description: string; impact: string; time: string; badge: string; severity?: string };
    gap?: { title: string; description: string; impact: string; time: string; badge: string; severity?: string };
    risk?: { title: string; description: string; impact: string; time: string; badge: string; severity?: string };
  };
  pendingAction?: {
    actionTitle: string;
    actionSub?: string;
    targetCluster?: string;
    target?: string;
    consequence?: string;
    impactAssessment?: string;
    requiresApprovalBy?: string;
    riskLevel?: string;
    isConfirmed?: boolean;
    confirmedTime?: string | null;
  };
};

export type PastIncidentKnowledge = {
  id: string;
  title: string;
  scenario: IncidentScenario;
  similarityScore: number;
  rootCause: string;
  resolution: string;
  suggestedRunbooks: string[];
  tags: string[];
};

export type PostIncidentReview = {
  incidentId: string;
  title: string;
  severity: IncidentSeverity;
  durationMinutes: number;
  executiveSummary: string;
  rootCauseAnalysis: string;
  timeline: { time: string; event: string }[];
  keyDecisions: string[];
  factsIdentified: string[];
  actionItemsCompleted: string[];
  unresolvedRisks: string[];
  preventativeMeasures: string[];
  generatedAt: string;
};
