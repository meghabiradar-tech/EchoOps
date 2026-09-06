'use client';

import { useState, useRef, Suspense, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { RTMClient } from 'agora-rtm';
import {
  Radio,
  LayoutDashboard,
  Terminal,
  Columns2,
  PhoneOff,
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

type ViewMode = 'dashboard' | 'cockpit' | 'console' | 'timeline' | 'split';

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
      setViewMode('split');
    } catch (err) {
      console.warn('Fallback to demo voice room:', err);
      setAgoraData({
        token: '',
        uid: String(Math.floor(Math.random() * 90000) + 10000),
        channel: channelName.trim() || 'echoops-war-room-042',
      });
      setShowConversation(true);
      setViewMode('split');
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

  // Sleek top header navigation & action controls (used in Console and Split toolbars)
  const renderHeaderControls = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      {/* Secondary Action: Rooms & History */}
      <Link
        href="/rooms"
        id="top-nav-rooms"
        title="Browse all incident rooms and conversation histories"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '6px 12px',
          background: '#151d30',
          color: '#cbd5e1',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          fontSize: '0.75rem',
          fontWeight: 600,
          textDecoration: 'none',
          transition: 'all 0.15s ease',
        }}
      >
        <Radio size={13} className="text-indigo-400" />
        <span>Rooms & History</span>
      </Link>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#0d1322',
          padding: '3px',
          borderRadius: '9px',
          border: '1px solid #1e293b',
          gap: '2px',
        }}
      >
        <button
          onClick={() => setViewMode('dashboard')}
          title="Incident Cockpit Overview"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 11px',
            fontSize: '0.75rem',
            fontWeight: 600,
            borderRadius: '7px',
            border: 'none',
            cursor: 'pointer',
            background: (viewMode === 'dashboard' || viewMode === 'cockpit') ? '#1e293b' : 'transparent',
            color: (viewMode === 'dashboard' || viewMode === 'cockpit') ? '#f8fafc' : '#94a3b8',
            boxShadow: (viewMode === 'dashboard' || viewMode === 'cockpit') ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <LayoutDashboard size={13} />
          <span>Cockpit</span>
        </button>

        <button
          onClick={() => setViewMode('console')}
          title="SRE Voice Console & Runbooks"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 11px',
            fontSize: '0.75rem',
            fontWeight: 600,
            borderRadius: '7px',
            border: 'none',
            cursor: 'pointer',
            background: viewMode === 'console' ? '#1e293b' : 'transparent',
            color: viewMode === 'console' ? '#f8fafc' : '#94a3b8',
            boxShadow: viewMode === 'console' ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Terminal size={13} />
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
          onClick={() => setViewMode('timeline')}
          title="Incident Timeline & Events"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 11px',
            fontSize: '0.75rem',
            fontWeight: 600,
            borderRadius: '7px',
            border: 'none',
            cursor: 'pointer',
            background: viewMode === 'timeline' ? '#1e293b' : 'transparent',
            color: viewMode === 'timeline' ? '#f8fafc' : '#94a3b8',
            boxShadow: viewMode === 'timeline' ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Columns2 size={13} />
          <span>Timeline</span>
        </button>
      </div>

      {/* The Single Primary War Room Action Button */}
      {!showConversation ? (
        <button
          onClick={handleOpenDedicatedRoom}
          id="top-primary-join-war-room"
          title="Open Dedicated Voice War Room in a New Tab"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
            color: '#ffffff',
            borderRadius: '9999px',
            fontSize: '0.775rem',
            fontWeight: 700,
            border: '1px solid rgba(255,255,255,0.15)',
            cursor: 'pointer',
            boxShadow: '0 0 16px rgba(79, 70, 229, 0.4)',
            transition: 'all 0.15s ease',
          }}
        >
          <Radio size={14} className="animate-pulse" />
          <span>Open War Room</span>
          <ExternalLink size={13} className="opacity-80" />
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#10b981',
              }}
            />
            Voice Live
          </span>
          <button
            onClick={handleEndConversation}
            disabled={isStopping}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: isStopping ? 'wait' : 'pointer',
              transition: 'all 0.15s ease',
            }}
            id="top-leave-voice"
            title="Leave Voice Room"
          >
            <PhoneOff size={13} />
            <span>{isStopping ? 'Leaving...' : 'Leave'}</span>
          </button>
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
    <div style={{ minHeight: '100vh', background: '#090d16', color: '#f8fafc' }}>
      {/* 1. DASHBOARD / COCKPIT / TIMELINE VIEW */}
      {(viewMode === 'dashboard' || viewMode === 'cockpit' || viewMode === 'timeline') && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <IncidentDashboard
            viewMode={viewMode}
            onSelectViewMode={setViewMode}
            showConversation={showConversation}
            onEndConversation={handleEndConversation}
            isStopping={isStopping}
            channelName={channelName}
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
              background: '#0d1322',
              borderBottom: '1px solid #1e293b',
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
                  background: '#151d30',
                  border: '1px solid #1e293b',
                  borderRadius: '7px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#cbd5e1',
                  cursor: 'pointer',
                }}
              >
                ← Back to Cockpit
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Terminal size={16} className="text-indigo-400" />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
                  EchoOps SRE War Room Console
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: '#a5b4fc',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontWeight: 600,
                  }}
                >
                  RUNBOOKS & LATENCY
                </span>
              </div>
            </div>

            {renderHeaderControls()}
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

                    {error && (
                      <div
                        style={{
                          padding: '6px 10px',
                          background: '#fee2e2',
                          color: '#b91c1c',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          marginTop: '0.5rem',
                        }}
                      >
                        {error}
                      </div>
                    )}

                    {agentJoinError && (
                      <div
                        style={{
                          padding: '6px 10px',
                          background: '#fef3c7',
                          color: '#92400e',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          marginTop: '0.5rem',
                        }}
                      >
                        ⚠️ AI Agent invite returned an error. Audio bridge is connected.
                      </div>
                    )}
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

            {renderHeaderControls()}
          </div>

          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* Left: Dashboard */}
            <div style={{ flex: 1, overflowY: 'auto', borderRight: '1px solid #e2e8f0' }}>
              <IncidentDashboard
                viewMode={viewMode}
                onSelectViewMode={setViewMode}
                showConversation={showConversation}
                onEndConversation={handleEndConversation}
                isStopping={isStopping}
                channelName={channelName}
              />
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
