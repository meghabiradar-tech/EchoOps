import type { ReactNode, JSX } from 'react';

export interface AppProps {
  voiceSlot?: ReactNode;
  liveTranscripts?: Array<{ speaker: string; time: string; text: string }>;
  headerRightSlot?: ReactNode;
  viewMode?: 'dashboard' | 'console' | 'split';
  onSelectViewMode?: (mode: 'dashboard' | 'console' | 'split') => void;
  showConversation?: boolean;
  onEndConversation?: () => void | Promise<void>;
  isStopping?: boolean;
  channelName?: string;
}

export default function App(props?: AppProps): JSX.Element;
