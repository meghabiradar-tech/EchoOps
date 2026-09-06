import type { ReactNode } from 'react';

export interface IncidentOverview {
  id: string;
  incidentId?: string;
  title: string;
  severity: string;
  status: string;
  service: string;
  environment: string;
  startedAt: string;
  duration: string;
  commander: string;
  impact: string;
  slaTimeRemaining: string;
  estimatedRevenueImpact: string;
  impactedCustomers: string;
  summary: string;
}

export interface ImpactMetrics {
  activeImpact: string;
  estRevenueLoss: string;
  slaBreachIn: string;
  impactedTraffic: string;
  impactedCustomers?: string;
}

export interface TimelineEvent {
  id: string;
  time: string;
  title: string;
  description: string;
  source: string;
  type: 'alert' | 'error' | 'system' | 'warning' | 'action';
  badge: string;
}

export interface FactItem {
  id: string;
  fact: string;
  verifiedBy: string;
  timestamp: string;
  confidence: string;
}

export interface AssumptionItem {
  id: string;
  hypothesis: string;
  source: string;
  status: string;
  riskLevel: string;
}

export interface ActionItem {
  id: string;
  action: string;
  owner: {
    name: string;
    role: string;
    initials: string;
    color: string;
    bg: string;
  };
  status: 'PENDING' | 'IN PROGRESS' | 'COMPLETED';
  updatedAt: string;
}

export interface AlertDetail {
  type: string;
  badge: string;
  title: string;
  description: string;
  impact: string;
  time: string;
  severity: string;
}

export interface AlertsMap {
  conflict: AlertDetail;
  gap: AlertDetail;
  risk: AlertDetail;
}

export interface HumanInTheLoopData {
  actionTitle: string;
  actionSub: string;
  targetCluster: string;
  consequence: string;
  requiresApprovalBy: string;
  riskLevel: string;
  isConfirmed?: boolean;
  confirmedTime?: string | null;
}

export interface TranscriptEntry {
  speaker: string;
  time: string;
  text: string;
}

export interface StateDelta {
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  newConfirmedFact?: {
    text: string;
    verifiedVia: string;
    time: string;
  } | null;
  newHypothesis?: {
    status: string;
    risk: string;
    description: string;
    source: string;
  } | null;
  recommendedAction?: {
    actionTitle: string;
    subtitle?: string;
    impactAssessment: string;
    target: string;
  } | null;
  incident?: Partial<IncidentOverview>;
  impactMetrics?: Partial<ImpactMetrics>;
  newTimelineEvents?: Partial<TimelineEvent>[];
  timeline?: Partial<TimelineEvent>[];
  newFacts?: Partial<FactItem>[];
  confirmedFacts?: Partial<FactItem>[];
  facts?: Partial<FactItem>[];
  newHypotheses?: Partial<AssumptionItem>[];
  hypotheses?: Partial<AssumptionItem>[];
  assumptions?: Partial<AssumptionItem>[];
  newActions?: Partial<ActionItem>[];
  actions?: Partial<ActionItem>[];
  updatedActions?: { id: string; status: 'PENDING' | 'IN PROGRESS' | 'COMPLETED' }[];
  alerts?: Partial<AlertsMap>;
  pendingAction?: Partial<HumanInTheLoopData>;
  humanInTheLoop?: Partial<HumanInTheLoopData>;
  respondersCount?: number;
}

export interface IncidentContextValue {
  channelName: string;
  setChannelName: React.Dispatch<React.SetStateAction<string>>;
  rehydrateRoom: (targetChannel?: string) => Promise<void>;
  isRehydrating: boolean;
  incident: IncidentOverview;
  setIncident: React.Dispatch<React.SetStateAction<IncidentOverview>>;
  impactMetrics: ImpactMetrics;
  setImpactMetrics: React.Dispatch<React.SetStateAction<ImpactMetrics>>;
  timeline: TimelineEvent[];
  setTimeline: React.Dispatch<React.SetStateAction<TimelineEvent[]>>;
  facts: FactItem[];
  confirmedFacts: FactItem[];
  setFacts: React.Dispatch<React.SetStateAction<FactItem[]>>;
  setConfirmedFacts: React.Dispatch<React.SetStateAction<FactItem[]>>;
  assumptions: AssumptionItem[];
  hypotheses: AssumptionItem[];
  setAssumptions: React.Dispatch<React.SetStateAction<AssumptionItem[]>>;
  setHypotheses: React.Dispatch<React.SetStateAction<AssumptionItem[]>>;
  actions: ActionItem[];
  setActions: React.Dispatch<React.SetStateAction<ActionItem[]>>;
  alerts: AlertsMap;
  setAlerts: React.Dispatch<React.SetStateAction<AlertsMap>>;
  humanInTheLoop: HumanInTheLoopData;
  pendingAction: HumanInTheLoopData;
  setHumanInTheLoop: React.Dispatch<React.SetStateAction<HumanInTheLoopData>>;
  setPendingAction: React.Dispatch<React.SetStateAction<HumanInTheLoopData>>;
  transcripts: TranscriptEntry[];
  setTranscripts: React.Dispatch<React.SetStateAction<TranscriptEntry[]>>;
  warRoomId: string;
  setWarRoomId: React.Dispatch<React.SetStateAction<string>>;
  respondersCount: number;
  setRespondersCount: React.Dispatch<React.SetStateAction<number>>;
  addTranscript: (entry: { speaker: string; time?: string; text: string }) => void;
  addTimelineEvent: (event: Partial<TimelineEvent>) => void;
  addFact: (fact: Partial<FactItem>) => void;
  addAssumption: (item: Partial<AssumptionItem>) => void;
  addAction: (act: Partial<ActionItem>) => void;
  updateActionStatus: (id: string, status: 'PENDING' | 'IN PROGRESS' | 'COMPLETED') => void;
  confirmPendingAction: () => void;
  resetPendingAction: () => void;
  applyStateDelta: (delta: StateDelta) => void;
}

export function IncidentProvider(props: { children: ReactNode; initialChannel?: string }): JSX.Element;
export function useIncidentContext(): IncidentContextValue;

