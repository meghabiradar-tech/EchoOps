'use client';

import { useState, useRef, Suspense, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { RTMClient } from 'agora-rtm';
import {
  Radio,
  Mic,
  LayoutDashboard,
  Terminal,
  Columns2,
  PhoneCall,
  PhoneOff,
  Volume2,
  ExternalLink,
} from 'lucide-react';
import type {
  AgoraTokenData,
  ClientStartRequest,
  AgentResponse,
  AgoraRenewalTokens,
} from '../types/conversation';
import { ErrorBoundary } from './ErrorBoundary';
import { LoadingSkeleton } from './LoadingSkeleton';
import IncidentDashboard from '../src/App';

// Dynamically import the ConversationComponent with ssr disabled
const ConversationComponent = dynamic(() => import('./ConversationComponent'), {
  ssr: false,
});

// Dynamically import AgoraRTCProvider (browser-only).
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

export default function LandingPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [showConversation, setShowConversation] = useState(false);
  const [channelName, setChannelName] = useState('echoops-war-room-042');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agoraData, setAgoraData] = useState<AgoraTokenData | null>(null);
  const [rtmClient, setRtmClient] = useState<RTMClient | null>(null);
  const [agentJoinError, setAgentJoinError] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // Dedicated Room Tab Opener
  const handleOpenDedicatedRoom = useCallback(
    (e?: React.MouseEvent) => {
      e?.preventDefault();
      const clean = (channelName.trim() || 'echoops-war-room-042').trim();
      const targetUrl = `/room/${encodeURIComponent(clean)}`;

      try {
        const newTab = window.open(targetUrl, '_blank', 'noopener,noreferrer');
        if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
          router.push(targetUrl);
        }
      } catch {
        router.push(targetUrl);
      }
    },
    [channelName, router],
  );

  // Preload heavy modules on mount
  useEffect(() => {
    import('agora-rtc-react').catch(() => {});
    import('agora-rtm').catch(() => {});
  }, []);

  const handleStartConversation = async () => {
    setIsLoading(true);
    setError(null);
    setAgentJoinError(false);

    try {
      const channelQuery = channelName.trim()
        ? `?channel=${encodeURIComponent(channelName.trim())}`
        : '';
      let responseData: { token: string; uid: string; channel: string } | null = null;
      try {
        const agoraResponse = await fetch(
          `/api/generate-agora-token${channelQuery}`,
        );
        if (agoraResponse.ok) {
          responseData = await agoraResponse.json();
        }
      } catch (err) {
        console.warn('Token endpoint fetch note:', err);
      }

      if (!responseData || !responseData.token) {
        // Fallback to demo/local voice mode so the user can interact immediately
        setAgoraData({
          token: '',
          uid: String(Math.floor(Math.random() * 90000) + 10000),
          channel: channelName.trim() || 'echoops-war-room-042',
        });
        setShowConversation(true);
        return;
      }

      // 2. Run agent invite and RTM setup in parallel
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
            console.error('Failed to start conversation with agent:', err);
            setAgentJoinError(true);
            return null;
          }),

        (async () => {
          try {
            const { default: AgoraRTM } = await import('agora-rtm');
            const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
            if (!appId) return null;
            const client: RTMClient = new AgoraRTM.RTM(
              appId,
              responseData.uid,
            );
            await client.login({ token: responseData.token });
            await client.subscribe(responseData.channel);
            return client;
          } catch (err) {
            console.warn('RTM login note:', err);
            return null;
          }
        })(),
      ]);

      setRtmClient(rtm);
      setAgoraData({ ...responseData, agentId: agentData?.agent_id });
      setShowConversation(true);
    } catch (err) {
      console.warn('Fallback to demo voice room:', err);
      setAgoraData({
        token: '',
        uid: String(Math.floor(Math.random() * 90000) + 10000),
        channel: channelName.trim() || 'echoops-war-room-042',
      });
      setShowConversation(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTokenWillExpire = useCallback(
    async (uid: string): Promise<AgoraRenewalTokens> => {
      try {
        const channel = agoraData?.channel;
        if (!channel) {
          throw new Error('Missing channel for token renewal');
        }

        const [rtcResponse, rtmResponse] = await Promise.all([
          fetch(`/api/generate-agora-token?channel=${channel}&uid=${uid}`),
          fetch(`/api/generate-agora-token?channel=${channel}&uid=${agoraData.uid}`),
        ]);
        const [rtcData, rtmData] = await Promise.all([
          rtcResponse.json(),
          rtmResponse.json(),
        ]);

        if (!rtcResponse.ok || !rtmResponse.ok) {
          throw new Error('Failed to refresh tokens');
        }

        return {
          rtcToken: rtcData.token,
          rtmToken: rtmData.token,
        };
      } catch (err) {
        console.error('Failed to refresh token:', err);
        throw err;
      }
    },
    [agoraData?.channel, agoraData?.uid],
  );

  const handleEndConversation = useCallback(async () => {
    setIsStopping(true);
    try {
      const channel = agoraData?.channel;
      const agentId = agoraData?.agentId;

      if (channel && agentId) {
        try {
          await fetch('/api/stop-conversation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channel_name: channel,
              agent_id: agentId,
            }),
          });
        } catch (stopErr) {
          console.warn('Failed to stop agent conversation cleanly:', stopErr);
        }
      }

      if (rtmClient) {
        try {
          await rtmClient.logout();
        } catch (rtmErr) {
          console.warn('RTM logout warning:', rtmErr);
        }
        setRtmClient(null);
      }

      setAgoraData(null);
      setShowConversation(false);
      setViewMode('dashboard');
    } catch (err) {
      console.error('Error leaving conversation:', err);
    } finally {
      setIsStopping(false);
    }
  }, [agoraData, rtmClient]);

  // Top header view toggle and voice buttons
  const headerRightControls = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
      {/* View Mode Switcher */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#f1f5f9',
          borderRadius: '8px',
          padding: '2px',
          border: '1px solid #e2e8f0',
        }}
      >
        <button
          onClick={() => setViewMode('dashboard')}
          title="Incident Overview Dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 10px',
            fontSize: '0.75rem',
            fontWeight: 600,
            borderRadius: '7px',
            border: 'none',
            cursor: 'pointer',
            background: viewMode === 'dashboard' ? '#ffffff' : 'transparent',
            color: viewMode === 'dashboard' ? '#4f46e5' : '#64748b',
            boxShadow: viewMode === 'dashboard' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <LayoutDashboard size={14} />
          <span>Dashboard</span>
        </button>

        <button
          onClick={() => setViewMode('console')}
          title="SRE Voice Console & Runbooks"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 10px',
            fontSize: '0.75rem',
            fontWeight: 600,
            borderRadius: '7px',
            border: 'none',
            cursor: 'pointer',
            background: viewMode === 'console' ? '#ffffff' : 'transparent',
            color: viewMode === 'console' ? '#4f46e5' : '#64748b',
            boxShadow: viewMode === 'console' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Terminal size={14} />
          <span>SRE Console</span>
          {showConversation && (
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#10b981',
                display: 'inline-block',
              }}
            />
          )}
        </button>

        <button
          onClick={() => setViewMode('split')}
          title="Side-by-side Split View"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 10px',
            fontSize: '0.75rem',
            fontWeight: 600,
            borderRadius: '7px',
            border: 'none',
            cursor: 'pointer',
            background: viewMode === 'split' ? '#ffffff' : 'transparent',
            color: viewMode === 'split' ? '#4f46e5' : '#64748b',
            boxShadow: viewMode === 'split' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Columns2 size={14} />
          <span>Split</span>
        </button>
      </div>

      {/* Voice Quick Action */}
      {!showConversation ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={handleStartConversation}
            disabled={isLoading}
            id="header-join-voice-bridge"
            title="Connect audio bridge directly on this page"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: '#ffffff',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 700,
              border: 'none',
              cursor: isLoading ? 'wait' : 'pointer',
              boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
              transition: 'all 0.2s ease',
            }}
          >
            <PhoneCall size={13} />
            <span>{isLoading ? 'Connecting...' : 'Join Voice Bridge'}</span>
          </button>
          <button
            onClick={handleOpenDedicatedRoom}
            id="header-open-room-tab"
            title="Open Dedicated Incident Room in New Tab"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 10px',
              background: '#f8fafc',
              color: '#475569',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              border: '1px solid #cbd5e1',
              cursor: 'pointer',
            }}
          >
            <ExternalLink size={12} />
            <span>Room Tab</span>
          </button>
        </div>
      ) : (
        <button
          onClick={handleEndConversation}
          disabled={isStopping}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            background: '#fee2e2',
            color: '#dc2626',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 700,
            border: '1px solid #fecaca',
            cursor: isStopping ? 'wait' : 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <PhoneOff size={13} />
          <span>{isStopping ? 'Leaving...' : 'Leave Voice'}</span>
        </button>
      )}
    </div>
  );

  // Top Voice Commander War Room Banner (Rendered inside Incident Dashboard)
  const voiceBanner = (
    <div
      style={{
        background: !showConversation
          ? 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
          : 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)',
        border: !showConversation ? '1px solid #e2e8f0' : '1px solid #bbf7d0',
        borderRadius: '14px',
        padding: '1rem 1.4rem',
        marginBottom: '1.25rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: !showConversation ? '#ede9fe' : '#dcfce7',
              color: !showConversation ? '#6d28d9' : '#15803d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {showConversation ? <Volume2 size={20} /> : <Radio size={20} />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                Voice AI Incident Commander Bridge
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  background: showConversation ? '#dcfce7' : '#ede9fe',
                  color: showConversation ? '#15803d' : '#6d28d9',
                  fontWeight: 600,
                }}
              >
                {showConversation ? 'AUDIO LIVE' : 'AGORA SD-RTN'}
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
              {showConversation
                ? `Connected as UID: ${agoraData?.uid} • Managed STT (Deepgram Nova-3), GPT-4o-mini Incident Commander, MiniMax TTS`
                : 'Join the voice bridge to speak directly with the AI Incident Commander and incident responders.'}
            </p>
          </div>
        </div>

        {/* Input and Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {!showConversation ? (
            <>
              <input
                type="text"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="Channel Name"
                style={{
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  background: '#ffffff',
                  outline: 'none',
                  minWidth: '200px',
                  color: '#0f172a',
                }}
              />
              <button
                onClick={handleStartConversation}
                disabled={isLoading}
                id="banner-connect-voice"
                title="Connect voice audio bridge directly on this dashboard"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 16px',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  color: '#ffffff',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: isLoading ? 'wait' : 'pointer',
                  boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)',
                }}
              >
                <Radio size={14} className={isLoading ? 'animate-spin' : ''} />
                <span>{isLoading ? 'Connecting...' : 'Connect Voice (This Tab)'}</span>
              </button>

              <button
                onClick={handleOpenDedicatedRoom}
                id="banner-open-room-tab"
                title="Open Dedicated Voice Incident Room in New Tab"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  background: '#ffffff',
                  color: '#4f46e5',
                  border: '1px solid #c7d2fe',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Mic size={14} />
                <span>Room Tab</span>
                <ExternalLink size={13} className="opacity-80" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setViewMode('console')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  background: '#ffffff',
                  color: '#4f46e5',
                  border: '1px solid #c7d2fe',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Terminal size={14} />
                <span>Open SRE Console & Runbooks →</span>
              </button>
              <button
                onClick={handleEndConversation}
                disabled={isStopping}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  background: '#ef4444',
                  color: '#ffffff',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: isStopping ? 'wait' : 'pointer',
                }}
              >
                <PhoneOff size={14} />
                <span>{isStopping ? 'Leaving...' : 'Disconnect Voice'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '8px 12px',
            background: '#fee2e2',
            color: '#b91c1c',
            borderRadius: '6px',
            fontSize: '0.75rem',
          }}
        >
          {error}
        </div>
      )}

      {agentJoinError && (
        <div
          style={{
            padding: '8px 12px',
            background: '#fef3c7',
            color: '#92400e',
            borderRadius: '6px',
            fontSize: '0.75rem',
          }}
        >
          ⚠️ AI Agent invite returned an error. Voice room audio is still connected.
        </div>
      )}
    </div>
  );

  // Active Agora Conversation Component (memoized / mounted browser-only)
  const activeConversationView = agoraData && (
    <Suspense fallback={<LoadingSkeleton />}>
      <ErrorBoundary>
        <AgoraProvider>
          <ConversationComponent
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
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* 1. DASHBOARD VIEW (Default: Megha's Incident Dashboard with integrated Voice Bridge) */}
      {viewMode === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <IncidentDashboard
            voiceSlot={voiceBanner}
            headerRightSlot={headerRightControls}
          />

          {/* Background audio runner when voice is active on dashboard */}
          {showConversation && (
            <div style={{ display: 'none' }}>
              {activeConversationView}
            </div>
          )}
        </div>
      )}

      {/* 2. SRE CONSOLE VIEW (Full-Screen Agora ActiveRoom + Runbooks + Latency Metrics) */}
      {viewMode === 'console' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          {/* Top navigation toolbar */}
          <div
            style={{
              padding: '0.75rem 1.5rem',
              background: '#ffffff',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                onClick={() => setViewMode('dashboard')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '7px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                ← Back to Incident Dashboard
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Terminal size={16} className="text-indigo-600" />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                  EchoOps SRE War Room Console
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    background: '#e0e7ff',
                    color: '#4338ca',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontWeight: 600,
                  }}
                >
                  RUNBOOKS & LATENCY
                </span>
              </div>
            </div>

            {headerRightControls}
          </div>

          {/* ActiveRoom or Pre-call card */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {showConversation && agoraData ? (
              activeConversationView
            ) : (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2rem',
                }}
              >
                <div
                  style={{
                    maxWidth: '480px',
                    width: '100%',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '2rem',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      background: '#ede9fe',
                      color: '#6d28d9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 1rem auto',
                    }}
                  >
                    <Terminal size={24} />
                  </div>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
                    SRE Voice War Room Console
                  </h2>
                  <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem' }}>
                    Connect to the Agora audio bridge to activate automated SRE runbook quick-actions, Deepgram transcript stream, and pipeline latency metrics.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <input
                      type="text"
                      value={channelName}
                      onChange={(e) => setChannelName(e.target.value)}
                      placeholder="Channel name"
                      style={{
                        padding: '10px 14px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                        textAlign: 'center',
                        color: '#0f172a',
                      }}
                    />
                    <button
                      onClick={handleStartConversation}
                      disabled={isLoading}
                      style={{
                        padding: '10px 16px',
                        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                        color: '#ffffff',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        border: 'none',
                        cursor: isLoading ? 'wait' : 'pointer',
                      }}
                    >
                      {isLoading ? 'Connecting to Agora...' : 'Launch SRE Voice Console'}
                    </button>
                  </div>

                  <button
                    onClick={() => setViewMode('dashboard')}
                    style={{
                      fontSize: '0.8rem',
                      color: '#4f46e5',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    ← Return to Incident Dashboard
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. SPLIT VIEW (Side-by-Side: Incident Dashboard + SRE Console) */}
      {viewMode === 'split' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
          {/* Top toolbar */}
          <div
            style={{
              padding: '0.65rem 1.5rem',
              background: '#ffffff',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>
                EchoOps Dual War Room
              </span>
              <span
                style={{
                  fontSize: '0.7rem',
                  background: '#ede9fe',
                  color: '#6d28d9',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontWeight: 600,
                }}
              >
                INCIDENT DASHBOARD + SRE CONSOLE
              </span>
            </div>

            {headerRightControls}
          </div>

          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* Left: Dashboard */}
            <div style={{ flex: 1, overflowY: 'auto', borderRight: '1px solid #e2e8f0' }}>
              <IncidentDashboard voiceSlot={voiceBanner} />
            </div>

            {/* Right: SRE Console */}
            <div style={{ flex: 1, overflowY: 'auto', background: '#ffffff' }}>
              {showConversation && agoraData ? (
                activeConversationView
              ) : (
                <div
                  style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem',
                    textAlign: 'center',
                  }}
                >
                  <div>
                    <Radio size={36} className="text-indigo-500 mx-auto mb-3 animate-pulse" />
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
                      Voice Console Standby
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', maxWidth: '320px', marginBottom: '1rem' }}>
                      Click &ldquo;Join Voice Bridge&rdquo; in the header to activate the live SRE audio console.
                    </p>
                    <button
                      onClick={handleStartConversation}
                      disabled={isLoading}
                      style={{
                        padding: '8px 18px',
                        background: '#4f46e5',
                        color: '#ffffff',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        border: 'none',
                        cursor: isLoading ? 'wait' : 'pointer',
                      }}
                    >
                      {isLoading ? 'Connecting...' : 'Join Voice Bridge'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
