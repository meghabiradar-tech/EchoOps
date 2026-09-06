'use client';

import { useCallback, useRef, useState } from 'react';
import { startAiTurn, type AiTurnMetrics } from '@/lib/aiMetrics';
import type { SreAction } from '@/lib/sreTools';
import type { IncidentStateDelta } from '@/app/api/ai/respond/route';

type SpeechHistoryItem = {
  role: string;
  content: string;
};

type RespondPayload = {
  type?: unknown;
  text?: unknown;
  speech?: unknown;
  stateDelta?: unknown;
  error?: unknown;
  actionsExecuted?: unknown;
};

export function stopAudibleSpeech() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {}
}

export function playAudibleSpeech(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const clean = text.replace(/[*_#`]/g, '').trim();
    if (!clean) return;
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Natural') ||
            v.name.includes('Google') ||
            v.name.includes('Samantha') ||
            v.name.includes('Daniel') ||
            v.name.includes('Alex')),
      ) || voices.find((v) => v.lang.startsWith('en'));

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('[EchoOps] Browser speech synthesis error:', err);
  }
}

type UseAiSpeechHandlerOptions = {
  channel: string;
  onStateDelta?: (delta: IncidentStateDelta) => void;
  onBotSpeech?: (text: string) => void;
  isAgoraAudioActive?: boolean;
};

export function useAiSpeechHandler({
  channel,
  onStateDelta,
  onBotSpeech,
  isAgoraAudioActive = false,
}: UseAiSpeechHandlerOptions) {
  const [assistantReply, setAssistantReply] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [latestMetrics, setLatestMetrics] = useState<AiTurnMetrics | null>(null);
  const [actionsExecuted, setActionsExecuted] = useState<SreAction[]>([]);
  const isProcessingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const onStateDeltaRef = useRef(onStateDelta);
  const onBotSpeechRef = useRef(onBotSpeech);
  const isAgoraAudioActiveRef = useRef(isAgoraAudioActive);

  onStateDeltaRef.current = onStateDelta;
  onBotSpeechRef.current = onBotSpeech;
  isAgoraAudioActiveRef.current = isAgoraAudioActive;

  const processUserSpeech = useCallback(
    async (transcript: string, history: SpeechHistoryItem[] = []) => {
      const normalizedTranscript = transcript.trim();
      if (!normalizedTranscript) return;

      // Abort any in-flight requests and stop any running synthesis
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      stopAudibleSpeech();

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      isProcessingRef.current = true;
      setIsProcessing(true);
      setSpeechError(null);
      setAssistantReply('');
      setActionsExecuted([]);
      const metrics = startAiTurn();

      try {
        // Ingest user speech into PostgreSQL database & state machine
        void fetch('/api/ai/analyze-incident', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelName: channel || 'echoops-war-room',
            speakerName: 'You (Commander)',
            transcript: normalizedTranscript,
          }),
        }).catch((err) => console.warn('Turn persistence note:', err));

        metrics.markLlmRequest();

        const respondResponse = await fetch('/api/ai/respond', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            transcript: normalizedTranscript,
            history,
            channelName: channel,
          }),
          signal: abortController.signal,
        });

        if (!respondResponse.ok) {
          throw new Error(`AI copilot error (HTTP ${respondResponse.status})`);
        }

        const contentType = respondResponse.headers.get('content-type') || '';

        // Case 1: Standard JSON response containing { speech, stateDelta }
        if (contentType.includes('application/json')) {
          const data = (await respondResponse.json()) as {
            speech?: string;
            stateDelta?: IncidentStateDelta;
          };

          if (abortController.signal.aborted) return;

          metrics.markLlmReady();
          setLatestMetrics(metrics.markSpeakTriggered());

          const speechText = data.speech?.trim() || '';
          if (speechText) {
            setAssistantReply(speechText);
            onBotSpeechRef.current?.(speechText);

            // Single-source audio exclusivity: only use browser SpeechSynthesis if Agora RTC audio is not active
            if (!isAgoraAudioActiveRef.current) {
              playAudibleSpeech(speechText);
            }

            // Forward to Agora TTS audio playback in channel
            void fetch('/api/bot/speak', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: speechText, priority: 'high', channel }),
              signal: abortController.signal,
            }).catch((err) => console.warn('[EchoOps] Bot speak error:', err));

            // Persist AI response turn into PostgreSQL database
            void fetch('/api/ai/analyze-incident', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                channelName: channel || 'echoops-war-room',
                speakerName: 'EchoOps AI',
                transcript: speechText,
              }),
            }).catch((err) => console.warn('AI turn persistence note:', err));
          }

          // Immediately merge state delta into live incident context
          if (data.stateDelta && typeof data.stateDelta === 'object') {
            onStateDeltaRef.current?.(data.stateDelta);
          }
        }
        // Case 2: SSE streaming response
        else if (respondResponse.body) {
          const reader = respondResponse.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let streamDone = false;
          let fullSpeech = '';

          const handleEvent = (rawEvent: string) => {
            if (abortController.signal.aborted) return;
            const dataStr = rawEvent
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
              .join('');
            if (!dataStr) return;

            try {
              const payload = JSON.parse(dataStr) as RespondPayload;

              if (payload.type === 'chunk' && typeof payload.text === 'string') {
                fullSpeech += payload.text;
                setAssistantReply(fullSpeech);
              }

              if (payload.type === 'delta' && payload.stateDelta) {
                onStateDeltaRef.current?.(payload.stateDelta as IncidentStateDelta);
              }

              if (payload.type === 'done') {
                streamDone = true;
                if (Array.isArray(payload.actionsExecuted)) {
                  setActionsExecuted(payload.actionsExecuted as SreAction[]);
                }
              }
            } catch {}
          };

          while (!streamDone) {
            if (abortController.signal.aborted) {
              try { await reader.cancel(); } catch {}
              break;
            }
            const { done, value } = await reader.read();
            if (done || abortController.signal.aborted) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';
            events.forEach(handleEvent);
          }

          if (fullSpeech.trim()) {
            onBotSpeechRef.current?.(fullSpeech.trim());
            // Single-source audio exclusivity: only use browser SpeechSynthesis if Agora RTC audio is not active
            if (!isAgoraAudioActiveRef.current) {
              playAudibleSpeech(fullSpeech.trim());
            }
            void fetch('/api/bot/speak', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: fullSpeech.trim(), priority: 'high', channel }),
              signal: abortController.signal,
            }).catch((err) => console.warn('[EchoOps] Bot speak error:', err));

            void fetch('/api/ai/analyze-incident', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                channelName: channel || 'echoops-war-room',
                speakerName: 'EchoOps AI',
                transcript: fullSpeech.trim(),
              }),
            }).catch((err) => console.warn('AI turn persistence note:', err));
          }
        }
      } catch (error) {
        if (abortController.signal.aborted) return;
        console.error('[EchoOps] AI copilot speech processing failed:', error);
        setSpeechError(
          error instanceof Error ? error.message : 'Speech processing failed.',
        );
      } finally {
        if (!abortController.signal.aborted) {
          isProcessingRef.current = false;
          setIsProcessing(false);
        }
      }
    },
    [channel],
  );

  const abortPendingSpeech = useCallback(() => {
    stopAudibleSpeech();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isProcessingRef.current = false;
    setIsProcessing(false);
  }, []);

  return {
    processUserSpeech,
    assistantReply,
    speechError,
    isProcessing,
    latestMetrics,
    actionsExecuted,
    abortPendingSpeech,
  };
}