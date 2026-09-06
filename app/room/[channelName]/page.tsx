'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { IAgoraRTCClient, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import {
  Radio,
  Volume2,
  VolumeX,
  ChevronLeft,
  Flame,
  Activity,
  ShieldAlert,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { IncidentProvider } from '@/src/context/IncidentContext';
import IncidentDashboard from '@/src/App';
import { BotAudioVisualizer } from '@/components/BotAudioVisualizer';

export default function DedicatedRoomPage() {
  const router = useRouter();
  const params = useParams();
  const rawChannel = (params?.channelName as string) || 'echoops-war-room-042';
  const channelName = decodeURIComponent(rawChannel);

  // Audio Bridge States
  const [isAudioJoined, setIsAudioJoined] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const [remoteUserAudioActive, setRemoteUserAudioActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [botSpeechText, setBotSpeechText] = useState<string>('EchoOps AI Incident Commander initialized. Ready to receive voice commands.');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // References to Agora RTC Client & Tracks
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localMicTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const isDeafenedRef = useRef(false);
  useEffect(() => {
    isDeafenedRef.current = isDeafened;
  }, [isDeafened]);

  // Track session timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 1. Explicit "Join Audio" Trigger via User Gesture
  const handleJoinAudio = async () => {
    if (isConnecting || isAudioJoined) return;
    setIsConnecting(true);
    setErrorMsg(null);

    try {
      // Step A: Explicit mic permission trigger via user gesture
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setMicPermissionGranted(true);
      } catch (micErr) {
        console.warn('[EchoOps] Microphone access prompt rejected:', micErr);
        throw new Error(
          'Microphone permission was denied. Please allow microphone access in your browser settings to join the voice bridge.',
        );
      } finally {
        // Stop probe stream so Agora RTC has exclusive access to the hardware audio track
        stream?.getTracks().forEach((track) => track.stop());
      }

      // Step B: Acquire Agora RTC Token
      const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
      let token = '';
      let uid = String(Math.floor(Math.random() * 899999) + 100000);

      try {
        const tokenRes = await fetch(
          `/api/agora/token?channel=${encodeURIComponent(channelName)}&uid=${uid}`,
        );
        if (tokenRes.ok) {
          const data = await tokenRes.json();
          token = data.token || data.rtcToken || '';
          if (data.uid) uid = String(data.uid);
        }
      } catch (tokenErr) {
        console.warn('[EchoOps] Failed to fetch token from /api/agora/token:', tokenErr);
      }

      // Step C: Initialize Agora RTC SDK dynamically on client side
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      clientRef.current = client;

      // Step D: Create Local Microphone Audio Track
      const localTrack = await AgoraRTC.createMicrophoneAudioTrack();
      localMicTrackRef.current = localTrack;

      // Step E: Join Agora Channel
      if (appId && token) {
        await client.join(appId, channelName, token, parseInt(uid, 10));
        await client.publish([localTrack]);
        console.info(`[EchoOps] Joined Agora RTC channel: ${channelName} as UID: ${uid}`);
      } else {
        console.info('[EchoOps] Audio bridge running in local audio capture mode.');
      }

      // Step F: Subscribe to incoming remote bot speech audio
      client.on('user-published', async (user, mediaType) => {
        try {
          await client.subscribe(user, mediaType);
          if (mediaType === 'audio') {
            if (!isDeafenedRef.current) {
              user.audioTrack?.play();
            }
            setRemoteUserAudioActive(true);
          }
        } catch (subErr) {
          console.warn('[EchoOps] Remote track subscribe error:', subErr);
        }
      });

      client.on('user-unpublished', (user, mediaType) => {
        if (mediaType === 'audio') {
          user.audioTrack?.stop();
          setRemoteUserAudioActive(false);
        }
      });

      // Step G: Enable Volume Indicator for animated waveform
      try {
        client.enableAudioVolumeIndicator();
        client.on('volume-indicator', (volumes) => {
          const local = volumes.find(
            (v) => v.uid === 0 || String(v.uid) === String(client.uid),
          );
          const level = local?.level ?? 0;
          setVolumeLevel(level);
          setIsTransmitting(level > 15 && !isMuted);
        });
      } catch {}

      // Polling fallback to ensure local track volume updates smoothly
      const volInterval = setInterval(() => {
        if (localMicTrackRef.current && !isMuted) {
          const level = Math.round((localMicTrackRef.current.getVolumeLevel() || 0) * 100);
          setVolumeLevel(level);
          setIsTransmitting(level > 12);
        }
      }, 80);

      // Step H: Invite AI SRE Agent Session
      void fetch('/api/invite-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelName }),
      }).catch((e) => console.warn('[EchoOps] Agent invite notice:', e));

      setIsAudioJoined(true);
      setBotSpeechText('Voice bridge established. AI Incident Commander actively monitoring telemetry.');

      // Return cleanup handler if unmounted
      return () => {
        clearInterval(volInterval);
      };
    } catch (err: unknown) {
      const error = err as Error;
      console.error('[EchoOps] Error joining voice bridge:', error);
      setErrorMsg(error.message || 'Failed to initialize microphone audio bridge.');
    } finally {
      setIsConnecting(false);
    }
  };

  // 2. Microphone Mute / Unmute Toggle
  const handleToggleMute = async () => {
    if (!localMicTrackRef.current) return;
    const nextMuted = !isMuted;
    try {
      await localMicTrackRef.current.setEnabled(!nextMuted);
      setIsMuted(nextMuted);
      if (nextMuted) {
        setIsTransmitting(false);
      }
    } catch (err) {
      console.error('[EchoOps] Error toggling mic:', err);
    }
  };

  // 3. Speaker Deafen Toggle
  const handleToggleDeafen = () => {
    const nextDeafened = !isDeafened;
    setIsDeafened(nextDeafened);
    if (clientRef.current) {
      clientRef.current.remoteUsers.forEach((user) => {
        if (nextDeafened) {
          user.audioTrack?.stop();
        } else {
          user.audioTrack?.play();
        }
      });
    }
  };

  // 4. Leave Bridge & Close Tab / Redirect
  const handleLeaveBridge = async () => {
    try {
      if (localMicTrackRef.current) {
        localMicTrackRef.current.stop();
        localMicTrackRef.current.close();
        localMicTrackRef.current = null;
      }
      if (clientRef.current) {
        await clientRef.current.leave();
        clientRef.current = null;
      }
    } catch (e) {
      console.warn('[EchoOps] Error during audio cleanup:', e);
    }

    setIsAudioJoined(false);
    setIsTransmitting(false);

    // Close window if opened in new tab, or redirect back to root dashboard
    if (typeof window !== 'undefined') {
      try {
        window.close();
      } catch {}
      // Fallback redirect if browser blocked window.close()
      setTimeout(() => {
        router.push('/');
      }, 150);
    }
  };

  return (
    <IncidentProvider initialChannel={channelName}>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
        {/* Top War Room Navigation Bar */}
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
              title="Return to Main Overview"
            >
              <ChevronLeft size={16} />
              <span className="hidden sm:inline">Overview</span>
            </button>

            <div className="h-4 w-px bg-slate-800" />

            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
              <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                <span>WAR ROOM:</span>
                <span className="font-mono text-indigo-400 bg-indigo-950/60 border border-indigo-800/80 px-2 py-0.5 rounded text-xs">
                  {channelName}
                </span>
              </h1>
            </div>

            <span className="hidden md:inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
              <Flame size={12} /> SEV-1 CRITICAL
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Multi-page Routing Navigation Links */}
            <Link
              href={`/room/${encodeURIComponent(channelName)}/timeline`}
              className="hidden md:flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-indigo-400 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 transition-colors"
            >
              <Activity size={13} />
              <span>Timeline Drilldown</span>
            </Link>

            <Link
              href={`/room/${encodeURIComponent(channelName)}/actions/act-drain-pool`}
              className="hidden md:flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-emerald-400 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 transition-colors"
            >
              <CheckCircle2 size={13} />
              <span>Mitigation Review</span>
            </Link>

            <div className="flex items-center gap-1.5 font-mono text-xs text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-800">
              <Clock size={12} className="text-amber-400" />
              <span>{formatTimer(elapsedSeconds)}</span>
            </div>

            {/* Top Join Audio CTA (If not joined yet) */}
            {!isAudioJoined && (
              <button
                onClick={handleJoinAudio}
                disabled={isConnecting}
                id="header-join-audio-cta"
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
              >
                <Radio size={13} className={isConnecting ? 'animate-spin' : ''} />
                <span>{isConnecting ? 'Authorizing Mic...' : 'Join Audio'}</span>
              </button>
            )}
          </div>
        </header>

        {/* Error Notification Banner */}
        {errorMsg && (
          <div className="bg-rose-500/15 border-b border-rose-500/40 px-4 py-2.5 text-xs text-rose-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert size={14} className="text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={handleJoinAudio}
              className="text-xs font-semibold text-rose-200 underline hover:text-white"
            >
              Retry
            </button>
          </div>
        )}

        {/* Hero Voice Bridge Welcome Callout (when audio not connected) */}
        {!isAudioJoined && (
          <div className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-purple-950/80 border-b border-indigo-900/50 p-6">
            <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-center md:text-left">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  <Radio size={12} /> Real-Time Voice Incident Bridge
                </div>
                <h2 className="text-xl font-bold text-white">
                  Autonomous SRE AI Incident Commander Bridge
                </h2>
                <p className="text-xs text-slate-300 max-w-xl">
                  Connect your microphone to speak with the autonomous incident commander, review live diagnostic telemetry, and execute cluster mitigations in real time.
                </p>
              </div>

              <button
                onClick={handleJoinAudio}
                disabled={isConnecting}
                id="hero-join-audio-btn"
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 px-6 py-3 text-sm font-bold text-white shadow-xl shadow-indigo-500/25 transition-all hover:scale-105 active:scale-95 shrink-0"
              >
                <Radio size={16} className={isConnecting ? 'animate-spin' : ''} />
                <span>{isConnecting ? 'Connecting Audio Bridge...' : 'Join Audio Bridge'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Main Dashboard Layout Container */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 pb-28">
          {/* Visualizer & SRE AI Avatar Status Bar */}
          <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl backdrop-blur">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <BotAudioVisualizer
                  isSpeaking={remoteUserAudioActive || isTransmitting}
                  isProcessing={isConnecting}
                  botName="EchoOps AI Commander"
                  className="p-0"
                />
                <div className="hidden lg:block space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Live Telemetry Synthesis
                  </div>
                  <div className="text-xs text-slate-300 max-w-md italic">
                    &ldquo;{botSpeechText}&rdquo;
                  </div>
                </div>
              </div>

              {/* Status Chips */}
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-medium border ${
                    isAudioJoined
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${isAudioJoined ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}
                  />
                  {isAudioJoined ? 'Audio Bridge Connected' : 'Audio Standby'}
                </span>

                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full font-mono bg-slate-800 text-slate-300 border border-slate-700">
                  Channel: {channelName}
                </span>
              </div>
            </div>
          </div>

          {/* Integrated SRE Cards */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-2">
            <IncidentDashboard />
          </div>
        </main>

        {/* ========================================================================= */}
        {/* 3. VISIBLE UI UPDATES: FIXED BOTTOM CONTROL BAR                           */}
        {/* ========================================================================= */}
        <footer
          role="region"
          aria-label="War Room Audio Controls"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl border border-slate-700/80 bg-slate-900/90 px-5 py-3 shadow-2xl backdrop-blur-xl transition-all duration-300"
        >
          {/* A. Pure CSS Animated Waveform Indicator (3-4 vertical bars pulsing with @keyframes) */}
          <div
            className="flex items-center gap-2 pr-3 border-r border-slate-700/80"
            title={
              isTransmitting
                ? `Voice audio actively transmitting (${volumeLevel}%)`
                : isAudioJoined
                ? `Audio connected (Silence, ${volumeLevel}%)`
                : micPermissionGranted
                ? 'Mic authorized • Click to connect audio'
                : 'Audio inactive'
            }
          >
            <div className="flex h-6 items-end gap-1" aria-hidden="true">
              <span
                className={`w-1 rounded-full transition-all duration-200 ${
                  isTransmitting
                    ? 'h-6 bg-emerald-400 animate-[pulseWave_0.6s_ease-in-out_infinite_alternate]'
                    : isAudioJoined
                    ? 'h-2 bg-emerald-600/50'
                    : 'h-1.5 bg-slate-700'
                }`}
                style={{ animationDelay: '0ms' }}
              />
              <span
                className={`w-1 rounded-full transition-all duration-200 ${
                  isTransmitting
                    ? 'h-5 bg-emerald-400 animate-[pulseWave_0.75s_ease-in-out_infinite_alternate]'
                    : isAudioJoined
                    ? 'h-3 bg-emerald-600/50'
                    : 'h-1.5 bg-slate-700'
                }`}
                style={{ animationDelay: '150ms' }}
              />
              <span
                className={`w-1 rounded-full transition-all duration-200 ${
                  isTransmitting
                    ? 'h-6 bg-emerald-400 animate-[pulseWave_0.5s_ease-in-out_infinite_alternate]'
                    : isAudioJoined
                    ? 'h-2 bg-emerald-600/50'
                    : 'h-1.5 bg-slate-700'
                }`}
                style={{ animationDelay: '300ms' }}
              />
              <span
                className={`w-1 rounded-full transition-all duration-200 ${
                  isTransmitting
                    ? 'h-4 bg-emerald-400 animate-[pulseWave_0.7s_ease-in-out_infinite_alternate]'
                    : isAudioJoined
                    ? 'h-2.5 bg-emerald-600/50'
                    : 'h-1.5 bg-slate-700'
                }`}
                style={{ animationDelay: '450ms' }}
              />
            </div>

            <div className="hidden sm:flex flex-col text-[10px] leading-tight">
              <span className="font-semibold uppercase tracking-wider text-slate-400">
                Transmitting
              </span>
              <span
                className={`font-mono font-medium ${
                  isTransmitting
                    ? 'text-emerald-400'
                    : isAudioJoined
                    ? 'text-slate-400'
                    : 'text-slate-600'
                }`}
              >
                {isTransmitting ? 'LIVE AUDIO' : isAudioJoined ? 'IDLE / VAD' : 'OFFLINE'}
              </span>
            </div>
          </div>

          {/* B. Mute/Unmute Microphone Toggle Button (Visual mic-on / mic-off icons) */}
          <button
            type="button"
            onClick={isAudioJoined ? handleToggleMute : handleJoinAudio}
            disabled={isConnecting}
            aria-label={!isAudioJoined ? 'Join Audio Bridge' : isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            title={!isAudioJoined ? 'Click to Join Audio' : isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            id="room-mic-toggle-btn"
            className={`group relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
              !isAudioJoined
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                : isMuted
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30'
                : isTransmitting
                ? 'bg-emerald-500 text-white shadow-[0_0_16px_rgba(16,185,129,0.6)] scale-105'
                : 'bg-slate-800 hover:bg-slate-700 text-white'
            }`}
          >
            {!isAudioJoined ? (
              <Radio size={18} className={isConnecting ? 'animate-spin' : ''} />
            ) : isMuted ? (
              // Visual Mic-Off Icon
              <svg
                className="h-5 w-5 text-rose-400"
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
            ) : (
              // Visual Mic-On Icon
              <svg
                className="h-5 w-5 text-current"
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
            )}
          </button>

          {/* C. Speaker Deafen Toggle Button */}
          {isAudioJoined && (
            <button
              type="button"
              onClick={handleToggleDeafen}
              aria-label={isDeafened ? 'Undeafen speakers' : 'Deafen speakers'}
              title={isDeafened ? 'Undeafen speakers' : 'Deafen incoming audio'}
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                isDeafened
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              {isDeafened ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          )}

          {/* D. Leave Bridge Button (window.close() or redirect to /) */}
          <button
            type="button"
            onClick={handleLeaveBridge}
            id="room-leave-bridge-btn"
            aria-label="Leave Voice Bridge"
            title="Leave Bridge and Close Tab"
            className="flex h-11 items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-4 text-xs font-bold text-white shadow-lg shadow-rose-600/30 transition-all duration-200 active:scale-95"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
              <line x1="23" x2="1" y1="1" y2="23" />
            </svg>
            <span>Leave Bridge</span>
          </button>
        </footer>

        {/* CSS Keyframes for the Animated Waveform Indicator */}
        <style jsx>{`
          @keyframes pulseWave {
            0% {
              transform: scaleY(0.25);
            }
            100% {
              transform: scaleY(1);
            }
          }
        `}</style>
      </div>
    </IncidentProvider>
  );
}
