'use client';

import { useState, useRef, Suspense, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { RTMClient } from 'agora-rtm';
import {
  Radio,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  LayoutDashboard,
  Terminal,
  Columns2,
  PhoneOff,
  Activity,
  Sparkles,
  Layers,
} from 'lucide-react';
import type {
  AgoraTokenData,
  ClientStartRequest,
  AgentResponse,
  AgoraRenewalTokens,
} from '@/types/conversation';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { Button } from '@/components/ui/button';
import { IncidentProvider } from '@/src/context/IncidentContext';
import IncidentDashboard from '@/src/App';

// Dynamically import ActiveRoom with ssr disabled to protect browser-only Agora SDK
const ActiveRoom = dynamic(() => import('@/components/ActiveRoom'), {
  ssr: false,
});

// Browser-only AgoraRTCProvider with StrictMode-safe useRef client creation
const AgoraProvider = dynamic(
  async () => {
    const { AgoraRTCProvider, default: AgoraRTC } =
      await import('agora-rtc-react');
    return {
      default: function AgoraProviders({
        children,
      }: {
        children: React.ReactNode;
      }) {
        const clientRef = useRef<ReturnType<
          typeof AgoraRTC.createClient
        > | null>(null);
        if (!clientRef.current) {
          clientRef.current = AgoraRTC.createClient({
            mode: 'rtc',
            codec: 'vp8',
          });
        }
        return (
          <AgoraRTCProvider client={clientRef.current}>
            {children}
          </AgoraRTCProvider>
        );
      },
    };
  },
  { ssr: false },
);

type ViewMode = 'dashboard' | 'console' | 'split';

interface RoomClientProps {
  channelName: string;
}

export function RoomClient({ channelName }: RoomClientProps) {
  const router = useRouter();
  const cleanChannel = decodeURIComponent(channelName).trim() || 'echoops-war-room-042';

  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [micWarning, setMicWarning] = useState<string | null>(null);
  const [localModeNotice, setLocalModeNotice] = useState<string | null>(null);
  const [agoraData, setAgoraData] = useState<AgoraTokenData | null>(null);
  const [rtmClient, setRtmClient] = useState<RTMClient | null>(null);
  const [agentJoinError, setAgentJoinError] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isLocalVoiceMode, setIsLocalVoiceMode] = useState(false);

  // 1. Check Microphone Permissions cleanly
  const checkMicPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop test probe stream immediately so Agora RTC track or Web Speech has sole ownership
      stream.getTracks().forEach((track) => track.stop());
      setMicWarning(null);
    } catch (err: unknown) {
      const error = err as Error;
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        const warning =
          'Microphone permission denied (NotAllowedError). Please allow microphone access in your browser to speak with the AI Incident Commander.';
        console.warn(`[EchoOps] ${warning}`);
        setMicWarning(warning);
      } else {
        console.warn('[EchoOps] Audio initialization probe note:', error);
      }
    }
  }, []);

  // 2. Connect Agora Voice AI Room or gracefully fallback to Local Voice AI mode
  const connectRoom = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAgentJoinError(false);
    setLocalModeNotice(null);

    try {
      await checkMicPermission();

      const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
      if (!appId) {
        console.warn('[EchoOps] NEXT_PUBLIC_AGORA_APP_ID not configured. Using Local Voice AI Mode.');
        setIsLocalVoiceMode(true);
        setLocalModeNotice(
          'Running in Local Voice AI Mode (Agora App ID not configured in .env.local). Browser Speech-to-Text, LLM Commander, and Speech Synthesis are active.',
        );
        setAgoraData({
          token: '',
          uid: String(Math.floor(Math.random() * 90000) + 10000),
          channel: cleanChannel,
        });
        setIsLoading(false);
        return;
      }

      const channelQuery = `?channel=${encodeURIComponent(cleanChannel)}`;
      const agoraResponse = await fetch(`/api/generate-agora-token${channelQuery}`);
      const responseData = await agoraResponse.json();

      if (!agoraResponse.ok || !responseData.token) {
        console.warn('[EchoOps] Agora token unavailable. Falling back to Local Voice AI Mode.');
        setIsLocalVoiceMode(true);
        setLocalModeNotice(
          'Running in Local Voice AI Mode. Browser Speech-to-Text and AI Commander LLM are active.',
        );
        setAgoraData({
          token: '',
          uid: String(Math.floor(Math.random() * 90000) + 10000),
          channel: cleanChannel,
        });
        setIsLoading(false);
        return;
      }

      // Parallel agent invite and RTM setup
      const [agentData, rtm] = await Promise.all([
        fetch('/api/invite-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requester_id: responseData.uid,
            channel_name: responseData.channel,
          } as ClientStartRequest),
        })
          .then(async (res) => {
            if (!res.ok) {
              setAgentJoinError(true);
              return null;
            }
            return res.json() as Promise<AgentResponse>;
          })
          .catch((err) => {
            console.error('[EchoOps] Failed to invite AI agent:', err);
            setAgentJoinError(true);
            return null;
          }),

        (async () => {
          try {
            const { default: AgoraRTM } = await import('agora-rtm');
            const rtmInstance: RTMClient = new AgoraRTM.RTM(appId, responseData.uid);
            await rtmInstance.login({ token: responseData.token });
            await rtmInstance.subscribe(responseData.channel);
            return rtmInstance;
          } catch (rtmErr) {
            console.warn('[EchoOps] RTM connection note:', rtmErr);
            return null;
          }
        })(),
      ]);

      setRtmClient(rtm);
      setAgoraData({ ...responseData, agentId: agentData?.agent_id });
      setIsLocalVoiceMode(false);
    } catch (err: unknown) {
      console.warn('[EchoOps] Error connecting Agora voice, falling back to Local Voice AI mode:', err);
      setIsLocalVoiceMode(true);
      setLocalModeNotice(
        'Running in Local Voice AI Mode. Browser Speech-to-Text and AI Commander LLM are active.',
      );
      setAgoraData({
        token: '',
        uid: String(Math.floor(Math.random() * 90000) + 10000),
        channel: cleanChannel,
      });
    } finally {
      setIsLoading(false);
    }
  }, [cleanChannel, checkMicPermission]);

  useEffect(() => {
    connectRoom();
  }, [connectRoom]);

  // Token Renewal Callback
  const handleTokenWillExpire = useCallback(
    async (uid: string): Promise<AgoraRenewalTokens> => {
      try {
        const channel = agoraData?.channel;
        if (!channel) throw new Error('Missing channel for token renewal');

        const [rtcResponse, rtmResponse] = await Promise.all([
          fetch(`/api/generate-agora-token?channel=${encodeURIComponent(channel)}&uid=${uid}`),
          fetch(`/api/generate-agora-token?channel=${encodeURIComponent(channel)}&uid=${agoraData.uid}`),
        ]);
        const [rtcData, rtmData] = await Promise.all([
          rtcResponse.json(),
          rtmResponse.json(),
        ]);

        if (!rtcResponse.ok || !rtmResponse.ok) {
          throw new Error('Failed to generate renewal tokens');
        }

        return {
          rtcToken: rtcData.token,
          rtmToken: rtmData.token,
        };
      } catch (error) {
        console.error('[EchoOps] Error renewing token:', error);
        throw error;
      }
    },
    [agoraData],
  );

  // End / Leave War Room
  const handleEndConversation = async () => {
    if (isStopping) return;
    setIsStopping(true);

    if (agoraData?.agentId) {
      try {
        await fetch('/api/stop-conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: agoraData.agentId }),
        });
      } catch (error) {
        console.error('[EchoOps] Error stopping agent:', error);
      }
    }

    rtmClient?.logout().catch((err) => console.error('[EchoOps] RTM logout error:', err));
    setRtmClient(null);

    if (window.opener) {
      window.close();
    } else {
      router.push('/');
    }
  };

  // Top header controls for War Room
  const warRoomHeaderControls = (
    <div className="flex items-center gap-2.5">
      {/* View Mode Switcher */}
      <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setViewMode('dashboard')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
            viewMode === 'dashboard'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
          id="room-tab-dashboard"
        >
          <LayoutDashboard size={14} />
          <span>Dashboard</span>
        </button>

        <button
          onClick={() => setViewMode('console')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
            viewMode === 'console'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
          id="room-tab-console"
        >
          <Terminal size={14} />
          <span>Voice Console</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </button>

        <button
          onClick={() => setViewMode('split')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
            viewMode === 'split'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
          id="room-tab-split"
        >
          <Columns2 size={14} />
          <span>Split</span>
        </button>
      </div>

      {/* All Rooms & History Directory Link */}
      <Link
        href="/rooms"
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        id="room-all-rooms-header-btn"
        title="View All Incident Rooms & History"
      >
        <Activity size={13} className="text-indigo-500" />
        <span className="hidden sm:inline">All Rooms</span>
      </Link>

      {/* Timeline Drilldown Link */}
      <Link
        href={`/room/${encodeURIComponent(cleanChannel)}/timeline`}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-colors"
        id="room-timeline-drilldown-header-btn"
      >
        <Layers size={13} />
        <span>Timeline Drilldown</span>
      </Link>

      {/* Leave Room Button */}
      <button
        onClick={handleEndConversation}
        disabled={isStopping}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 hover:bg-red-100 transition-colors"
        id="leave-war-room-btn"
      >
        <PhoneOff size={13} />
        <span>{isStopping ? 'Leaving...' : 'Leave Room'}</span>
      </button>
    </div>
  );

  // Active Agora Voice Component
  const activeAgoraView = agoraData && (
    <Suspense fallback={<LoadingSkeleton />}>
      <ErrorBoundary>
        <AgoraProvider>
          <ActiveRoom
            agoraData={agoraData}
            rtmClient={rtmClient}
            onTokenWillExpire={handleTokenWillExpire}
            onEndConversation={handleEndConversation}
            isStopping={isStopping}
          />
        </AgoraProvider>
      </ErrorBoundary>
    </Suspense>
  );

  return (
    <IncidentProvider initialChannel={cleanChannel}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        {/* Top Warning Banner for Mic Issues */}
        {micWarning && (
          <div className="flex items-center justify-between border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} />
              <span>{micWarning}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px]"
              onClick={checkMicPermission}
            >
              Grant Permission
            </Button>
          </div>
        )}

        {/* Local Voice Mode Notice */}
        {localModeNotice && (
          <div className="flex items-center gap-2 border-b border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 px-4 py-1.5 text-xs text-indigo-700 dark:text-indigo-300 shrink-0">
            <Sparkles size={14} className="text-indigo-600 shrink-0" />
            <span>{localModeNotice}</span>
          </div>
        )}

        {/* Agent Join Non-Fatal Notice */}
        {agentJoinError && !isLocalVoiceMode && (
          <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-600 dark:text-amber-400 shrink-0">
            <AlertTriangle size={14} />
            <span>
              Agora agent invite returned an error. Audio bridge connected; click SRE Debug to view logs.
            </span>
          </div>
        )}

        {/* Top Sub-Header */}
        <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-3 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md"
            >
              <ArrowLeft size={13} />
              <span>Dashboard Home</span>
            </Link>
            <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800" />
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white font-mono">
                WAR ROOM: {cleanChannel}
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900">
                {isLocalVoiceMode ? 'LOCAL AI' : 'AGORA SD-RTN'}
              </span>
            </div>
          </div>

          {warRoomHeaderControls}
        </header>

        {/* Main Content Body */}
        {isLoading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600">
              <Radio size={32} className="animate-pulse" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold tracking-tight">
                Connecting to War Room: {cleanChannel}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Initializing incident timeline & voice session...
              </p>
            </div>
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle size={28} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-destructive">Failed to Join Voice Room</h2>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">{error}</p>
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={connectRoom}>
                Retry Connection
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push('/')}
              >
                <ArrowLeft size={14} className="mr-1.5" /> Back to Home
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden relative">
            {/* VIEW 1: DASHBOARD */}
            {viewMode === 'dashboard' && (
              <div className="h-full overflow-y-auto">
                <IncidentDashboard />
                {/* Keep voice audio runner mounted in background */}
                {activeAgoraView && <div className="hidden">{activeAgoraView}</div>}
              </div>
            )}

            {/* VIEW 2: SRE CONSOLE (Full Screen Agora ActiveRoom or Local Voice Console) */}
            {viewMode === 'console' && (
              <div className="h-full w-full overflow-hidden">
                {activeAgoraView ? (
                  activeAgoraView
                ) : (
                  <div className="h-full overflow-y-auto p-6">
                    <IncidentDashboard />
                  </div>
                )}
              </div>
            )}

            {/* VIEW 3: SPLIT VIEW */}
            {viewMode === 'split' && (
              <div className="h-full w-full grid grid-cols-1 lg:grid-cols-2 divide-x divide-slate-200 dark:divide-slate-800 overflow-hidden">
                <div className="h-full overflow-y-auto">
                  <IncidentDashboard />
                </div>
                <div className="h-full overflow-hidden bg-slate-900">
                  {activeAgoraView ? (
                    activeAgoraView
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-400 text-sm p-6 text-center">
                      <div>
                        <Activity className="mx-auto mb-2 text-indigo-400 animate-pulse" size={28} />
                        <p className="font-semibold text-slate-200">Local Voice AI Bridge Active</p>
                        <p className="text-xs text-slate-400 mt-1 max-w-xs">
                          Use the microphone and command input on the dashboard to speak with the AI Incident Commander.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </IncidentProvider>
  );
}

export default RoomClient;
