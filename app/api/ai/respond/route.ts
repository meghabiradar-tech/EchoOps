import { NextRequest, NextResponse } from 'next/server';

type ConversationMessage = {
  role: string;
  content: string;
};

type RespondRequest = {
  transcript?: unknown;
  history?: unknown;
  serviceName?: unknown;
  region?: unknown;
  activeAlerts?: unknown;
  recentEvents?: unknown;
  currentIncidentState?: unknown;
};

export type IncidentStateDelta = {
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
    subtitle: string;
    impactAssessment: string;
    target: string;
  } | null;

  // Extensions to ensure backwards compatibility with dashboard cards
  incident?: Partial<{
    id: string;
    title: string;
    severity: string;
    status: string;
    summary: string;
  }>;
  impactMetrics?: Partial<{
    activeImpact: string;
    estRevenueLoss: string;
    slaBreachIn: string;
    impactedTraffic: string;
  }>;
  newTimelineEvents?: Array<{
    id?: string;
    time?: string;
    title: string;
    description: string;
    source: string;
    type: 'alert' | 'error' | 'system' | 'warning' | 'action';
    badge: string;
  }>;
  newFacts?: Array<{
    id?: string;
    fact: string;
    verifiedBy: string;
    timestamp?: string;
    confidence: string;
  }>;
  newHypotheses?: Array<{
    id?: string;
    hypothesis: string;
    source: string;
    status: string;
    riskLevel: string;
  }>;
  newActions?: Array<{
    id?: string;
    action: string;
    owner?: {
      name: string;
      role: string;
      initials: string;
      color: string;
      bg: string;
    };
    status: 'PENDING' | 'IN PROGRESS' | 'COMPLETED';
    updatedAt?: string;
  }>;
  pendingAction?: Partial<{
    actionTitle: string;
    actionSub: string;
    targetCluster: string;
    consequence: string;
    requiresApprovalBy: string;
    riskLevel: string;
  }>;
};

export type RespondResponse = {
  speech: string;
  stateDelta: IncidentStateDelta;
};

const SYSTEM_PROMPT = `You are the EchoOps AI Incident Commander leading a high-severity war room. Analyze incoming voice transcripts from engineers, correlate symptoms, identify root causes, and verbally issue concise, high-priority mitigation recommendations.

Keep spoken answers under 2–3 sharp, technical sentences optimized for low-latency text-to-speech. Never give generic boilerplate; cite specific infrastructure layers (e.g., connection pools, thread starvation, rollout rollbacks, pod restarts).

You MUST respond strictly with a valid JSON object in this exact schema:
{
  "speech": "Concise, sharp verbal advice and immediate tactical next step (under 2-3 sentences)",
  "stateDelta": {
    "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
    "newConfirmedFact": {
      "text": "Verified technical fact statement",
      "verifiedVia": "Source/APM tool (e.g. Postgres APM, Envoy Gateway, Datadog)",
      "time": "HH:MM"
    } | null,
    "newHypothesis": {
      "status": "INVESTIGATING",
      "risk": "High" | "Medium" | "Low",
      "description": "Correlated technical root cause hypothesis",
      "source": "Voice bridge observation"
    } | null,
    "recommendedAction": {
      "actionTitle": "Short, commanding action title (e.g. Authorize rollback to v2.4.0)",
      "subtitle": "Technical pipeline or subsystem description",
      "impactAssessment": "Risk/impact assessment of executing this operation",
      "target": "Infrastructure target (cluster, pod, namespace, or connection string)"
    } | null
  }
}

Operational safety rules:
- For high-impact operations (e.g., database restart, canary rollback, pool drain, traffic shedding), always populate recommendedAction so the Human-in-the-Loop governance card is staged for 1-click execution.
- If no new fact or hypothesis is discovered, set that key to null.`;

const LLM_TIMEOUT_MS = 5000;

// Local Heuristic Rules & State Delta Extraction
function extractHeuristicStateDelta(transcript: string): { speech: string; stateDelta: IncidentStateDelta } {
  const lower = transcript.toLowerCase();
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Default baseline
  let speech =
    'Checking connection pool telemetry and ingress error rates. Recommend cross-referencing worker saturation with the latest deployment commit.';
  const delta: IncidentStateDelta = {
    severity: 'HIGH',
    newConfirmedFact: null,
    newHypothesis: null,
    recommendedAction: null,
  };

  // 1. Database & Connection Pool / Starvation
  if (
    lower.includes('database') ||
    lower.includes('db') ||
    lower.includes('pool') ||
    lower.includes('postgres') ||
    lower.includes('connection') ||
    lower.includes('saturation') ||
    lower.includes('starvation')
  ) {
    speech =
      'Database connection pool is maxed out at 100 connections with client threads starving on checkout queries. I have staged an active pool drain command on the governance card; authorize it to terminate orphaned handles.';
    delta.severity = 'CRITICAL';
    delta.newConfirmedFact = {
      text: 'PostgreSQL connection pool exhausted at 100/100 locked connections with elevated idle thread timeouts.',
      verifiedVia: 'Postgres APM / Voice Triage',
      time: timeStr,
    };
    delta.newHypothesis = {
      status: 'INVESTIGATING',
      risk: 'High',
      description: 'Worker connection handles are leaking upon client HTTP 504 gateway timeouts.',
      source: 'EchoOps Real-Time Correlation',
    };
    delta.recommendedAction = {
      actionTitle: 'Drain connection pool & recycle postgres worker threads',
      subtitle: 'pg_stat_activity orphan session termination',
      impactAssessment: 'Will disconnect 14 stale worker handles; live queries remain untouched.',
      target: 'postgres-primary.internal:5432',
    };
    delta.pendingAction = {
      actionTitle: delta.recommendedAction.actionTitle,
      actionSub: delta.recommendedAction.subtitle,
      targetCluster: delta.recommendedAction.target,
      consequence: delta.recommendedAction.impactAssessment,
      requiresApprovalBy: 'Incident Commander (Human)',
      riskLevel: 'CRITICAL RECOVERY',
    };
    delta.newTimelineEvents = [
      {
        id: `t-${Date.now()}-db`,
        time: timeStr,
        title: 'Connection Pool Exhaustion Detected',
        description: 'PostgreSQL pool saturated at 100/100 locked slots. Recommended pool drain staged.',
        source: 'EchoOps AI Commander',
        type: 'alert',
        badge: 'POOL SATURATED',
      },
    ];
  }

  // 2. Rollback & Deployment
  else if (
    lower.includes('rollback') ||
    lower.includes('revert') ||
    lower.includes('v2.4.0') ||
    lower.includes('v2.4.1') ||
    lower.includes('deploy') ||
    lower.includes('canary')
  ) {
    speech =
      'ArgoCD pipeline is staged for an immediate rollback to v2.4.0. I have populated the Human-in-the-Loop Governance card; click Confirm Action to trigger pod rotation.';
    delta.severity = 'HIGH';
    delta.newConfirmedFact = {
      text: 'Canary release v2.4.1 is generating 504 errors across payment endpoints.',
      verifiedVia: 'ArgoCD / Service Mesh',
      time: timeStr,
    };
    delta.newHypothesis = {
      status: 'INVESTIGATING',
      risk: 'High',
      description: 'Recent commit in v2.4.1 introduced deadlock in order capture worker pool.',
      source: 'Voice War Room Synthesis',
    };
    delta.recommendedAction = {
      actionTitle: 'Authorize rollback to payments-core-api:v2.4.0',
      subtitle: 'ArgoCD Deployment Pipeline Rollback & Worker Pod Replacement',
      impactAssessment: 'Safely drains v2.4.1 pods and swaps in certified v2.4.0 release with zero data loss.',
      target: 'prod-us-east1-payment-cluster',
    };
    delta.pendingAction = {
      actionTitle: delta.recommendedAction.actionTitle,
      actionSub: delta.recommendedAction.subtitle,
      targetCluster: delta.recommendedAction.target,
      consequence: delta.recommendedAction.impactAssessment,
      requiresApprovalBy: 'Incident Commander (Human)',
      riskLevel: 'HIGH PRIORITY ROLLBACK',
    };
    delta.newTimelineEvents = [
      {
        id: `t-${Date.now()}-roll`,
        time: timeStr,
        title: 'Rollback to v2.4.0 prepared',
        description: 'Elena Rostova staged v2.4.0 rollback in ArgoCD. Awaiting incident commander approval.',
        source: 'Voice Bridge Synthesis',
        type: 'action',
        badge: 'ROLLBACK STAGED',
      },
    ];
  }

  // 3. 504 Timeouts & Latency
  else if (
    lower.includes('504') ||
    lower.includes('timeout') ||
    lower.includes('latency') ||
    lower.includes('slow') ||
    lower.includes('spike')
  ) {
    speech =
      'HTTP 504 error rate is at 78% with p99 latency spiking past 4.8 seconds on checkout routes. I have staged edge traffic shedding on the governance card to protect core transactions.';
    delta.severity = 'CRITICAL';
    delta.newConfirmedFact = {
      text: 'HTTP 504 gateway timeout rate reached 78% on checkout endpoints with p99 latency at 4,800ms.',
      verifiedVia: 'Cloudflare / Envoy Gateway',
      time: timeStr,
    };
    delta.newHypothesis = {
      status: 'INVESTIGATING',
      risk: 'High',
      description: 'Upstream payment provider socket exhaustion cascading to checkout ingress.',
      source: 'Envoy Metrics',
    };
    delta.recommendedAction = {
      actionTitle: 'Enable ingress traffic shedding and route to backup gateway',
      subtitle: 'Envoy Gateway Rate-Limiting & Standby Route Shift',
      impactAssessment: 'Buffers non-essential cart requests while prioritizing active checkout transactions.',
      target: 'envoy-edge-useast1',
    };
    delta.pendingAction = {
      actionTitle: delta.recommendedAction.actionTitle,
      actionSub: delta.recommendedAction.subtitle,
      targetCluster: delta.recommendedAction.target,
      consequence: delta.recommendedAction.impactAssessment,
      requiresApprovalBy: 'Incident Commander (Human)',
      riskLevel: 'CRITICAL SHEDDING',
    };
    delta.impactMetrics = {
      activeImpact: '78% Checkout Transactions Failing',
      estRevenueLoss: '$51,400',
      slaBreachIn: '9m 10s',
      impactedTraffic: '~1,540 users',
    };
    delta.newTimelineEvents = [
      {
        id: `t-${Date.now()}-504`,
        time: timeStr,
        title: 'Ingress 504 threshold confirmed',
        description: 'p99 latency validated across Stripe and PayPal ingress adapters.',
        source: 'Cloudflare Ingress Logs',
        type: 'error',
        badge: '504 LATENCY',
      },
    ];
  }

  // 4. Restart & Recovery
  else if (
    lower.includes('restart') ||
    lower.includes('reboot') ||
    lower.includes('kill') ||
    lower.includes('flush') ||
    lower.includes('pod')
  ) {
    speech =
      'Payment worker pods are hanging and failing readiness probes across the ingress controller. I have staged a rolling restart on the governance card; provide sign-off to recycle the pods.';
    delta.severity = 'CRITICAL';
    delta.newConfirmedFact = {
      text: 'Payment worker pods in k8s-prod-useast1 are unresponsive to readiness probes.',
      verifiedVia: 'Kubernetes Ingress Controller',
      time: timeStr,
    };
    delta.newHypothesis = {
      status: 'INVESTIGATING',
      risk: 'High',
      description: 'Pod thread pool deadlocked following upstream gateway timeout cascade.',
      source: 'EchoOps SRE Diagnostic',
    };
    delta.recommendedAction = {
      actionTitle: 'Rolling restart across payment-service-prod cluster',
      subtitle: 'Kubernetes Ingress Controller Rolling Restart',
      impactAssessment: 'Drops active in-flight checkout connections for 4-7 seconds during pod rotation.',
      target: 'k8s-prod-useast1',
    };
    delta.pendingAction = {
      actionTitle: delta.recommendedAction.actionTitle,
      actionSub: delta.recommendedAction.subtitle,
      targetCluster: delta.recommendedAction.target,
      consequence: delta.recommendedAction.impactAssessment,
      requiresApprovalBy: 'Incident Commander (Human)',
      riskLevel: 'CRITICAL RECOVERY',
    };
  }

  // 5. Resolution & Mitigation
  else if (
    lower.includes('resolved') ||
    lower.includes('mitigated') ||
    lower.includes('fixed') ||
    lower.includes('cleared') ||
    lower.includes('recovering') ||
    lower.includes('normal')
  ) {
    speech =
      'Checkout error rate has normalized to 0.02% and latency is within SLA parameters. Incident mitigation is verified; standing down active war room alerts.';
    delta.severity = 'LOW';
    delta.newConfirmedFact = {
      text: 'Checkout error rate returned to 0.02% with p99 latency normalized to 110ms.',
      verifiedVia: 'Datadog APM',
      time: timeStr,
    };
    delta.newHypothesis = null;
    delta.recommendedAction = null;
    delta.incident = {
      status: 'RESOLVED',
      severity: 'LOW',
      summary: 'Connection pool freed and ingress stabilized. Checkout error rate dropped below 0.05%.',
    };
    delta.impactMetrics = {
      activeImpact: 'Normal (< 0.05% Failure Rate)',
      estRevenueLoss: '$0 / hr',
      slaBreachIn: 'SLA Respected',
      impactedTraffic: '0 Users Affected',
    };
    delta.newTimelineEvents = [
      {
        id: `t-${Date.now()}-res`,
        time: timeStr,
        title: 'Incident Resolved: All Systems Operational',
        description: 'Error rate dropped below 0.05%. PostgreSQL pool locks cleared and traffic flow normal.',
        source: 'EchoOps AI Commander',
        type: 'system',
        badge: 'RESOLVED',
      },
    ];
  }

  return { speech, stateDelta: delta };
}

export async function POST(request: NextRequest) {
  let body: RespondRequest = {};
  try {
    body = (await request.json()) as RespondRequest;
  } catch {
    body = {};
  }

  const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
  const isSseRequested = request.headers.get('accept') === 'text/event-stream';

  const heuristic = extractHeuristicStateDelta(transcript);
  const apiKey = process.env.OPENAI_API_KEY;

  let finalSpeech = heuristic.speech;
  let finalDelta: IncidentStateDelta = heuristic.stateDelta;

  if (apiKey && transcript) {
    try {
      const messages: ConversationMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
      ];

      if (Array.isArray(body.history)) {
        (body.history as ConversationMessage[]).slice(-4).forEach((msg) => {
          if (msg && typeof msg.content === 'string') {
            messages.push({ role: msg.role || 'user', content: msg.content.slice(0, 150) });
          }
        });
      }

      messages.push({
        role: 'user',
        content: `Engineer voice utterance: "${transcript}"\nCurrent Incident Context: Service=payment-service-prod, Environment=PRODUCTION (us-east-1), Active Issue=Checkout gateway 504 timeouts & DB pool saturation.`,
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

      const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (openAiRes.ok) {
        const json = await openAiRes.json();
        const content = json.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (typeof parsed.speech === 'string' && parsed.speech.trim()) {
            finalSpeech = parsed.speech.trim();
          }
          if (parsed.stateDelta && typeof parsed.stateDelta === 'object') {
            finalDelta = {
              ...heuristic.stateDelta,
              ...parsed.stateDelta,
            };
          }
        }
      } else {
        console.warn('[EchoOps] OpenAI respond API error:', openAiRes.status, await openAiRes.text().catch(() => ''));
      }
    } catch (err) {
      console.warn('[EchoOps] OpenAI fetch failed or timed out, using intelligent SRE heuristic:', err);
    }
  }

  // Format response: SSE if requested, otherwise single JSON response
  if (isSseRequested) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: finalSpeech })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', stateDelta: finalDelta })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', actionsExecuted: [] })}\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  }

  return NextResponse.json({
    speech: finalSpeech,
    stateDelta: finalDelta,
  });
}