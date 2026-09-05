import type { Metadata } from 'next';
import { RoomClient } from './RoomClient';

type Props = {
  params: Promise<{ channelName: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { channelName } = await params;
  const decoded = decodeURIComponent(channelName || 'echoops-war-room-042');
  return {
    title: `War Room: ${decoded} | EchoOps`,
    description: `EchoOps Real-Time Voice AI Incident Room for ${decoded}`,
  };
}

export default async function RoomPage({ params }: Props) {
  const { channelName } = await params;
  return <RoomClient channelName={channelName} />;
}
