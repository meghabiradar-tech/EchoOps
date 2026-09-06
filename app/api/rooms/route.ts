import { NextRequest, NextResponse } from 'next/server';
import { getAllIncidentRooms, persistTranscriptToDb, persistIncidentToDb } from '@/lib/db/models';
import { getOrCreateIncident } from '@/lib/incidentStore';
import type { IncidentScenario, IncidentSeverity, IncidentStatus } from '@/types/incident';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filterStatus = searchParams.get('status');
    const filterSeverity = searchParams.get('severity');
    const query = (searchParams.get('q') || '').toLowerCase().trim();

    let rooms = await getAllIncidentRooms();

    if (filterStatus) {
      rooms = rooms.filter((r) => r.incident.status === filterStatus);
    }

    if (filterSeverity) {
      rooms = rooms.filter((r) => r.incident.severity === filterSeverity);
    }

    if (query) {
      rooms = rooms.filter(
        (r) =>
          r.channelName.toLowerCase().includes(query) ||
          r.incident.title.toLowerCase().includes(query) ||
          r.transcripts.some((t) => t.text.toLowerCase().includes(query)) ||
          r.transcripts.some((t) => t.speaker.toLowerCase().includes(query)),
      );
    }

    return NextResponse.json({
      success: true,
      totalRooms: rooms.length,
      rooms,
    });
  } catch (error) {
    console.error('[EchoOps] Error fetching incident rooms:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to fetch incident rooms' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawChannel = body.channelName || body.channel || 'echoops-war-room-042';
    const cleanChannel = decodeURIComponent(rawChannel).trim();

    if (body.action === 'create_room' || body.action === 'reopen_room') {
      const scenario = (body.scenario as IncidentScenario) || 'tech_outage';
      const incident = getOrCreateIncident(cleanChannel, scenario);
      if (body.title) incident.title = body.title;
      if (body.severity) incident.severity = body.severity as IncidentSeverity;
      if (body.status) incident.status = body.status as IncidentStatus;

      await persistIncidentToDb(incident);
      return NextResponse.json({ success: true, channelName: cleanChannel, incident });
    }

    if (body.action === 'add_turn' && body.turn) {
      await persistTranscriptToDb({
        channelName: cleanChannel,
        speaker: body.turn.speaker || 'Operator',
        text: body.turn.text || '',
        time: body.turn.time,
      });
      return NextResponse.json({ success: true, message: 'Turn recorded' });
    }

    const incident = getOrCreateIncident(cleanChannel);
    return NextResponse.json({ success: true, incident });
  } catch (error) {
    console.error('[EchoOps] Error creating/updating room:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to process room request' },
      { status: 500 },
    );
  }
}
