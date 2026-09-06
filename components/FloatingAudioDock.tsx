'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { IMicrophoneAudioTrack } from 'agora-rtc-react';
import { MicrophoneSelector } from './MicrophoneSelector';
import { Button } from '@/components/ui/button';

export type FloatingAudioDockProps = {
  isMicEnabled: boolean;
  onToggleMic: () => void;
  isDeafened: boolean;
  onToggleDeafen: () => void;
  isVadActive: boolean;
  isBotSpeaking: boolean;
  connectionState: string;
  localMicrophoneTrack: IMicrophoneAudioTrack | null;
  onEndConversation: () => void;
  isEnding?: boolean;
  onSaveSummary?: () => void;
  channelName?: string;
};

export function FloatingAudioDock({
  isMicEnabled,
  onToggleMic,
  isDeafened,
  onToggleDeafen,
  isVadActive,
  isBotSpeaking,
  connectionState,
  localMicrophoneTrack,
  onEndConversation,
  isEnding = false,
  onSaveSummary,
  channelName,
}: FloatingAudioDockProps) {
  const [showConfirmLeave, setShowConfirmLeave] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isConnected = connectionState === 'CONNECTED';
  const isReconnecting = connectionState === 'RECONNECTING' || connectionState === 'CONNECTING';

  const dockContent = (
    <nav
      aria-label="Floating Audio Control Dock"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 rounded-2xl border border-slate-700/50 bg-slate-900/80 px-4 py-2.5 shadow-2xl backdrop-blur-md transition-all duration-300"
    >
      {/* AI Commander Avatar & Voice Wave Activity Indicator */}
      <div className="relative flex items-center gap-2.5 pr-2.5 border-r border-slate-700/60">
        <div
          className={`relative h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
            isBotSpeaking
              ? 'bg-purple-600/30 border border-purple-500/60 shadow-[0_0_16px_rgba(168,85,247,0.5)]'
              : 'bg-slate-800/80 border border-slate-700/60 text-slate-300'
          }`}
          title={isBotSpeaking ? 'AI Commander is speaking' : 'AI Incident Commander'}
        >
          {/* Pure SVG Bot Avatar */}
          <svg
            className={`h-5 w-5 ${isBotSpeaking ? 'text-purple-300' : 'text-slate-300'}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 8V4H8" />
            <rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M2 14h2" />
            <path d="M20 14h2" />
            <path d="M15 13v2" />
            <path d="M9 13v2" />
          </svg>
          {isBotSpeaking && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500" />
            </span>
          )}
        </div>

        {/* Voice Wave Activity Indicator next to AI Avatar */}
        <div
          className="flex items-center gap-1 h-5 px-1"
          title={
            isBotSpeaking
              ? 'AI Commander Speaking'
              : isVadActive
              ? 'Responder Speaking'
              : 'Voice Bridge Listening'
          }
          aria-label="Voice wave activity indicator"
        >
          <span
            className={`w-1 rounded-full transition-all duration-150 ${
              isBotSpeaking
                ? 'bg-purple-400 animate-[waveAnimation_0.8s_ease-in-out_infinite] h-5'
                : isVadActive
                ? 'bg-emerald-400 animate-[waveAnimation_0.8s_ease-in-out_infinite] h-4'
                : 'bg-slate-600 h-1.5'
            }`}
          />
          <span
            className={`w-1 rounded-full transition-all duration-150 ${
              isBotSpeaking
                ? 'bg-purple-400 animate-[waveAnimation_0.8s_ease-in-out_0.2s_infinite] h-4'
                : isVadActive
                ? 'bg-emerald-400 animate-[waveAnimation_0.8s_ease-in-out_0.2s_infinite] h-5'
                : 'bg-slate-600 h-2'
            }`}
          />
          <span
            className={`w-1 rounded-full transition-all duration-150 ${
              isBotSpeaking
                ? 'bg-purple-400 animate-[waveAnimation_0.8s_ease-in-out_0.4s_infinite] h-5'
                : isVadActive
                ? 'bg-emerald-400 animate-[waveAnimation_0.8s_ease-in-out_0.4s_infinite] h-3'
                : 'bg-slate-600 h-1'
            }`}
          />
        </div>

        <div className="hidden lg:flex flex-col text-[10px] leading-tight">
          <span className="font-mono font-bold text-slate-200">
            {isBotSpeaking ? 'AI Speaking' : isVadActive ? 'User Speaking' : 'Listening'}
          </span>
          <span
            className={`font-mono text-[9px] ${
              isConnected ? 'text-emerald-400' : isReconnecting ? 'text-amber-400' : 'text-rose-400'
            }`}
          >
            {connectionState}
          </span>
        </div>
      </div>

      {/* Mic Mute / Unmute Button with Active Glow */}
      <div className="relative">
        <button
          type="button"
          onClick={onToggleMic}
          disabled={!localMicrophoneTrack}
          aria-label={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
          title={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
          className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 ${
            !localMicrophoneTrack
              ? 'bg-muted/40 text-muted-foreground/50 cursor-not-allowed'
              : isMicEnabled
              ? isVadActive
                ? 'bg-emerald-500 text-white shadow-[0_0_16px_rgba(16,185,129,0.6)] scale-105'
                : 'bg-primary text-primary-foreground shadow-md hover:bg-primary/90'
              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25'
          }`}
        >
          {isMicEnabled ? (
            <svg
              className="h-5 w-5 transition-transform group-active:scale-95"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          ) : (
            <svg
              className="h-5 w-5 transition-transform group-active:scale-95 text-rose-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="2" x2="22" y1="2" y2="22" />
              <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
              <path d="M5 10v2a7 7 0 0 0 12 5" />
              <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          )}
        </button>
        {isMicEnabled && isVadActive && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </span>
        )}
      </div>

      {/* Speaker Deafen / Un-deafen Button */}
      <button
        type="button"
        onClick={onToggleDeafen}
        aria-label={isDeafened ? 'Undeafen speakers' : 'Deafen speakers (mute incoming voice)'}
        title={isDeafened ? 'Undeafen speakers' : 'Deafen speakers (mute incoming voice)'}
        className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 ${
          isDeafened
            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30'
            : 'bg-muted/70 text-foreground hover:bg-muted'
        }`}
      >
        {isDeafened ? (
          <svg
            className="h-5 w-5 transition-transform group-active:scale-95 text-amber-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="22" x2="16" y1="9" y2="15" />
            <line x1="16" x2="22" y1="9" y2="15" />
          </svg>
        ) : (
          <svg
            className="h-5 w-5 transition-transform group-active:scale-95"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )}
      </button>

      {/* Microphone Hardware Device Selector */}
      <div className="hidden sm:block">
        <MicrophoneSelector localMicrophoneTrack={localMicrophoneTrack} />
      </div>

      {/* Save Incident Summary Button */}
      {onSaveSummary && (
        <button
          type="button"
          onClick={onSaveSummary}
          title="Download Incident Post-Mortem & Timeline"
          className="hidden md:flex items-center gap-1.5 h-10 px-3 rounded-xl bg-muted/60 text-xs font-medium text-foreground hover:bg-muted transition-colors border border-border/60"
        >
          <svg
            className="h-4 w-4 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          <span>Save Post-Mortem</span>
        </button>
      )}

      {/* End Call Button with High-Contrast Red & Confirmation Popover */}
      <div className="relative pl-1 border-l border-slate-700/60">
        {!showConfirmLeave ? (
          <button
            type="button"
            onClick={() => setShowConfirmLeave(true)}
            disabled={isEnding}
            aria-label="End Call"
            title="End Call & Disconnect Voice Bridge"
            className="flex h-10 items-center gap-2 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 px-3.5 text-xs font-bold text-white shadow-lg shadow-red-600/30 border border-red-500/40 transition-all duration-200 active:scale-95"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
              <line x1="23" x2="1" y1="1" y2="23" />
            </svg>
            <span className="hidden sm:inline">End Call</span>
          </button>
        ) : (
          <div
            role="alertdialog"
            aria-label="Confirm Leaving Bridge"
            className="absolute bottom-12 right-0 flex flex-col gap-2 rounded-xl border border-red-500/50 bg-slate-900 p-3 shadow-2xl w-60 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-red-400">
              <svg
                className="h-4 w-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>End Call for #{channelName || 'room'}?</span>
            </div>
            <p className="text-[11px] text-slate-400">
              You will disconnect from audio and live agent telemetry.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 flex-1 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
                onClick={() => setShowConfirmLeave(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 flex-1 text-xs bg-red-600 hover:bg-red-500 text-white font-bold"
                onClick={() => {
                  setShowConfirmLeave(false);
                  onEndConversation();
                }}
                disabled={isEnding}
              >
                {isEnding ? 'Ending...' : 'Confirm'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );

  if (mounted && typeof document !== 'undefined') {
    return createPortal(dockContent, document.body);
  }

  return dockContent;
}
