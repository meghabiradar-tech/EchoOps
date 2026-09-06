'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Volume2, Mic, MicOff, Bot, Send, Sparkles, VolumeX, Radio } from 'lucide-react';
import { useIncidentContext } from '../context/IncidentContext';
import { playAudibleSpeech, stopAudibleSpeech } from '@/hooks/useAiSpeechHandler';

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
    s.includes('user')
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

  useEffect(() => {
    if (audioMuted) {
      stopAudibleSpeech();
      setIsBotSpeaking(false);
    }
  }, [audioMuted]);

  const filteredTranscripts = useMemo(() => {
    if (filterRole === 'ALL') return transcripts;
    if (filterRole === 'AI') {
      return transcripts.filter((t) => !isUserSpeaker(t.speaker) && !(t.speaker || '').toLowerCase().includes('alert'));
    }
    if (filterRole === 'ENGINEER') {
      return transcripts.filter((t) => isUserSpeaker(t.speaker));
    }
    if (filterRole === 'SYSTEM') {
      return transcripts.filter((t) => (t.speaker || '').toLowerCase().includes('alert') || (t.text || '').toLowerCase().includes('p99') || (t.text || '').toLowerCase().includes('rollback') || (t.text || '').toLowerCase().includes('cpu'));
    }
    return transcripts;
  }, [transcripts, filterRole]);

  const counts = useMemo(() => {
    return {
      all: transcripts.length,
      ai: transcripts.filter((t) => !isUserSpeaker(t.speaker) && !(t.speaker || '').toLowerCase().includes('alert')).length,
      engineers: transcripts.filter((t) => isUserSpeaker(t.speaker)).length,
      system: transcripts.filter((t) => (t.speaker || '').toLowerCase().includes('alert') || (t.text || '').toLowerCase().includes('p99') || (t.text || '').toLowerCase().includes('rollback') || (t.text || '').toLowerCase().includes('cpu')).length,
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
              role: t.speaker.includes('You') ? 'user' : 'assistant',
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
        if (speech && !audioMuted) {
          playAudibleSpeech(
            speech,
            () => setIsBotSpeaking(true),
            () => setIsBotSpeaking(false),
          );
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
      alert('Speech Recognition is not supported in this browser. Please use Chrome, Safari, or Edge, or use the command input bar below.');
      return;
    }

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            final += res[0].transcript;
          } else {
            interim += res[0].transcript;
          }
        }

        if (interim) {
          setInterimText(interim);
        }

        if (final.trim()) {
          const captured = final.trim();
          setInterimText('');
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          submitUtterance(captured);
        } else if (interim.trim()) {
          // Pause-based detection
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            const captured = interim.trim();
            if (captured) {
              setInterimText('');
              submitUtterance(captured);
            }
          }, 1400);
        }
      };

      recognition.onerror = (event) => {
        console.warn('[EchoOps] SpeechRecognition note:', event?.error);
        if (event.error === 'not-allowed') {
          alert('Microphone access was blocked. Please enable microphone permissions in your browser settings.');
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.error('[EchoOps] SpeechRecognition init failed:', err);
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
      'EchoOps AI Incident Commander audio bridge active. Real-time speech synthesis and dashboard telemetry online.';
    playAudibleSpeech(testPhrase);
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
    <div className="card" aria-label="Voice AI Live Audio Stream">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <div className="card-title-group">
          <div
            className="card-icon-badge"
            style={{
              background: isBotSpeaking ? '#f5d0fe' : '#ede9fe',
              color: isBotSpeaking ? '#c026d3' : '#7c3aed',
              transition: 'all 0.2s ease',
            }}
          >
            <Volume2 size={18} />
          </div>
          <div>
            <h2 className="card-title">Live Audio Stream Synthesis</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  color: isBotSpeaking ? '#c026d3' : '#6d28d9',
                }}
              >
                {isBotSpeaking ? 'AI Commander Speaking Out Loud...' : isListening ? 'Listening to Mic...' : 'Voice AI Engine Online'}
              </span>
              {isBotSpeaking && (
                <span className="pulse-dot" style={{ background: '#c026d3', width: '6px', height: '6px' }} />
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setAudioMuted((prev) => !prev)}
            title={audioMuted ? 'Unmute voice synthesis' : 'Mute voice synthesis'}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid #e2e8f0',
              background: audioMuted ? '#fee2e2' : '#f8fafc',
              color: audioMuted ? '#b91c1c' : '#475569',
              fontSize: '0.72rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {audioMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
            <span>{audioMuted ? 'Muted' : 'Sound On'}</span>
          </button>

          <button
            onClick={handleTestVoiceAudio}
            title="Play sample AI Commander voice audio test"
            style={{
              padding: '4px 9px',
              borderRadius: '6px',
              border: '1px solid #c7d2fe',
              background: '#eef2ff',
              color: '#4f46e5',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Radio size={12} />
            <span>Test Audio</span>
          </button>

          <span
            className="card-badge-count"
            style={{ background: '#ede9fe', color: '#6d28d9', borderColor: '#ddd6fe' }}
            id="transcript-stream-count"
          >
            {transcripts.length} Turns
          </span>
        </div>
      </div>

      <div className="card-body" style={{ padding: '0.85rem 1.15rem' }}>
        {/* Live Microphone Call-to-Action Bar */}
        <div
          style={{
            marginBottom: '0.85rem',
            padding: '0.75rem',
            background: isListening
              ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
              : '#f8fafc',
            border: isListening ? '1px solid #93c5fd' : '1px solid #e2e8f0',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1 }}>
            <button
              onClick={toggleListening}
              id="dashboard-mic-toggle"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.78rem',
                cursor: 'pointer',
                background: isListening
                  ? '#ef4444'
                  : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                color: '#ffffff',
                boxShadow: isListening
                  ? '0 0 12px rgba(239, 68, 68, 0.4)'
                  : '0 2px 8px rgba(79, 70, 229, 0.25)',
                transition: 'all 0.2s ease',
              }}
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

            <div style={{ fontSize: '0.74rem', color: '#475569' }}>
              {isListening ? (
                <span style={{ fontWeight: 600, color: '#1d4ed8' }}>
                  🎙️ Speak into microphone... pausing 1s dispatches command
                </span>
              ) : (
                <span>Click to speak war room commands out loud</span>
              )}
            </div>
          </div>

          {isProcessing && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.72rem',
                color: '#7c3aed',
                fontWeight: 600,
              }}
            >
              <Sparkles size={13} className="animate-spin" />
              <span>Synthesizing...</span>
            </div>
          )}
        </div>

        {/* Live Interim Speech Preview when user is talking */}
        {interimText && (
          <div
            style={{
              padding: '0.5rem 0.75rem',
              marginBottom: '0.75rem',
              background: '#eff6ff',
              border: '1px dashed #60a5fa',
              borderRadius: '8px',
              fontSize: '0.78rem',
              color: '#1e40af',
              fontStyle: 'italic',
            }}
          >
            <strong>Heard:</strong> &ldquo;{interimText}&rdquo;...
          </div>
        )}

        {/* Quick-Filter Chips Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '0.65rem',
            overflowX: 'auto',
            paddingBottom: '2px',
          }}
          aria-label="Filter transcript by speaker"
        >
          <button
            type="button"
            onClick={() => setFilterRole('ALL')}
            style={{
              padding: '3px 9px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: filterRole === 'ALL' ? '1px solid #4f46e5' : '1px solid #e2e8f0',
              background: filterRole === 'ALL' ? '#4f46e5' : '#f8fafc',
              color: filterRole === 'ALL' ? '#ffffff' : '#64748b',
              transition: 'all 0.15s ease',
            }}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setFilterRole('AI')}
            style={{
              padding: '3px 9px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: filterRole === 'AI' ? '1px solid #7c3aed' : '1px solid #e2e8f0',
              background: filterRole === 'AI' ? '#7c3aed' : '#f8fafc',
              color: filterRole === 'AI' ? '#ffffff' : '#64748b',
              transition: 'all 0.15s ease',
            }}
          >
            AI Commander ({counts.ai})
          </button>
          <button
            type="button"
            onClick={() => setFilterRole('ENGINEER')}
            style={{
              padding: '3px 9px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: filterRole === 'ENGINEER' ? '1px solid #2563eb' : '1px solid #e2e8f0',
              background: filterRole === 'ENGINEER' ? '#2563eb' : '#f8fafc',
              color: filterRole === 'ENGINEER' ? '#ffffff' : '#64748b',
              transition: 'all 0.15s ease',
            }}
          >
            Engineers ({counts.engineers})
          </button>
          <button
            type="button"
            onClick={() => setFilterRole('SYSTEM')}
            style={{
              padding: '3px 9px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: filterRole === 'SYSTEM' ? '1px solid #d97706' : '1px solid #e2e8f0',
              background: filterRole === 'SYSTEM' ? '#d97706' : '#f8fafc',
              color: filterRole === 'SYSTEM' ? '#ffffff' : '#64748b',
              transition: 'all 0.15s ease',
            }}
          >
            System Alerts ({counts.system})
          </button>
        </div>

        {/* Audio Turns Scroll Area */}
        <div
          className="voice-transcript-card"
          ref={scrollRef}
          style={{ maxHeight: '280px', overflowY: 'auto' }}
          id="voice-transcript-container"
        >
          {filteredTranscripts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8', fontSize: '0.85rem' }}>
              {transcripts.length === 0
                ? 'Awaiting audio input on voice bridge...'
                : `No turns found for "${filterRole}".`}
            </div>
          ) : (
            filteredTranscripts.map((t, idx) => {
              const isUser = isUserSpeaker(t.speaker);
              return (
                <div
                  key={idx}
                  className="voice-stream-item"
                  style={{
                    borderLeft: isUser ? '3px solid #3b82f6' : '3px solid #7c3aed',
                    paddingLeft: '8px',
                    marginBottom: '0.65rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '0.15rem',
                    }}
                  >
                    <span
                      className="voice-speaker-badge"
                      style={{
                        background: isUser ? '#eff6ff' : '#f5f3ff',
                        color: isUser ? '#1d4ed8' : '#6d28d9',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {isUser ? <Mic size={11} /> : <Bot size={11} />}
                      {t.speaker}
                    </span>
                    <span className="font-mono text-dim" style={{ fontSize: '0.68rem' }}>
                      {t.time}
                    </span>
                  </div>
                  <p style={{ color: '#1e293b', fontSize: '0.825rem', lineHeight: '1.4' }}>
                    &ldquo;{t.text}&rdquo;
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Quick Incident Simulation Preset Chips */}
        <div style={{ marginTop: '0.85rem', marginBottom: '0.65rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '0.35rem' }}>
            QUICK VOICE COMMAND TRIGGERS (Updates Cards & Speaks Out Loud):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {PRESET_COMMANDS.map((cmd, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => submitUtterance(cmd.text)}
                disabled={isProcessing}
                style={{
                  fontSize: '0.7rem',
                  padding: '4px 8px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  color: '#334155',
                  cursor: isProcessing ? 'wait' : 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                  textAlign: 'left',
                }}
              >
                {cmd.label}
              </button>
            ))}
          </div>
        </div>

        {/* Type-To-Speak Input Bar */}
        <form onSubmit={handleFormSubmit} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <input
            type="text"
            value={inputCommand}
            onChange={(e) => setInputCommand(e.target.value)}
            placeholder="Type incident utterance or command (e.g. 'Rollback to v2.4.0')..."
            disabled={isProcessing}
            style={{
              flex: 1,
              padding: '7px 12px',
              fontSize: '0.8rem',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              outline: 'none',
              background: '#ffffff',
              color: '#0f172a',
            }}
          />
          <button
            type="submit"
            disabled={isProcessing || !inputCommand.trim()}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: 'none',
              background: '#4f46e5',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: isProcessing || !inputCommand.trim() ? 'not-allowed' : 'pointer',
              opacity: isProcessing || !inputCommand.trim() ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Send size={13} />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
