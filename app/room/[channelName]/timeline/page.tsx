import type { Metadata } from 'next';
import { TimelineDrilldownClient } from './TimelineDrilldownClient';

type Props = {
  params: Promise<{ channelName: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { channelName } = await params;
  const decoded = decodeURIComponent(channelName || 'war-room');
  return {
    title: `Post-Mortem & Timeline: ${decoded} | EchoOps`,
    description: `Chronological incident post-mortem and timeline drilldown for ${decoded}`,
  };
}

export default async function TimelineDrilldownPage({ params }: Props) {
  const { channelName } = await params;
  return <TimelineDrilldownClient channelName={channelName} />;
}
