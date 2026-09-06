import { NextRequest, NextResponse } from 'next/server';
import { loadIncidentRoomData, persistTranscriptToDb, persistIncidentToDb } from '@/lib/db/models';
import { getOrCreateIncident, updateIncidentState } from '@/lib/incidentStore';
import type { IncidentState } from '@/types/incident';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ channelName: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { channelName } = await context.params;
    const cleanChannel = decodeURIComponent(channelName || 'echoops-war-room-042').trim();

    const data = await loadIncidentRoomData(cleanChannel);
    return NextResponse.json({
      success: true,
      channel: cleanChannel,
      incident: data.incident,
      transcripts: data.transcripts,
    });
  } catch (error) {
    console.error('Error loading incident data by channel:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to load incident' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { channelName } = await context.params;
    const cleanChannel = decodeURIComponent(channelName || 'echoops-war-room-042').trim();
    const body = (await req.json()) as {
      action?: 'add_transcript' | 'sync_state';
      transcript?: { speaker: string; text: string; time?: string };
      incident?: Partial<IncidentState>;
    };

    if (body.action === 'add_transcript' && body.transcript) {
      await persistTranscriptToDb({
        channelName: cleanChannel,
        speaker: body.transcript.speaker,
        text: body.transcript.text,
        time: body.transcript.time,
      });
      return NextResponse.json({ success: true, message: 'Transcript persisted' });
    }

    if (body.incident) {
      const updated = updateIncidentState(cleanChannel, (prev) => ({
        ...prev,
        ...body.incident,
        channelName: cleanChannel,
      }));
      await persistIncidentToDb(updated);
      return NextResponse.json({ success: true, incident: updated });
    }

    const current = getOrCreateIncident(cleanChannel);
    return NextResponse.json({ success: true, incident: current });
  } catch (error) {
    console.error('Error updating incident:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to update incident' },
      { status: 500 },
    );
  }
}
