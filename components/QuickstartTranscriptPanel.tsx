'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Bot,
  User,
  AlertTriangle,
  Copy,
  Check,
  ChevronDown,
  Sparkles,
  Shield,
  Filter,
} from 'lucide-react';

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
  if (!createdAt) {
    const now = new Date();
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(now);
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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
  const [copiedTurnId, setCopiedTurnId] = useState<string | number | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rawMessages = useMemo(
    () =>
      currentInProgressMessage
        ? [...messageList, currentInProgressMessage]
        : messageList,
    [currentInProgressMessage, messageList],
  );

  const allMessagesWithReply = useMemo(() => {
    if (!assistantReply) return rawMessages;
    const isAlreadyPresent = rawMessages.some(
      (m) => (m.text || '').trim().toLowerCase() === assistantReply.trim().toLowerCase(),
    );
    if (isAlreadyPresent) return rawMessages;
    return [
      ...rawMessages,
      { uid: Number(agentUID), text: assistantReply, turn_id: 'copilot-reply' },
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
        return (
          t.includes('alert') ||
          t.includes('rollback') ||
          t.includes('p99') ||
          t.includes('system') ||
          t.includes('cpu') ||
          t.includes('database')
        );
      });
    }
    return allMessagesWithReply;
  }, [allMessagesWithReply, filterRole, agentUID]);

  const scrollToBottom = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    setShowScrollBottom(false);
  }, []);

  const handleScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const isNearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    setShowScrollBottom(!isNearBottom);
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    // Auto-scroll if close to bottom
    const isNearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
    if (isNearBottom) {
      node.scrollTop = node.scrollHeight;
    }
  }, [filteredMessages.length, assistantReply, isAssistantProcessing]);

  const counts = useMemo(() => {
    return {
      all: allMessagesWithReply.length,
      ai: allMessagesWithReply.filter((m) => String(m.uid) === agentUID).length,
      engineers: allMessagesWithReply.filter((m) => String(m.uid) !== agentUID).length,
      system: allMessagesWithReply.filter((m) => {
        const t = (m.text || '').toLowerCase();
        return (
          t.includes('alert') ||
          t.includes('rollback') ||
          t.includes('p99') ||
          t.includes('system') ||
          t.includes('cpu') ||
          t.includes('database')
        );
      }).length,
    };
  }, [allMessagesWithReply, agentUID]);

  const copyTurnText = (id: string | number, text?: string) => {
    if (!text || typeof navigator === 'undefined') return;
    navigator.clipboard.writeText(text);
    setCopiedTurnId(id);
    setTimeout(() => setCopiedTurnId(null), 1800);
  };

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-[#1e293b] bg-[#090d16] shadow-2xl relative"
      aria-label="War Room Live Transcript"
    >
      {/* Header Bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#1e293b] bg-[#0d1322] px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-indigo-400">
            <Bot size={15} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 font-mono">
                War Room Transcript
              </h2>
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Real-Time Voice & SRE Telemetry</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-md border border-[#1e293b] bg-[#151d30] px-2.5 py-1 text-[11px] font-mono font-semibold text-slate-300">
            {filteredMessages.length} Turns
          </span>
        </div>
      </div>

      {/* Role Filter Tabs */}
      <div className="flex items-center gap-1.5 border-b border-[#1e293b] bg-[#0b101c] px-3 py-2 overflow-x-auto text-[11px] shrink-0">
        <button
          type="button"
          onClick={() => setFilterRole('ALL')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
            filterRole === 'ALL'
              ? 'bg-indigo-600 text-white font-semibold shadow-[0_0_10px_rgba(79,70,229,0.4)] border border-indigo-400/40'
              : 'bg-[#151d30] text-slate-400 border border-[#1e293b] hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Filter size={11} />
          <span>All</span>
          <span className="opacity-80 text-[10px] font-mono">({counts.all})</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterRole('AI')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
            filterRole === 'AI'
              ? 'bg-purple-600 text-white font-semibold shadow-[0_0_10px_rgba(147,51,234,0.4)] border border-purple-400/40'
              : 'bg-[#151d30] text-slate-400 border border-[#1e293b] hover:text-purple-300 hover:border-purple-800/60'
          }`}
        >
          <Bot size={11} />
          <span>AI Commander</span>
          <span className="opacity-80 text-[10px] font-mono">({counts.ai})</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterRole('ENGINEER')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
            filterRole === 'ENGINEER'
              ? 'bg-blue-600 text-white font-semibold shadow-[0_0_10px_rgba(37,99,235,0.4)] border border-blue-400/40'
              : 'bg-[#151d30] text-slate-400 border border-[#1e293b] hover:text-blue-300 hover:border-blue-800/60'
          }`}
        >
          <User size={11} />
          <span>Responders</span>
          <span className="opacity-80 text-[10px] font-mono">({counts.engineers})</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterRole('SYSTEM')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
            filterRole === 'SYSTEM'
              ? 'bg-amber-600 text-white font-semibold shadow-[0_0_10px_rgba(217,119,6,0.4)] border border-amber-400/40'
              : 'bg-[#151d30] text-slate-400 border border-[#1e293b] hover:text-amber-300 hover:border-amber-800/60'
          }`}
        >
          <AlertTriangle size={11} />
          <span>Alerts</span>
          <span className="opacity-80 text-[10px] font-mono">({counts.system})</span>
        </button>
      </div>

      {/* Messages Stream Body */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4 bg-[#090d16]"
      >
        {filteredMessages.length === 0 && !assistantReply && !isAssistantProcessing ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-8 text-slate-400 space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#151d30] border border-[#1e293b] text-indigo-400 shadow-inner">
              <span className="relative flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500" />
              </span>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-200">Listening to War Room Audio</p>
              <p className="text-[11px] max-w-[240px] text-slate-400 leading-relaxed mt-1">
                Speak into your mic or trigger runbook diagnostics to stream live turns.
              </p>
            </div>
          </div>
        ) : (
          filteredMessages.map((message, index) => {
            const isAgent = String(message.uid) === agentUID;
            const isSystem =
              (message.text || '').toLowerCase().includes('alert') ||
              (message.text || '').toLowerCase().includes('database connection pool') ||
              (message.text || '').toLowerCase().includes('p99');
            const turnKey = message.turn_id ?? `${message.uid}-${index}`;
            const time = formatMessageTime(message.createdAt);
            const text = message.text?.trim() || '';

            return (
              <article
                key={turnKey}
                className={`group relative flex flex-col rounded-xl border transition-all ${
                  isAgent
                    ? 'border-purple-500/30 bg-[#0f1426] shadow-[0_2px_12px_rgba(147,51,234,0.06)]'
                    : isSystem
                    ? 'border-amber-500/30 bg-[#161210] shadow-[0_2px_12px_rgba(245,158,11,0.06)]'
                    : 'border-blue-500/30 bg-[#0b162c] shadow-[0_2px_12px_rgba(59,130,246,0.06)]'
                } p-3`}
              >
                {/* Message Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] ${
                        isAgent
                          ? 'bg-purple-900/60 text-purple-300 border border-purple-500/40'
                          : isSystem
                          ? 'bg-amber-900/60 text-amber-300 border border-amber-500/40'
                          : 'bg-blue-900/60 text-blue-300 border border-blue-500/40'
                      }`}
                    >
                      {isAgent ? <Bot size={12} /> : isSystem ? <Shield size={12} /> : <User size={12} />}
                    </div>
                    <span
                      className={`text-xs font-bold font-mono tracking-tight ${
                        isAgent ? 'text-purple-300' : isSystem ? 'text-amber-300' : 'text-blue-300'
                      }`}
                    >
                      {isAgent ? 'EchoOps AI Commander' : isSystem ? 'System Telemetry' : 'Incident Responder'}
                    </span>
                    <span
                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase font-mono ${
                        isAgent
                          ? 'bg-purple-950/80 text-purple-400 border border-purple-800/60'
                          : isSystem
                          ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                          : 'bg-blue-950/80 text-blue-400 border border-blue-800/60'
                      }`}
                    >
                      {isAgent ? 'AI COPILOT' : isSystem ? 'AUTOMATION' : 'HUMAN'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                    <span>{time}</span>
                    <button
                      type="button"
                      onClick={() => copyTurnText(turnKey, text)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                      title="Copy transcript turn"
                    >
                      {copiedTurnId === turnKey ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>

                {/* Message Content */}
                <div
                  className={`text-[12.5px] leading-relaxed whitespace-pre-wrap font-sans ${
                    isAgent ? 'text-slate-100' : isSystem ? 'text-amber-100' : 'text-slate-200'
                  }`}
                >
                  {text || '...'}
                </div>
              </article>
            );
          })
        )}

        {/* Processing Indicator */}
        {isAssistantProcessing && (
          <div className="flex items-center gap-2.5 rounded-xl border border-purple-500/40 bg-[#12162a] p-3 text-xs text-purple-200 shadow-md">
            <Sparkles size={14} className="text-purple-400 animate-spin" />
            <span className="font-medium">EchoOps AI Commander is evaluating incident metrics & runbook...</span>
          </div>
        )}
      </div>

      {/* Jump to bottom floating button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-semibold shadow-lg hover:bg-indigo-500 border border-indigo-400/40 transition-all animate-bounce"
        >
          <ChevronDown size={13} />
          <span>Latest turns</span>
        </button>
      )}
    </section>
  );
}
