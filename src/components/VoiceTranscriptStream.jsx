'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Volume2,
  Mic,
  MicOff,
  Bot,
  User,
  Send,
  Sparkles,
  VolumeX,
  Radio,
  Shield,
  Filter,
  AlertTriangle,
} from 'lucide-react';
import { useIncidentContext } from '../context/IncidentContext';
import { voiceArbiter } from '@/lib/voiceArbiter';

const PRESET_COMMANDS = [
  {
    label: '🔴 Rollback to v2.4.0 (Exhaustion)',
    text: 'Database connection pool is exhausted on postgres-primary. We need to rollback to v2.4.0 immediately.',
  },
  {
    label: '⚠️ 504 Latency Spike (78% Error)',
    text: 'Latency spiked over 3500 milliseconds and checkout failure rate is hitting 78 percent with 504 gateway timeouts.',
  },
  {
    label: '🛡️ Pod Reboot (k8s-prod-useast1)',
    text: 'Payment worker pods are hanging on deadlocks. Prepare rolling restart on k8s-prod-useast1.',
  },
  {
    label: '✅ Mitigate & Clear Incident',
    text: 'Checkout success rate has recovered to 99.8 percent. Latency is normal. Mark incident as resolved.',
  },
];

function isUserSpeaker(speaker) {
  const s = (speaker || '').toLowerCase();
  return (
    s.includes('operator') ||
    s.includes('you') ||
    s.includes('human') ||
    s.includes('user') ||
    s.includes('responder')
  );
}

export default function VoiceTranscriptStream(props) {
  const context = useIncidentContext();
  const rawTranscripts = props?.transcripts || context?.transcripts;
  const transcripts = useMemo(() => rawTranscripts || [], [rawTranscripts]);
  const scrollRef = useRef(null);

  const [inputCommand, setInputCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [filterRole, setFilterRole] = useState('ALL');

  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const processingRef = useRef(false);

  // Synchronize speech state with VoiceArbiter
  useEffect(() => {
    return voiceArbiter.addListener((speaking) => {
      setIsBotSpeaking(speaking);
    });
  }, []);

  useEffect(() => {
    if (audioMuted) {
      voiceArbiter.stop();
      setIsBotSpeaking(false);
    }
  }, [audioMuted]);

  const filteredTranscripts = useMemo(() => {
    if (filterRole === 'ALL') return transcripts;
    if (filterRole === 'AI') {
      return transcripts.filter(
        (t) => !isUserSpeaker(t.speaker) && !(t.speaker || '').toLowerCase().includes('alert'),
      );
    }
    if (filterRole === 'ENGINEER') {
      return transcripts.filter((t) => isUserSpeaker(t.speaker));
    }
    if (filterRole === 'SYSTEM') {
      return transcripts.filter(
        (t) =>
          (t.speaker || '').toLowerCase().includes('alert') ||
          (t.text || '').toLowerCase().includes('p99') ||
          (t.text || '').toLowerCase().includes('rollback') ||
          (t.text || '').toLowerCase().includes('cpu') ||
          (t.text || '').toLowerCase().includes('database'),
      );
    }
    return transcripts;
  }, [transcripts, filterRole]);

  const counts = useMemo(() => {
    return {
      all: transcripts.length,
      ai: transcripts.filter(
        (t) => !isUserSpeaker(t.speaker) && !(t.speaker || '').toLowerCase().includes('alert'),
      ).length,
      engineers: transcripts.filter((t) => isUserSpeaker(t.speaker)).length,
      system: transcripts.filter(
        (t) =>
          (t.speaker || '').toLowerCase().includes('alert') ||
          (t.text || '').toLowerCase().includes('p99') ||
          (t.text || '').toLowerCase().includes('rollback') ||
          (t.text || '').toLowerCase().includes('cpu') ||
          (t.text || '').toLowerCase().includes('database'),
      ).length,
    };
  }, [transcripts]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredTranscripts.length, interimText]);

  // Submit utterance to Voice AI Copilot
  const submitUtterance = useCallback(
    async (textToSubmit) => {
      const cleanText = (textToSubmit || '').trim();
      if (!cleanText || processingRef.current) return;

      // Immediately halt any current speech before processing new user turn
      voiceArbiter.stop();

      processingRef.current = true;
      setIsProcessing(true);
      setInterimText('');

      // 1. Add Operator turn to transcript stream
      if (context?.addTranscript) {
        context.addTranscript({
          speaker: 'You (Human Operator)',
          text: cleanText,
        });
      }

      try {
        const res = await fetch('/api/ai/respond', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            transcript: cleanText,
            channelName: context?.channelName || 'echoops-war-room-042',
            serviceName: context?.incident?.service,
            region: context?.incident?.environment,
            history: (transcripts || []).slice(-4).map((t) => ({
              role: isUserSpeaker(t.speaker) ? 'user' : 'assistant',
              content: t.text,
            })),
          }),
        });

        if (!res.ok) {
          throw new Error(`AI copilot error HTTP ${res.status}`);
        }

        const data = await res.json();
        const speech = data?.speech?.trim() || '';

        // 2. Immediately merge structured state delta into dashboard cards
        if (data?.stateDelta && context?.applyStateDelta) {
          context.applyStateDelta(data.stateDelta);
        }

        // 3. Add bot speech to transcript stream
        if (speech && context?.addTranscript) {
          context.addTranscript({
            speaker: 'EchoOps AI Commander',
            text: speech,
          });
        }

        // 4. Speak response OUT LOUD via browser speech synthesis
        // Single-voice guarantee: voiceArbiter suppresses speech if Agora SD-RTN is active
        if (speech && !audioMuted) {
          voiceArbiter.speak(speech, {
            onStart: () => setIsBotSpeaking(true),
            onEnd: () => setIsBotSpeaking(false),
          });
        }
      } catch (err) {
        console.error('[EchoOps] Failed to process voice command:', err);
      } finally {
        processingRef.current = false;
        setIsProcessing(false);
      }
    },
    [audioMuted, context, transcripts],
  );

  // Setup Web Speech Recognition
  const startListening = useCallback(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        'Speech Recognition is not supported in this browser. Please use Chrome, Safari, or Edge, or use the command input bar below.',
      );
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }

      // Stop any active bot speech when user begins listening
      voiceArbiter.stop();

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setInterimText('');
      };

      recognition.onresult = (event) => {
        let interim = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          } else {
            interim += item[0].transcript;
          }
        }

        if (interim) {
          setInterimText(interim);
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            if (interim.trim().length > 3) {
              submitUtterance(interim.trim());
              setInterimText('');
            }
          }, 1200);
        }

        if (finalTranscript.trim()) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          submitUtterance(finalTranscript.trim());
          setInterimText('');
        }
      };

      recognition.onerror = (e) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn('[EchoOps] Speech recognition notice:', e.error);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('[EchoOps] Could not initialize SpeechRecognition:', err);
      setIsListening(false);
    }
  }, [submitUtterance]);

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText('');
  }, []);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleTestVoiceAudio = () => {
    const testPhrase =
      'EchoOps AI Incident Commander audio bridge active. Real-time telemetry online.';
    voiceArbiter.speak(testPhrase, {
      onStart: () => setIsBotSpeaking(true),
      onEnd: () => setIsBotSpeaking(false),
      force: true,
    });
    if (context?.addTranscript) {
      context.addTranscript({
        speaker: 'EchoOps AI Commander',
        text: testPhrase,
      });
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!inputCommand.trim() || isProcessing) return;
    const cmd = inputCommand.trim();
    setInputCommand('');
    submitUtterance(cmd);
  };

  return (
    <div
      className="rounded-xl border border-[#1e293b] bg-[#0d1322] shadow-xl overflow-hidden"
      aria-label="Voice AI Live Audio Stream"
    >
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e293b] bg-[#0b101c] px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
              isBotSpeaking
                ? 'bg-fuchsia-950/60 border-fuchsia-500/50 text-fuchsia-400 shadow-[0_0_12px_rgba(217,70,239,0.4)]'
                : 'bg-indigo-950/60 border-indigo-500/30 text-indigo-400'
            }`}
          >
            <Volume2 size={16} className={isBotSpeaking ? 'animate-bounce' : ''} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 font-mono">
                Live Voice AI Stream
              </h2>
              <span
                className={`h-2 w-2 rounded-full ${
                  isBotSpeaking
                    ? 'bg-fuchsia-400 animate-ping'
                    : isListening
                    ? 'bg-red-400 animate-pulse'
                    : 'bg-emerald-400'
                }`}
              />
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-medium">
              <span className={isBotSpeaking ? 'text-fuchsia-400' : isListening ? 'text-blue-400' : 'text-slate-400'}>
                {isBotSpeaking
                  ? 'AI Commander Speaking Out Loud...'
                  : isListening
                  ? 'Listening to Microphone...'
                  : 'Voice AI Bridge Online'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mute Toggle */}
          <button
            type="button"
            onClick={() => setAudioMuted((prev) => !prev)}
            title={audioMuted ? 'Unmute voice synthesis' : 'Mute voice synthesis'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all ${
              audioMuted
                ? 'bg-red-950/60 border-red-800/60 text-red-300 hover:bg-red-900/60'
                : 'bg-[#151d30] border-[#1e293b] text-slate-300 hover:text-white hover:border-slate-700'
            }`}
          >
            {audioMuted ? <VolumeX size={13} className="text-red-400" /> : <Volume2 size={13} className="text-indigo-400" />}
            <span>{audioMuted ? 'Muted' : 'Audio On'}</span>
          </button>

          {/* Test Audio Button */}
          <button
            type="button"
            onClick={handleTestVoiceAudio}
            title="Play sample AI Commander voice test"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border border-indigo-500/30 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/60 hover:text-white transition-all"
          >
            <Radio size={12} />
            <span>Test Audio</span>
          </button>

          {/* Turns Badge */}
          <span className="rounded-md border border-[#1e293b] bg-[#151d30] px-2.5 py-1 text-[11px] font-mono font-semibold text-slate-300">
            {transcripts.length} Turns
          </span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Live Microphone Call-to-Action Bar */}
        <div
          className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
            isListening
              ? 'bg-[#1c131a] border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
              : 'bg-[#131b2e] border-[#1e293b]'
          }`}
        >
          <div className="flex items-center gap-3 flex-1">
            <button
              type="button"
              onClick={toggleListening}
              id="dashboard-mic-toggle"
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white transition-all ${
                isListening
                  ? 'bg-red-600 hover:bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-md'
              }`}
            >
              {isListening ? (
                <>
                  <MicOff size={14} className="animate-pulse" />
                  <span>Stop Listening</span>
                </>
              ) : (
                <>
                  <Mic size={14} />
                  <span>Start Live Voice AI</span>
                </>
              )}
            </button>

            <div className="text-xs text-slate-300">
              {isListening ? (
                <span className="font-semibold text-red-400">
                  🎙️ Listening... pause 1s or click Stop to send command
                </span>
              ) : (
                <span className="text-slate-400">Click to speak commands out loud</span>
              )}
            </div>
          </div>

          {isProcessing && (
            <div className="flex items-center gap-1.5 text-xs text-purple-400 font-semibold">
              <Sparkles size={14} className="animate-spin" />
              <span>Synthesizing...</span>
            </div>
          )}
        </div>

        {/* Live Interim Speech Preview */}
        {interimText && (
          <div className="p-2.5 rounded-lg bg-indigo-950/40 border border-dashed border-indigo-500/50 text-xs text-indigo-200 italic">
            <strong>Heard:</strong> &ldquo;{interimText}&rdquo;...
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setFilterRole('ALL')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
              filterRole === 'ALL'
                ? 'bg-indigo-600 border-indigo-400 text-white font-semibold shadow-sm'
                : 'bg-[#151d30] border-[#1e293b] text-slate-400 hover:text-white'
            }`}
          >
            <Filter size={10} />
            <span>All ({counts.all})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterRole('AI')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
              filterRole === 'AI'
                ? 'bg-purple-600 border-purple-400 text-white font-semibold shadow-sm'
                : 'bg-[#151d30] border-[#1e293b] text-slate-400 hover:text-purple-300'
            }`}
          >
            <Bot size={10} />
            <span>AI Commander ({counts.ai})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterRole('ENGINEER')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
              filterRole === 'ENGINEER'
                ? 'bg-blue-600 border-blue-400 text-white font-semibold shadow-sm'
                : 'bg-[#151d30] border-[#1e293b] text-slate-400 hover:text-blue-300'
            }`}
          >
            <User size={10} />
            <span>Engineers ({counts.engineers})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterRole('SYSTEM')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
              filterRole === 'SYSTEM'
                ? 'bg-amber-600 border-amber-400 text-white font-semibold shadow-sm'
                : 'bg-[#151d30] border-[#1e293b] text-slate-400 hover:text-amber-300'
            }`}
          >
            <AlertTriangle size={10} />
            <span>System Alerts ({counts.system})</span>
          </button>
        </div>

        {/* Audio Turns Scroll Area */}
        <div
          ref={scrollRef}
          className="max-h-[300px] overflow-y-auto space-y-2.5 p-3 rounded-xl border border-[#1e293b] bg-[#090d16]"
          id="voice-transcript-container"
        >
          {filteredTranscripts.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              {transcripts.length === 0
                ? 'Awaiting audio input on voice bridge...'
                : `No turns found for "${filterRole}".`}
            </div>
          ) : (
            filteredTranscripts.map((t, idx) => {
              const isUser = isUserSpeaker(t.speaker);
              const isSystem =
                (t.speaker || '').toLowerCase().includes('alert') ||
                (t.text || '').toLowerCase().includes('database') ||
                (t.text || '').toLowerCase().includes('p99');

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border transition-all ${
                    isUser
                      ? 'border-blue-500/30 bg-[#0b162c]'
                      : isSystem
                      ? 'border-amber-500/30 bg-[#161210]'
                      : 'border-purple-500/30 bg-[#0f1426]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-bold font-mono ${
                        isUser
                          ? 'text-blue-400'
                          : isSystem
                          ? 'text-amber-400'
                          : 'text-purple-400'
                      }`}
                    >
                      {isUser ? <User size={12} /> : isSystem ? <Shield size={12} /> : <Bot size={12} />}
                      {t.speaker}
                    </span>
                    {t.time && <span className="text-[10px] font-mono text-slate-500">{t.time}</span>}
                  </div>
                  <p
                    className={`text-[12.5px] leading-relaxed ${
                      isUser ? 'text-slate-200' : isSystem ? 'text-amber-100' : 'text-slate-100'
                    }`}
                  >
                    &ldquo;{t.text}&rdquo;
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Quick Incident Simulation Preset Chips */}
        <div className="pt-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 font-mono">
            QUICK VOICE COMMAND TRIGGERS:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_COMMANDS.map((cmd, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => submitUtterance(cmd.text)}
                disabled={isProcessing}
                className="text-[11px] px-2.5 py-1 rounded-md bg-[#151d30] border border-[#1e293b] text-slate-300 hover:text-white hover:border-indigo-500/50 hover:bg-[#1a2540] transition-all disabled:opacity-50 text-left font-medium"
              >
                {cmd.label}
              </button>
            ))}
          </div>
        </div>

        {/* Type-To-Speak Input Bar */}
        <form onSubmit={handleFormSubmit} className="flex gap-2 pt-1">
          <input
            type="text"
            value={inputCommand}
            onChange={(e) => setInputCommand(e.target.value)}
            placeholder="Type incident utterance or command (e.g. 'Rollback to v2.4.0')..."
            disabled={isProcessing}
            className="flex-1 px-3 py-2 text-xs rounded-lg border border-[#1e293b] bg-[#151d30] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
          <button
            type="submit"
            disabled={isProcessing || !inputCommand.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            <Send size={13} />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
