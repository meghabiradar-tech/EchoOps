import { NextRequest, NextResponse } from 'next/server';
import type { IncidentState } from '@/types/incident';
import { updateIncidentState, getOrCreateIncident } from '@/lib/incidentStore';
import { persistIncidentToDb } from '@/lib/db/models';
import { wsHub } from '@/lib/wsHub';
import { sendSlackActionItem, sendSlackConflictAlert } from '@/lib/integrations/slack';
import { createJiraTicketFromAction } from '@/lib/integrations/jira';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as Partial<IncidentState>;
    const channel = payload.channelName || 'echoops-war-room';

    if (!payload.title && !payload.facts && !payload.actionItems) {
      return NextResponse.json({ error: 'Invalid incident_state payload from AI pipeline' }, { status: 400 });
    }

    // 1. Update In-Memory Operational Store
    const updatedIncident = updateIncidentState(channel, (prev) => {
      return {
        ...prev,
        ...payload,
        id: payload.id || prev.id,
        title: payload.title || prev.title,
        severity: payload.severity || prev.severity,
        status: payload.status || prev.status,
        scenario: payload.scenario || prev.scenario,
        facts: payload.facts ? payload.facts : prev.facts,
        hypotheses: payload.hypotheses ? payload.hypotheses : prev.hypotheses,
        decisions: payload.decisions ? payload.decisions : prev.decisions,
        actionItems: payload.actionItems ? payload.actionItems : prev.actionItems,
        conflicts: payload.conflicts ? payload.conflicts : prev.conflicts,
        missingGaps: payload.missingGaps ? payload.missingGaps : prev.missingGaps,
        timeline: payload.timeline ? payload.timeline : prev.timeline,
        unresolvedRisks: payload.unresolvedRisks ? payload.unresolvedRisks : prev.unresolvedRisks,
      };
    });

    // 2. Persist to PostgreSQL with fallback
    await persistIncidentToDb(updatedIncident);

    // 3. Broadcast Real-Time WebSocket Events to Frontend Dashboard
    wsHub.broadcastStateUpdate(updatedIncident);

    // If new action item was present, broadcast action.assigned and dispatch
    if (payload.actionItems && payload.actionItems.length > 0) {
      const latestAction = payload.actionItems[0];
      wsHub.broadcastActionAssigned(latestAction, updatedIncident.title);

      // Async outbound notification
      sendSlackActionItem(latestAction, updatedIncident.title).catch(console.warn);
      if (latestAction.status !== 'completed') {
        createJiraTicketFromAction(latestAction, updatedIncident).catch(console.warn);
      }
    }

    // If new conflict was detected, broadcast conflict.raised
    if (payload.conflicts && payload.conflicts.length > 0) {
      const latestConflict = payload.conflicts[0];
      wsHub.broadcastConflictRaised(latestConflict);
      sendSlackConflictAlert(latestConflict).catch(console.warn);
    }

    return NextResponse.json({
      success: true,
      message: 'Incident state received, persisted, and broadcasted.',
      incident: updatedIncident,
    });
  } catch (error) {
    console.error('Error in /api/orchestration/state:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to process state update' },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channel = searchParams.get('channel') || 'echoops-war-room';
  const incident = getOrCreateIncident(channel);
  return NextResponse.json(incident);
}
