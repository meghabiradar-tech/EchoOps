import type { ReactNode, JSX } from 'react';

export interface AppProps {
  voiceSlot?: ReactNode;
  liveTranscripts?: Array<{ speaker: string; time: string; text: string }>;
  headerRightSlot?: ReactNode;
  viewMode?: 'dashboard' | 'cockpit' | 'console' | 'timeline' | 'split' | 'incidents' | 'rooms';
  onSelectViewMode?: (mode: 'dashboard' | 'cockpit' | 'console' | 'timeline' | 'split' | 'incidents' | 'rooms') => void;
  showConversation?: boolean;
  onEndConversation?: () => void | Promise<void>;
  isStopping?: boolean;
  channelName?: string;
}

export default function App(props?: AppProps): JSX.Element;
