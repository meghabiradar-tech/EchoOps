'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AgoraRTC, {
  useRTCClient,
  useLocalMicrophoneTrack,
  useRemoteUsers,
  useClientEvent,
  useJoin,
  usePublish,
  UID,
} from 'agora-rtc-react';
import {
  AgoraVoiceAI,
  AgoraVoiceAIEvents,
  AgentState,
  MessageSalStatus,
  TranscriptHelperMode,
  type TranscriptHelperItem,
  type UserTranscription,
  type AgentTranscription,
  TurnStatus,
} from 'agora-agent-client-toolkit';
import { AgentVisualizer } from 'agora-agent-uikit';
import { Button } from '@/components/ui/button';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import {
  getCurrentInProgressMessage,
  getMessageList,
  mapAgentVisualizerState,
  normalizeTimestampMs,
  normalizeTranscript,
} from '@/lib/conversation';
import {
  getConversationIssueSeverity,
  type ConnectionIssue,
} from './ConversationErrorCard';
import { ConnectionStatusPanel } from './ConnectionStatusPanel';
import { BotAudioVisualizer } from './BotAudioVisualizer';
import { IncidentHistoryDrawer, saveCurrentIncident, type ArchivedIncident } from './IncidentHistoryDrawer';
import { QuickstartConversationLayout } from './QuickstartConversationLayout';
import { QuickstartPipelineMetrics, type QuickstartAgentMetric } from './QuickstartPipelineMetrics';
import { QuickstartTranscriptPanel } from './QuickstartTranscriptPanel';
import { RunbookQuickActions } from './RunbookQuickActions';
import { FloatingAudioDock } from './FloatingAudioDock';
import type { ActiveRoomProps, ConversationComponentProps } from '@/types/conversation';
import { useAiSpeechHandler, stopAudibleSpeech } from '@/hooks/useAiSpeechHandler';
import { useIncidentContext } from '@/src/context/IncidentContext';
import {
  useSpeechCapture,
  type AgoraSpeechUpdate,
} from '@/hooks/useSpeechCapture';

// Cap the displayed issues list to avoid overwhelming the UI during a cascade of errors.
const MAX_CONNECTION_ISSUES = 6;
const VAD_THRESHOLD = 25;
const VAD_START_MS = 200;
const VAD_SILENCE_MS = 1200;

type AgoraRtcWithParameters = typeof AgoraRTC & {
  setParameter?: (key: string, value: unknown) => void;
};

// Payload shape for signaling-level errors forwarded by the agent over RTM.
type RtmMessageErrorPayload = {
  object: 'message.error';
  module?: string;
  code?: number;
  message?: string;
  send_ts?: number;
};

// Payload shape for SAL (Session Abstraction Layer) registration status messages.
type RtmSalStatusPayload = {
  object: 'message.sal_status';
  status?: string;
  timestamp?: number;
};

// Small presentational chip for participants showing active-speaker animation.
function ParticipantChip({
  label,
  isActive,
}: {
  label: string;
  isActive?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/80 px-3 py-1 text-sm">
      <div className="flex items-center gap-1">
        <span className={`inline-block h-2 w-2 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
      </div>
      <div className="truncate text-xs text-foreground">{label}</div>
      {isActive && (
        <div className="ml-2 flex items-center gap-1">
          <span className="inline-block h-3 w-0.5 animate-[wave_800ms_linear_infinite] bg-green-400" />
          <span className="inline-block h-4 w-0.5 animate-[wave_1200ms_linear_infinite] bg-green-400" />
          <style>{`@keyframes wave {0% {transform: scaleY(0.3);} 50% {transform: scaleY(1);} 100% {transform: scaleY(0.3);} }`}</style>
        </div>
      )}
    </div>
  );
}

function isRtmMessageErrorPayload(
  value: unknown,
): value is RtmMessageErrorPayload {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { object?: unknown }).object === 'message.error'
  );
}

function isRtmSalStatusPayload(value: unknown): value is RtmSalStatusPayload {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { object?: unknown }).object === 'message.sal_status'
  );
}

export function ActiveRoom({
  agoraData,
  rtmClient,
  onTokenWillExpire,
  onEndConversation,
  isStopping,
}: ActiveRoomProps) {
  const client = useRTCClient();
  const remoteUsers = useRemoteUsers();
  const [isEnabled, setIsEnabled] = useState(true);
  const [isAgentConnected, setIsAgentConnected] = useState(false);
  const [isConnectionDetailsOpen, setIsConnectionDetailsOpen] = useState(false);
  const [isIncidentHistoryOpen, setIsIncidentHistoryOpen] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const isDeafenedRef = useRef(false);
  useEffect(() => {
    isDeafenedRef.current = isDeafened;
  }, [isDeafened]);

  const incidentCtx = useIncidentContext();
  const incidentCtxRef = useRef(incidentCtx);
  useEffect(() => {
    incidentCtxRef.current = incidentCtx;
  }, [incidentCtx]);

  // StrictMode guard
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      if (!cancelled) setIsReady(true);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
      setIsReady(false);
    };
  }, []);

  const { isConnected: joinSuccess } = useJoin(
    {
      appid: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
      channel: agoraData.channel,
      token: agoraData.token,
      uid: parseInt(agoraData.uid, 10),
    },
    isReady,
  );

  const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);

  // Toggle speaker deafening (stop/resume all remote audio tracks)
  const toggleDeafen = useCallback(() => {
    setIsDeafened((prev) => {
      const next = !prev;
      remoteUsers.forEach((user) => {
        if (next) {
          user.audioTrack?.stop();
        } else {
          user.audioTrack?.play();
        }
      });
      return next;
    });
  }, [remoteUsers]);

  // Single-source audio exclusivity: detect if Agora audio is actively connected
  const isAgoraAudioActive = Boolean(joinSuccess && (isAgentConnected || remoteUsers.length > 0));

  const {
    processUserSpeech,
    assistantReply,
    speechError,
    isProcessing: isCopilotProcessing,
    latestMetrics,
    abortPendingSpeech,
  } = useAiSpeechHandler({
    channel: agoraData.channel,
    isAgoraAudioActive,
    onStateDelta: (delta) => {
      incidentCtxRef.current?.applyStateDelta(delta);
    },
    onBotSpeech: (speechText) => {
      incidentCtxRef.current?.addTranscript({
        speaker: 'EchoOps AI Commander',
        text: speechText,
      });
    },
  });

  // Tracks granular RTC connection state for the status dot.
  const [connectionState, setConnectionState] = useState<string>('CONNECTING');
  const agentUID = String(DEFAULT_AGENT_UID);
  const [joinedUID, setJoinedUID] = useState<UID>(0);
  const [agoraTranscriptionAvailable, setAgoraTranscriptionAvailable] =
    useState(false);
  const [agoraSpeech, setAgoraSpeech] = useState<AgoraSpeechUpdate | null>(null);

  // Transcript + agent state — managed with AgoraVoiceAI
  const [rawTranscript, setRawTranscript] = useState<
    TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>[]
  >([]);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [agentMetrics, setAgentMetrics] = useState<QuickstartAgentMetric[]>([]);
  const [connectionIssues, setConnectionIssues] = useState<ConnectionIssue[]>(
    [],
  );
  const addConnectionIssue = useCallback((issue: ConnectionIssue) => {
    setConnectionIssues((prev) => {
      const isDuplicate = prev.some(
        (x) =>
          x.agentUserId === issue.agentUserId &&
          x.code === issue.code &&
          x.message === issue.message &&
          Math.abs(x.timestamp - issue.timestamp) < 1500,
      );
      if (isDuplicate) return prev;
      return [issue, ...prev].slice(0, MAX_CONNECTION_ISSUES);
    });
  }, []);

  // Auto-open details panel as soon as a new issue is recorded.
  useEffect(() => {
    if (connectionIssues.length > 0) {
      setIsConnectionDetailsOpen(true);
    }
  }, [connectionIssues.length]);

  // Audio initialization and mic permission probe
  const requestMicrophoneAccess = useCallback(async () => {
    if (!process.env.NEXT_PUBLIC_AGORA_APP_ID) {
      console.warn(
        '[EchoOps] NEXT_PUBLIC_AGORA_APP_ID is undefined in environment variables. Agora RTC connection may fail.',
      );
    }

    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop test probe stream so Agora's useLocalMicrophoneTrack manages the actual hardware track
      stream.getTracks().forEach((track) => track.stop());
      setMicPermissionError(null);
    } catch (err: unknown) {
      const error = err as Error;
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        const msg =
          'Microphone permission denied (NotAllowedError). Please allow microphone access to speak in the war room.';
        console.warn(`[EchoOps] ${msg}`);
        setMicPermissionError(msg);
      } else {
        console.warn('[EchoOps] Microphone stream acquisition warning:', error);
      }
    }
  }, []);

  useEffect(() => {
    requestMicrophoneAccess();
  }, [requestMicrophoneAccess]);

  // Wire incoming Agora remote audio track listener so received bot speech streams directly to audio element
  useClientEvent(client, 'user-published', async (user, mediaType) => {
    try {
      await client.subscribe(user, mediaType);
      if (mediaType === 'audio') {
        if (!isDeafenedRef.current) {
          user.audioTrack?.play();
        }
        console.info(`[EchoOps] Subscribed and playing remote audio track for UID: ${user.uid}`);
      }
    } catch (err) {
      console.warn('[EchoOps] Error subscribing to remote audio track:', err);
    }
  });

  useClientEvent(client, 'user-unpublished', (user, mediaType) => {
    if (mediaType === 'audio') {
      user.audioTrack?.stop();
      console.info(`[EchoOps] Stopped remote audio track for UID: ${user.uid}`);
    }
  });

  useEffect(() => {
    if (!client) return;
    try {
      (AgoraRTC as AgoraRtcWithParameters).setParameter?.(
        'ENABLE_AUDIO_PTS',
        true,
      );
      (AgoraRTC as AgoraRtcWithParameters).setParameter?.(
        'AUDIO_VOLUME_INDICATION_INTERVAL',
        100,
      );
    } catch (error) {
      console.warn('Could not set ENABLE_AUDIO_PTS:', error);
    }
  }, [client]);

  useEffect(() => {
    if (joinSuccess && client) {
      const uid = client.uid;
      if (uid !== null && uid !== undefined) {
        setJoinedUID(uid);
      }
    }
  }, [joinSuccess, client]);

  // Guardrail: detect when bot is outputting audio
  const isRemoteAgentAudioPlaying = useMemo(() => {
    return remoteUsers.some(
      (user) =>
        user.uid.toString() === agentUID &&
        user.hasAudio &&
        Boolean((user.audioTrack as unknown as { isPlaying?: boolean })?.isPlaying),
    );
  }, [remoteUsers, agentUID]);

  const isBotSpeaking = useMemo(() => {
    return (
      !isInterrupted &&
      (agentState === 'speaking' || isCopilotProcessing || isRemoteAgentAudioPlaying)
    );
  }, [agentState, isCopilotProcessing, isInterrupted, isRemoteAgentAudioPlaying]);

  const isBotSpeakingRef = useRef(isBotSpeaking);
  useEffect(() => {
    isBotSpeakingRef.current = isBotSpeaking;
  }, [isBotSpeaking]);

  // Interruption handling: abort pending network requests immediately via AbortController
  const interruptBotPlayback = useCallback(() => {
    setIsInterrupted(true);
    abortPendingSpeech();
    stopAudibleSpeech();
    window.dispatchEvent(new CustomEvent('echoops:bot-interrupt'));
    remoteUsers
      .filter((user) => user.uid.toString() === agentUID)
      .forEach((user) => {
        const audioTrack = user.audioTrack as unknown as
          | { stop?: () => void }
          | undefined;
        audioTrack?.stop?.();
      });

    void fetch('/api/bot/speak/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: agoraData.channel }),
    }).catch((error) => {
      console.warn('Failed to cancel bot speech:', error);
    });
  }, [abortPendingSpeech, agentUID, agoraData.channel, remoteUsers]);

  const vadStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isVadActiveRef = useRef(false);
  const [isVadActive, setIsVadActive] = useState(false);

  useEffect(() => {
    isVadActiveRef.current = isVadActive;
  }, [isVadActive]);

  // Hook handles transcript accumulation and mutes when bot is speaking
  const { interimTranscript, flushTranscript } = useSpeechCapture({
    isMicActive: isReady && isEnabled && Boolean(localMicrophoneTrack),
    isVadActive: isVadActive && !isBotSpeaking,
    isBotSpeaking,
    agoraTranscriptionAvailable,
    agoraSpeech: isBotSpeaking ? null : agoraSpeech,
    onUtteranceComplete: (text) => {
      const cleanText = text.trim();
      processUserSpeech(cleanText);
      if (cleanText) {
        incidentCtxRef.current?.addTranscript({
          speaker: 'You (Human Operator)',
          text: cleanText,
        });
      }
      // Append captured utterance to rawTranscript if Agora backend STT hasn't pushed it
      if (!agoraTranscriptionAvailable && cleanText) {
        setRawTranscript((prev) => [
          ...prev,
          {
            uid: '0',
            text: cleanText,
            status: TurnStatus.END,
            turn_id: Date.now(),
            _time: Date.now(),
            stream_id: 0,
            metadata: null,
          },
        ]);
      }
    },
  });

  const flushTranscriptRef = useRef(flushTranscript);
  useEffect(() => {
    flushTranscriptRef.current = flushTranscript;
  }, [flushTranscript]);

  // Core VAD processor: evaluates local volume level against threshold
  const processVadLevel = useCallback(
    (level: number) => {
      const isAboveThreshold = level > VAD_THRESHOLD;

      if (isAboveThreshold) {
        // Active speech: cancel silence timer
        if (vadSilenceTimerRef.current) {
          clearTimeout(vadSilenceTimerRef.current);
          vadSilenceTimerRef.current = null;
        }

        // Trigger transcription capture ONLY when volume crosses threshold (> 25) for > 200ms
        if (!vadStartTimerRef.current && !isVadActiveRef.current) {
          vadStartTimerRef.current = setTimeout(() => {
            vadStartTimerRef.current = null;
            isVadActiveRef.current = true;
            setIsVadActive(true);

            // User barge-in during bot speech triggers immediate interruption
            if (isBotSpeakingRef.current) {
              interruptBotPlayback();
            }
          }, VAD_START_MS);
        }
        return;
      }

      // Volume is below threshold
      // Discard transient spikes that lasted less than 200ms
      if (vadStartTimerRef.current) {
        clearTimeout(vadStartTimerRef.current);
        vadStartTimerRef.current = null;
      }

      // Auto-Silence Detection: when volume drops below threshold for 1.2s, treat utterance as finished
      if (isVadActiveRef.current && !vadSilenceTimerRef.current) {
        vadSilenceTimerRef.current = setTimeout(() => {
          vadSilenceTimerRef.current = null;
          isVadActiveRef.current = false;
          setIsVadActive(false);

          // Trigger AI processing hook with completed utterance
          flushTranscriptRef.current();
        }, VAD_SILENCE_MS);
      }
    },
    [interruptBotPlayback],
  );

  // Client-Side VAD via agoraRTCClient.enableAudioVolumeIndicator()
  useEffect(() => {
    if (!isReady || !joinSuccess || !isEnabled) return;

    client.enableAudioVolumeIndicator();
    const handleVolumeIndicator = (
      volumes: Array<{ uid: UID; level: number }>,
    ) => {
      const localVolume = volumes.find(
        (volume) =>
          volume.uid === 0 ||
          (client.uid !== null && String(volume.uid) === String(client.uid)),
      );
      const level = localVolume?.level ?? 0;
      processVadLevel(level);
    };

    client.on('volume-indicator', handleVolumeIndicator);

    // High frequency interval (50ms) to ensure exact 200ms start and 1.2s silence detection
    const pollInterval = setInterval(() => {
      if (localMicrophoneTrack && isEnabled) {
        const trackLevel = Math.round((localMicrophoneTrack.getVolumeLevel() || 0) * 100);
        processVadLevel(trackLevel);
      }
    }, 50);

    return () => {
      client.off('volume-indicator', handleVolumeIndicator);
      clearInterval(pollInterval);
      if (vadStartTimerRef.current) clearTimeout(vadStartTimerRef.current);
      if (vadSilenceTimerRef.current) clearTimeout(vadSilenceTimerRef.current);
      vadStartTimerRef.current = null;
      vadSilenceTimerRef.current = null;
      isVadActiveRef.current = false;
      setIsVadActive(false);
    };
  }, [client, isEnabled, isReady, joinSuccess, localMicrophoneTrack, processVadLevel]);

  // Reset interrupted state when bot finishes speaking
  useEffect(() => {
    if (agentState !== 'speaking' && !isCopilotProcessing && !isRemoteAgentAudioPlaying) {
      setIsInterrupted(false);
    }
  }, [agentState, isCopilotProcessing, isRemoteAgentAudioPlaying]);

  // Initialize AgoraVoiceAI once the channel is joined
  useEffect(() => {
    if (!isReady || !joinSuccess || !rtmClient) return;

    let cancelled = false;

    (async () => {
      try {
        const ai = await AgoraVoiceAI.init({
          rtcEngine: client,
          rtmConfig: { rtmEngine: rtmClient },
          renderMode: TranscriptHelperMode.TEXT,
          enableLog: true,
        });

        if (cancelled) {
          try {
            if (AgoraVoiceAI.getInstance() === ai) {
              ai.unsubscribe();
              ai.destroy();
            }
          } catch {}
          return;
        }

        const forwardedRef = { ids: new Set<string>() } as { ids: Set<string> };

        ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (t) => {
          setAgoraTranscriptionAvailable(true);
          setRawTranscript([...t]);

          // Guard: ignore transcript updates while bot is outputting audio
          if (isBotSpeakingRef.current) return;

          try {
            const latestLocalTurn = [...t]
              .reverse()
              .find(
                (item) =>
                  (item.uid === '0' || String(item.uid) === String(client.uid)) &&
                  typeof item.text === 'string' &&
                  item.text.trim(),
              );
            if (latestLocalTurn && typeof latestLocalTurn.text === 'string') {
              setAgoraSpeech({
                text: latestLocalTurn.text,
                isFinal: latestLocalTurn.status !== TurnStatus.IN_PROGRESS,
                id: String(
                  latestLocalTurn.turn_id ||
                    `${latestLocalTurn.uid}-${latestLocalTurn._time || 'current'}`,
                ),
              });
            }

            (t || []).forEach((item: TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>) => {
              const status = item.status as unknown as number;
              if (status === TurnStatus.IN_PROGRESS) return;
              const id = String(item.turn_id || `${item.uid}-${item._time || Date.now()}`);
              if (forwardedRef.ids.has(id)) return;
              forwardedRef.ids.add(id);

              if (item.text && item.text.trim()) {
                const isUser = item.uid === '0' || String(item.uid) === String(client.uid);
                // Only push remote turns if not already added by local utterance handler
                if (!isUser) {
                  incidentCtxRef.current?.addTranscript({
                    speaker: 'EchoOps AI Commander',
                    text: item.text.trim(),
                  });
                }
              }

              const payload = {
                audio_stream: null,
                text: item.text,
                speaker_id: item.uid,
                channel: agoraData.channel,
                ts: typeof item._time === 'number' ? item._time : Date.now(),
                turn_id: item.turn_id,
              };

              void fetch('/api/forward-audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              }).catch((e) => console.warn('forward-audio failed:', e));

              // Ingest and persist every transcript turn into PostgreSQL database
              if (item.text && typeof item.text === 'string') {
                void fetch('/api/ai/analyze-incident', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    channelName: agoraData.channel || 'echoops-war-room',
                    speakerName:
                      item.uid === '0' || String(item.uid) === String(client.uid)
                        ? 'You (Commander)'
                        : 'EchoOps AI',
                    transcript: item.text,
                  }),
                }).catch((e) => console.warn('analyze-incident failed:', e));
              }
            });
          } catch (err) {
            console.warn('Error forwarding transcript:', err);
          }
        });

        ai.on(AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_, event) =>
          setAgentState(event.state),
        );
        ai.on(AgoraVoiceAIEvents.AGENT_METRICS, (_, metrics) => {
          setAgentMetrics((prev) => [...prev, metrics].slice(-8));
        });
        ai.on(AgoraVoiceAIEvents.MESSAGE_ERROR, (agentUserId, error) => {
          addConnectionIssue({
            id: `${Date.now()}-${agentUserId}-message-error-${error.code}`,
            source: 'rtm',
            agentUserId,
            code: error.code,
            message: error.message,
            timestamp: normalizeTimestampMs(error.timestamp),
          });
        });

        ai.on(
          AgoraVoiceAIEvents.MESSAGE_SAL_STATUS,
          (agentUserId, salStatus) => {
            if (
              salStatus.status === MessageSalStatus.VP_REGISTER_FAIL ||
              salStatus.status === MessageSalStatus.VP_REGISTER_DUPLICATE
            ) {
              addConnectionIssue({
                id: `${Date.now()}-${agentUserId}-sal-${salStatus.status}`,
                source: 'rtm',
                agentUserId,
                code: salStatus.status,
                message: `SAL status: ${salStatus.status}`,
                timestamp: normalizeTimestampMs(salStatus.timestamp),
              });
            }
          },
        );

        ai.on(AgoraVoiceAIEvents.AGENT_ERROR, (agentUserId, error) => {
          addConnectionIssue({
            id: `${Date.now()}-${agentUserId}-agent-error-${error.code}`,
            source: 'agent',
            agentUserId,
            code: error.code,
            message: `${error.type}: ${error.message}`,
            timestamp: normalizeTimestampMs(error.timestamp),
          });
        });

        ai.subscribeMessage(agoraData.channel);
      } catch (error) {
        if (!cancelled) {
          console.error('[AgoraVoiceAI] init failed:', error);
        }
      }
    })();

    return () => {
      cancelled = true;
      setAgoraTranscriptionAvailable(false);
      setAgoraSpeech(null);
      try {
        const ai = AgoraVoiceAI.getInstance();
        if (ai) {
          ai.unsubscribe();
          ai.destroy();
        }
      } catch {}
    };
  }, [isReady, joinSuccess, client, rtmClient, agoraData.channel, addConnectionIssue]);

  // Raw RTM parsing fallback
  useEffect(() => {
    const handleRtmMessage = (event: {
      message: string | Uint8Array;
      publisher: string;
    }) => {
      const payloadText =
        typeof event.message === 'string'
          ? event.message
          : new TextDecoder().decode(event.message);

      let parsed: unknown;
      try {
        parsed = JSON.parse(payloadText);
      } catch {
        return;
      }

      if (isRtmMessageErrorPayload(parsed)) {
        const p = parsed;
        addConnectionIssue({
          id: `${Date.now()}-${event.publisher}-rtm-msg-error-${p.code ?? 'unknown'}`,
          source: 'rtm-signaling',
          agentUserId: event.publisher,
          code: p.code ?? 'unknown',
          message: `${p.module ?? 'unknown'}: ${p.message ?? 'Unknown signaling error'}`,
          timestamp: normalizeTimestampMs(p.send_ts ?? Date.now()),
        });
        return;
      }

      if (isRtmSalStatusPayload(parsed)) {
        const p = parsed;
        if (
          p.status === 'VP_REGISTER_FAIL' ||
          p.status === 'VP_REGISTER_DUPLICATE'
        ) {
          addConnectionIssue({
            id: `${Date.now()}-${event.publisher}-rtm-sal-${p.status}`,
            source: 'rtm-signaling',
            agentUserId: event.publisher,
            code: p.status,
            message: `SAL status: ${p.status}`,
            timestamp: normalizeTimestampMs(p.timestamp ?? Date.now()),
          });
        }
      }
    };

    if (!rtmClient) return;

    rtmClient.addEventListener('message', handleRtmMessage);
    return () => {
      rtmClient.removeEventListener('message', handleRtmMessage);
    };
  }, [rtmClient, addConnectionIssue]);

  const transcript = useMemo(() => {
    const base = normalizeTranscript(rawTranscript, String(client.uid));
    if (!agoraTranscriptionAvailable && interimTranscript.trim() && !isBotSpeaking) {
      return [
        ...base,
        {
          uid: String(client.uid),
          text: interimTranscript.trim(),
          status: TurnStatus.IN_PROGRESS,
          turn_id: 0,
          _time: 0,
          stream_id: 0,
          metadata: null,
        },
      ];
    }
    return base;
  }, [rawTranscript, client.uid, agoraTranscriptionAvailable, interimTranscript, isBotSpeaking]);

  const activeInProgress = useMemo(() => {
    return transcript.find((entry) => entry.status === TurnStatus.IN_PROGRESS) ?? null;
  }, [transcript]);

  const messageList = useMemo(() => getMessageList(transcript), [transcript]);
  const currentInProgressMessage = useMemo(() => getCurrentInProgressMessage(transcript), [transcript]);

  usePublish([localMicrophoneTrack]);

  useClientEvent(client, 'user-joined', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(true);
  });

  useClientEvent(client, 'user-left', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(false);
  });

  useEffect(() => {
    const isAgentInRemoteUsers = remoteUsers.some(
      (user) => user.uid.toString() === agentUID,
    );
    setIsAgentConnected(isAgentInRemoteUsers);
  }, [remoteUsers, agentUID]);

  useClientEvent(client, 'connection-state-change', (curState) => {
    setConnectionState(curState);
  });

  const connectionSeverity = useMemo<'normal' | 'warning' | 'error'>(() => {
    if (connectionState === 'DISCONNECTED' || connectionState === 'DISCONNECTING') {
      return 'error';
    }
    if (connectionState === 'CONNECTING' || connectionState === 'RECONNECTING') {
      return 'warning';
    }
    if (connectionIssues.length === 0) {
      return 'normal';
    }
    return connectionIssues.some((issue) => getConversationIssueSeverity(issue) === 'error')
      ? 'error'
      : 'warning';
  }, [connectionState, connectionIssues]);

  const visualizerState = isInterrupted
    ? 'ambient'
    : isCopilotProcessing
      ? 'talking'
      : mapAgentVisualizerState(agentState, isAgentConnected, connectionState);

  const handleMicToggle = useCallback(async () => {
    const next = !isEnabled;
    const track = localMicrophoneTrack;
    if (!track) {
      setIsEnabled(next);
      return;
    }
    try {
      await track.setEnabled(next);
      setIsEnabled(next);
    } catch (error) {
      console.error('Failed to toggle microphone:', error);
    }
  }, [isEnabled, localMicrophoneTrack]);

  const handleTokenWillExpire = useCallback(async () => {
    if (!onTokenWillExpire || !joinedUID) return;
    try {
      const { rtcToken, rtmToken } = await onTokenWillExpire(
        joinedUID.toString(),
      );
      await client?.renewToken(rtcToken);
      if (rtmClient) {
        await rtmClient.renewToken(rtmToken);
      }
    } catch (error) {
      console.error('Failed to renew Agora token:', error);
    }
  }, [client, onTokenWillExpire, joinedUID, rtmClient]);

  useClientEvent(client, 'token-privilege-will-expire', handleTokenWillExpire);

  const handleEndConversation = useCallback(async () => {
    onEndConversation();
  }, [onEndConversation]);

  const handleSaveIncidentSummary = useCallback(() => {
    try {
      const channel = agoraData.channel ?? 'unknown-channel';
      const now = new Date();
      const ts = now.toISOString();
      const entries = transcript.map((t) => ({
        speaker: t.uid,
        ts: typeof t._time === 'number' ? normalizeTimestampMs(t._time) : undefined,
        text: t.text ?? '',
        status: t.status,
      }));

      const incident: ArchivedIncident = {
        id: `${channel}-${Date.now()}`,
        title: `Incident Summary - ${channel}`,
        timestamp: ts,
        severity: 'Sev-3',
        summary: entries.length > 0 ? entries[entries.length - 1].text : 'No transcript entries recorded.',
        actionItems: [],
        timeline: entries.map((entry) => ({
          time: entry.ts ? new Date(entry.ts).toISOString() : ts,
          note: `Speaker ${entry.speaker}: ${entry.text}`,
        })),
      };
      saveCurrentIncident(incident);

      const mdLines: string[] = [];
      mdLines.push(`# Incident Summary — ${channel}`);
      mdLines.push(`\nGenerated: ${ts}\n`);
      mdLines.push(`## Timeline`);
      entries.forEach((e) => {
        const date = e.ts ? new Date(e.ts).toISOString() : '';
        mdLines.push(`- **Speaker ${e.speaker}** — ${date}`);
        mdLines.push(`  \n\n  ${e.text}\n`);
      });

      const filename = `incident-summary-${channel}-${Math.floor(Date.now() / 1000)}.md`;
      const blob = new Blob([mdLines.join('\n')], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      console.error('Failed to save incident summary:', err);
    }
  }, [agoraData.channel, transcript]);

  return (
    <>
      <QuickstartConversationLayout
        statusPanel={
          <div className="flex items-center gap-3">
            <div className="flex flex-col text-sm">
              <span className="font-semibold">Channel</span>
              <span className="text-muted-foreground truncate">{agoraData.channel ?? 'unknown'}</span>
            </div>
            <div>
              <ConnectionStatusPanel
                connectionState={connectionState}
                connectionSeverity={connectionSeverity}
                connectionIssues={connectionIssues}
                isOpen={isConnectionDetailsOpen}
                onToggle={() => setIsConnectionDetailsOpen((open) => !open)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-2 w-2 rounded-full ${isAgentConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="text-xs text-muted-foreground">{isAgentConnected ? 'Bot live' : 'Bot not present'}</span>
            </div>
            {micPermissionError && (
              <div className="flex items-center gap-2 rounded border border-destructive/40 bg-destructive/15 px-2 py-0.5 text-xs text-destructive">
                <span className="max-w-xs truncate" title={micPermissionError}>⚠️ {micPermissionError}</span>
                <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5 shrink-0" onClick={requestMicrophoneAccess}>
                  Retry Mic
                </Button>
              </div>
            )}
            <div className="flex items-center gap-1.5 ml-2">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                  isVadActive
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-muted/50 text-muted-foreground border border-border/40'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isVadActive ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground/50'}`} />
                {isVadActive ? 'VAD Active' : 'VAD Standby'}
              </span>
              {isBotSpeaking && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Mic Muted (Bot Speaking)
                </span>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsDebugOpen((open) => !open)}>
              SRE Debug
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsIncidentHistoryOpen(true)}>
              Incident History
            </Button>
          </div>
        }
        pipelineMetrics={<QuickstartPipelineMetrics metrics={agentMetrics} />}
        transcriptPanel={
          <QuickstartTranscriptPanel
            messageList={messageList}
            currentInProgressMessage={currentInProgressMessage}
            agentUID={agentUID}
            assistantReply={assistantReply}
            isAssistantProcessing={isCopilotProcessing}
          />
        }
        visualizer={
          <div className="relative flex h-full min-h-[20rem] w-full max-w-4xl flex-col items-center justify-center" role="region" aria-label="AI agent status visualization">
            {isDebugOpen && (
              <div className="absolute right-0 top-0 z-10 rounded-md border border-border bg-card/95 p-3 font-mono text-xs shadow-lg">
                <div className="mb-2 font-sans font-semibold text-foreground">Voice roundtrip</div>
                {latestMetrics ? (
                  <div className="space-y-1 text-muted-foreground">
                    <div>LLM: {Math.round(latestMetrics.t_llm)} ms</div>
                    <div>Total: {Math.round(latestMetrics.t_total)} ms</div>
                    <div className="pt-1 text-[10px]">t0 {Math.round(latestMetrics.t0)}</div>
                    <div className="text-[10px]">t1 {Math.round(latestMetrics.t1)}</div>
                    <div className="text-[10px]">t2 {Math.round(latestMetrics.t2)}</div>
                    <div className="text-[10px]">t3 {Math.round(latestMetrics.t3)}</div>
                  </div>
                ) : (
                  <div className="text-muted-foreground">Waiting for a completed turn</div>
                )}
              </div>
            )}
            <BotAudioVisualizer
              isSpeaking={isBotSpeaking}
              isProcessing={isCopilotProcessing}
              isInterrupted={isInterrupted}
            />
            {speechError && <p className="text-xs text-destructive">{speechError}</p>}
            <div className="mb-3 w-full flex items-center justify-center">
              <AgentVisualizer state={visualizerState} size="lg" />
            </div>
            <div className="my-2 w-full flex items-center justify-center">
              <RunbookQuickActions
                onExecuteCommand={(command) => processUserSpeech(command)}
                channel={agoraData.channel}
                disabled={isCopilotProcessing}
              />
            </div>
            <div className="mt-2 flex w-full max-w-4xl flex-wrap items-center justify-center gap-3">
              <ParticipantChip label={`You (${client.uid ?? 'me'})`} isActive={String(activeInProgress?.uid) === String(client.uid) || (isVadActive && !isBotSpeaking)} />
              <ParticipantChip label={`EchoOps Bot (${agentUID})`} isActive={String(activeInProgress?.uid) === agentUID || isBotSpeaking} />
              {remoteUsers.map((user) => (
                <ParticipantChip key={user.uid} label={`User ${user.uid}`} isActive={String(activeInProgress?.uid) === String(user.uid)} />
              ))}
            </div>
          </div>
        }
        controls={
          <FloatingAudioDock
            isMicEnabled={isEnabled}
            onToggleMic={handleMicToggle}
            isDeafened={isDeafened}
            onToggleDeafen={toggleDeafen}
            isVadActive={isVadActive}
            isBotSpeaking={isBotSpeaking}
            connectionState={connectionState}
            localMicrophoneTrack={localMicrophoneTrack}
            onEndConversation={handleEndConversation}
            isEnding={isStopping}
            onSaveSummary={handleSaveIncidentSummary}
            channelName={agoraData.channel}
          />
        }
        onEndConversation={handleEndConversation}
        isEnding={isStopping}
      />
      <IncidentHistoryDrawer isOpen={isIncidentHistoryOpen} onClose={() => setIsIncidentHistoryOpen(false)} />
    </>
  );
}

export const ConversationComponent = ActiveRoom;
export default ActiveRoom;
export type { ActiveRoomProps, ConversationComponentProps };
