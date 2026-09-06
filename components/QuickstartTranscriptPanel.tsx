'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type TranscriptMessage = {
  turn_id?: string | number;
  uid: number;
  text?: string;
  createdAt?: number;
};

type QuickstartTranscriptPanelProps = {
  messageList: TranscriptMessage[];
  currentInProgressMessage: TranscriptMessage | null;
  agentUID: string;
  assistantReply?: string | null;
  isAssistantProcessing?: boolean;
};

function formatMessageTime(createdAt?: number) {
  if (!createdAt) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(createdAt));
}

export function QuickstartTranscriptPanel({
  messageList,
  currentInProgressMessage,
  agentUID,
  assistantReply,
  isAssistantProcessing = false,
}: QuickstartTranscriptPanelProps) {
  const [filterRole, setFilterRole] = useState<'ALL' | 'AI' | 'ENGINEER' | 'SYSTEM'>('ALL');
  const scrollRef = useRef<HTMLDivElement>(null);

  const rawMessages = useMemo(
    () =>
      currentInProgressMessage
        ? [...messageList, currentInProgressMessage]
        : messageList,
    [currentInProgressMessage, messageList],
  );

  const allMessagesWithReply = useMemo(() => {
    return [
      ...rawMessages,
      ...(assistantReply ? [{ uid: Number(agentUID), text: assistantReply, turn_id: 'copilot-reply' }] : []),
    ];
  }, [rawMessages, assistantReply, agentUID]);

  const filteredMessages = useMemo(() => {
    if (filterRole === 'ALL') return allMessagesWithReply;
    if (filterRole === 'AI') {
      return allMessagesWithReply.filter((m) => String(m.uid) === agentUID);
    }
    if (filterRole === 'ENGINEER') {
      return allMessagesWithReply.filter((m) => String(m.uid) !== agentUID);
    }
    if (filterRole === 'SYSTEM') {
      return allMessagesWithReply.filter((m) => {
        const t = (m.text || '').toLowerCase();
        return t.includes('alert') || t.includes('rollback') || t.includes('p99') || t.includes('system') || t.includes('cpu');
      });
    }
    return allMessagesWithReply;
  }, [allMessagesWithReply, filterRole, agentUID]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [filteredMessages]);

  const counts = useMemo(() => {
    return {
      all: allMessagesWithReply.length,
      ai: allMessagesWithReply.filter((m) => String(m.uid) === agentUID).length,
      engineers: allMessagesWithReply.filter((m) => String(m.uid) !== agentUID).length,
      system: allMessagesWithReply.filter((m) => {
        const t = (m.text || '').toLowerCase();
        return t.includes('alert') || t.includes('rollback') || t.includes('p99') || t.includes('system') || t.includes('cpu');
      }).length,
    };
  }, [allMessagesWithReply, agentUID]);

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border bg-card/20"
      aria-label="Transcription panel"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Transcript</h2>
          <p className="text-xs text-muted-foreground">Live voice turns</p>
        </div>
        <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs font-mono text-muted-foreground">
          {filteredMessages.length} turns
        </span>
      </div>

      {/* Quick-Filter Chips */}
      <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/20 px-3 py-2 overflow-x-auto text-[11px]">
        <button
          type="button"
          onClick={() => setFilterRole('ALL')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-colors ${
            filterRole === 'ALL'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-muted/50 text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>All</span>
          <span className="opacity-75 text-[10px]">({counts.all})</span>
        </button>
        <button
          type="button"
          onClick={() => setFilterRole('AI')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-colors ${
            filterRole === 'AI'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-muted/50 text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>AI Commander</span>
          <span className="opacity-75 text-[10px]">({counts.ai})</span>
        </button>
        <button
          type="button"
          onClick={() => setFilterRole('ENGINEER')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-colors ${
            filterRole === 'ENGINEER'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-muted/50 text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>Engineers</span>
          <span className="opacity-75 text-[10px]">({counts.engineers})</span>
        </button>
        <button
          type="button"
          onClick={() => setFilterRole('SYSTEM')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-colors ${
            filterRole === 'SYSTEM'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-muted/50 text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>System Alerts</span>
          <span className="opacity-75 text-[10px]">({counts.system})</span>
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
      >
        {filteredMessages.length === 0 && !assistantReply && !isAssistantProcessing ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            No voice turns found for &ldquo;{filterRole}&rdquo;.
          </div>
        ) : (
          filteredMessages.map((message, index) => {
            const isAgent = String(message.uid) === agentUID;
            const label = isAgent ? 'EchoOps AI Commander' : `Engineer (${message.uid})`;
            const text = message.text?.trim();
            const time = formatMessageTime(message.createdAt);

            return (
              <article
                key={`${message.turn_id ?? message.uid}-${index}`}
                className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'}`}
              >
                <div className="mb-1 flex items-center gap-2 px-1 text-xs font-semibold text-muted-foreground">
                  <span className={isAgent ? 'text-purple-400' : 'text-blue-400'}>{label}</span>
                  {time && <span className="font-normal">{time}</span>}
                </div>
                <div
                  className={`max-w-full whitespace-pre-wrap rounded-xl border px-3 py-2 text-sm leading-6 ${
                    isAgent
                      ? 'border-purple-500/20 bg-purple-950/20 text-purple-100 shadow-sm'
                      : 'border-blue-500/20 bg-blue-950/20 text-blue-100 shadow-sm'
                  }`}
                >
                  {text || '...'}
                </div>
              </article>
            );
          })
        )}
        {isAssistantProcessing && (
          <div className="self-start rounded-xl border border-purple-500/30 bg-purple-950/30 px-3 py-2 text-sm text-purple-200 animate-pulse">
            EchoOps AI is triaging incident...
          </div>
        )}
      </div>
    </section>
  );
}
