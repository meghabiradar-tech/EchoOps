'use client';

import { useState, useRef, Suspense, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { RTMClient } from 'agora-rtm';
import { Radio, AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import type {
  AgoraTokenData,
  ClientStartRequest,
  AgentResponse,
  AgoraRenewalTokens,
} from '@/types/conversation';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { Button } from '@/components/ui/button';

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

interface RoomClientProps {
  channelName: string;
}

export function RoomClient({ channelName }: RoomClientProps) {
  const router = useRouter();
  const cleanChannel = decodeURIComponent(channelName).trim() || 'echoops-war-room-042';

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [micWarning, setMicWarning] = useState<string | null>(null);
  const [agoraData, setAgoraData] = useState<AgoraTokenData | null>(null);
  const [rtmClient, setRtmClient] = useState<RTMClient | null>(null);
  const [agentJoinError, setAgentJoinError] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // 1. Check Agora credentials & Request Microphone Permissions
  const checkMicPermission = useCallback(async () => {
    if (!process.env.NEXT_PUBLIC_AGORA_APP_ID) {
      console.warn(
        '[EchoOps] NEXT_PUBLIC_AGORA_APP_ID is undefined. Please set it in .env.local to enable voice features.',
      );
    }

    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop test probe stream so Agora RTC track has sole ownership
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
        console.warn('[EchoOps] Audio initialization note:', error);
      }
    }
  }, []);

  // 2. Connect Agora Voice AI Room
  const connectRoom = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAgentJoinError(false);

    try {
      // Probe mic permission
      await checkMicPermission();

      const channelQuery = `?channel=${encodeURIComponent(cleanChannel)}`;
      const agoraResponse = await fetch(
        `/api/generate-agora-token${channelQuery}`,
      );
      const responseData = await agoraResponse.json();

      if (!agoraResponse.ok) {
        throw new Error(
          responseData.error || `Failed to generate Agora token (HTTP ${agoraResponse.status})`,
        );
      }

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
          const { default: AgoraRTM } = await import('agora-rtm');
          const rtm: RTMClient = new AgoraRTM.RTM(
            process.env.NEXT_PUBLIC_AGORA_APP_ID!,
            responseData.uid,
          );
          await rtm.login({ token: responseData.token });
          await rtm.subscribe(responseData.channel);
          return rtm;
        })(),
      ]);

      setRtmClient(rtm);
      setAgoraData({ ...responseData, agentId: agentData?.agent_id });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to connect to Agora voice room.';
      setError(message);
      console.error('[EchoOps] Room connection error:', err);
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

  // End / Leave Conversation
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

    // If opened in a separate tab, attempt to close or navigate back
    if (window.opener) {
      window.close();
    } else {
      router.push('/');
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Top Banner Warning for Mic Issues */}
      {micWarning && (
        <div className="flex items-center justify-between border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive">
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

      {/* Non-fatal AI invite warning */}
      {agentJoinError && (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle size={14} />
          <span>
            AI Voice Agent invite returned an error. Audio bridge is connected; click SRE Debug to view logs.
          </span>
        </div>
      )}

      {/* Main View Area */}
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
              Negotiating Agora RTC tokens & initializing Deepgram + GPT-4o-mini voice session...
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
              onClick={() => {
                if (window.opener) window.close();
                else router.push('/');
              }}
            >
              <ArrowLeft size={14} className="mr-1.5" /> Back to Dashboard
            </Button>
          </div>
        </div>
      ) : agoraData && rtmClient ? (
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
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Missing connection data.
        </div>
      )}
    </div>
  );
}
