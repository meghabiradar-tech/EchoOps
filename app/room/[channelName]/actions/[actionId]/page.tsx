import type { Metadata } from 'next';
import { ActionDetailClient } from './ActionDetailClient';

type Props = {
  params: Promise<{ channelName: string; actionId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { channelName, actionId } = await params;
  const decodedChannel = decodeURIComponent(channelName || 'war-room');
  const decodedAction = decodeURIComponent(actionId || 'action');
  return {
    title: `Mitigation Review: ${decodedAction} | ${decodedChannel} | EchoOps`,
    description: `Detailed mitigation review and Human-In-The-Loop execution for ${decodedAction} in ${decodedChannel}`,
  };
}

export default async function ActionDetailPage({ params }: Props) {
  const { channelName, actionId } = await params;
  return <ActionDetailClient channelName={channelName} actionId={actionId} />;
}
