import type { ReactNode, JSX } from 'react';

export interface AppProps {
  voiceSlot?: ReactNode;
  liveTranscripts?: Array<{ speaker: string; time: string; text: string }>;
  headerRightSlot?: ReactNode;
}

export default function App(props?: AppProps): JSX.Element;
