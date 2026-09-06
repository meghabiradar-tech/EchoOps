'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

type QuickstartConversationLayoutProps = {
  statusPanel: ReactNode;
  pipelineMetrics: ReactNode;
  transcriptPanel: ReactNode;
  visualizer: ReactNode;
  controls: ReactNode;
  onEndConversation: () => void;
  isEnding?: boolean;
};

export function QuickstartConversationLayout({
  statusPanel,
  pipelineMetrics,
  transcriptPanel,
  visualizer,
  controls,
  onEndConversation,
  isEnding,
}: QuickstartConversationLayoutProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col text-left bg-[#090d16]">
      <header className="flex shrink-0 flex-col gap-3 border-b border-[#1e293b] bg-[#0d1322] px-4 py-3 md:h-[70px] md:flex-row md:items-center md:justify-between md:px-6 md:py-0">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
            <Image
              src="/agora-logo-mark.svg"
              alt="Agora"
              width={26}
              height={26}
              className="h-6 w-6 object-contain"
            />
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-0.5">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-bold text-white font-mono tracking-tight">
                EchoOps AI Commander Voice Bridge
              </span>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
                SD-RTN
              </span>
            </div>
            {pipelineMetrics}
          </div>
        </div>

        <div className="flex items-center gap-2.5 md:pr-1">
          {statusPanel}
          <Button
            variant="destructive"
            size="sm"
            className="h-8 rounded-lg border border-red-500/40 bg-red-600/90 hover:bg-red-500 px-3 text-xs font-bold text-white shadow-sm transition-colors"
            onClick={onEndConversation}
            aria-label="End conversation with AI agent"
            title="End conversation"
            disabled={isEnding}
          >
            {isEnding ? 'Ending...' : 'End Call'}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 w-full flex-1 flex-col gap-4 p-4 md:p-5 lg:flex-row lg:gap-5">
        {/* Transcript / Chat Room Panel (Generous 32rem-36rem width on desktop) */}
        <aside className="order-2 flex-1 min-h-[360px] w-full shrink-0 lg:order-1 lg:h-full lg:w-[32rem] xl:w-[36rem] lg:flex-none">
          {transcriptPanel}
        </aside>

        {/* Visualizer & Audio Dock Main Area */}
        <main className="order-1 flex min-h-0 flex-1 flex-col lg:order-2 rounded-xl border border-[#1e293b] bg-[#0d1322]/60 p-4 shadow-inner">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 items-center justify-center">
              {visualizer}
            </div>
            <div className="shrink-0 pt-4 border-t border-[#1e293b]/60">{controls}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
