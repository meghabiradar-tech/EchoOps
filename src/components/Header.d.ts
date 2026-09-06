import type { ReactNode, JSX } from 'react';

export interface HeaderProps {
  viewMode?: 'dashboard' | 'cockpit' | 'console' | 'timeline' | 'split' | 'incidents' | 'rooms' | string;
  onSelectViewMode?: (mode: 'dashboard' | 'cockpit' | 'console' | 'timeline' | 'split' | 'incidents' | 'rooms' | string) => void;
  showConversation?: boolean;
  onEndConversation?: () => void | Promise<void>;
  isStopping?: boolean;
  channelName?: string;
  rightSlot?: ReactNode;
}

export default function Header(props?: HeaderProps): JSX.Element;
