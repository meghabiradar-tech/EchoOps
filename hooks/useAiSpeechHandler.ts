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

let speechWatchdogInterval: ReturnType<typeof setInterval> | null = null;

export function stopAudibleSpeech() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    if (speechWatchdogInterval) {
      clearInterval(speechWatchdogInterval);
      speechWatchdogInterval = null;
    }
    window.speechSynthesis.cancel();
  } catch {}
}

export function playAudibleSpeech(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onEnd?.();
    return;
  }
  try {
    stopAudibleSpeech();
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    const clean = text.replace(/[*_#`]/g, '').trim();
    if (!clean) {
      onEnd?.();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    let hasStarted = false;
    let hasEnded = false;

    const cleanup = () => {
      if (speechWatchdogInterval) {
        clearInterval(speechWatchdogInterval);
        speechWatchdogInterval = null;
      }
      if (!hasEnded) {
        hasEnded = true;
        onEnd?.();
      }
    };

    utterance.onstart = () => {
      hasStarted = true;
      onStart?.();

      // Chrome speech synthesis watchdog to prevent pause bug on long utterances
      if (speechWatchdogInterval) clearInterval(speechWatchdogInterval);
      speechWatchdogInterval = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          cleanup();
        } else if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 5000);
    };

    utterance.onend = () => {
      cleanup();
    };

    utterance.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('[EchoOps] Speech synthesis utterance error:', e.error);
      }
      cleanup();
    };

    const setVoiceAndSpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice =
        voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            (v.name.includes('Natural') ||
              v.name.includes('Google') ||
              v.name.includes('Samantha') ||
              v.name.includes('Daniel') ||
              v.name.includes('Alex') ||
              v.name.includes('Karen')),
        ) || voices.find((v) => v.lang.startsWith('en'));

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      window.speechSynthesis.speak(utterance);

      // Safety fallback: if utterance never fired onstart within 1s and isn't speaking
      setTimeout(() => {
        if (!hasStarted && !window.speechSynthesis.speaking) {
          cleanup();
        }
      }, 1000);
    };

    const availableVoices = window.speechSynthesis.getVoices();
    if (availableVoices.length > 0) {
      setVoiceAndSpeak();
    } else {
      // Voices not loaded yet, wait for voiceschanged or timeout
      let handled = false;
      const onVoices = () => {
        if (handled) return;
        handled = true;
        window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
        setVoiceAndSpeak();
      };
      window.speechSynthesis.addEventListener('voiceschanged', onVoices);
      setTimeout(() => {
        if (!handled) {
          handled = true;
          window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
          setVoiceAndSpeak();
        }
      }, 200);
    }
  } catch (err) {
    console.warn('[EchoOps] Browser speech synthesis error:', err);
    onEnd?.();
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
  const [isSpeaking, setIsSpeaking] = useState(false);
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
      setIsSpeaking(false);

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
              playAudibleSpeech(
                speechText,
                () => setIsSpeaking(true),
                () => setIsSpeaking(false),
              );
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
              playAudibleSpeech(
                fullSpeech.trim(),
                () => setIsSpeaking(true),
                () => setIsSpeaking(false),
              );
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
    setIsSpeaking(false);
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
    isSpeaking,
    latestMetrics,
    actionsExecuted,
    abortPendingSpeech,
  };
}