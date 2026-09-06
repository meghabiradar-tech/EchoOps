import { NextRequest, NextResponse } from 'next/server';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { GET as generateAgoraToken } from '@/app/api/generate-agora-token/route';

export const dynamic = 'force-dynamic';

const EXPIRATION_TIME_IN_SECONDS = 3600;
const CHANNEL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(request: NextRequest) {
  return generateAgoraToken(request);
}

export async function POST(request: NextRequest) {
  const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
  const APP_CERTIFICATE = process.env.NEXT_AGORA_APP_CERTIFICATE;

  if (!APP_ID || !APP_CERTIFICATE) {
    return NextResponse.json(
      { error: 'Agora credentials are not set' },
      { status: 500 },
    );
  }

  let body: { channelName?: string; channel?: string; uid?: number | string } = {};
  try {
    body = await request.json();
  } catch {}

  const channelRaw = (body.channelName || body.channel || 'echoops-war-room').trim();
  if (channelRaw && !CHANNEL_NAME_PATTERN.test(channelRaw)) {
    return NextResponse.json(
      {
        error:
          'Channel names must be 1-64 characters and use only letters, numbers, hyphens, or underscores',
      },
      { status: 400 },
    );
  }
  const channelName = channelRaw || 'echoops-war-room';

  const uidStr = body.uid ? String(body.uid) : '';
  const parsedUid = uidStr ? parseInt(uidStr, 10) : Number.NaN;
  const uid = Number.isNaN(parsedUid) || parsedUid <= 0
    ? Math.floor(Math.random() * 9_999_000) + 1000
    : parsedUid;

  const expirationTime = Math.floor(Date.now() / 1000) + EXPIRATION_TIME_IN_SECONDS;

  try {
    const token = RtcTokenBuilder.buildTokenWithRtm(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uid.toString(),
      RtcRole.PUBLISHER,
      expirationTime,
      expirationTime,
    );

    return NextResponse.json({
      token,
      rtcToken: token,
      rtmToken: token,
      channel: channelName,
      channelName,
      uid: uid.toString(),
    });
  } catch (error) {
    console.error('Failed to generate Agora token in POST /api/agora/token:', error);
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 },
    );
  }
}
