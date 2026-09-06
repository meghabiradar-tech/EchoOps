'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/src/components/Header';
import ActiveIncidentCard from '@/src/components/ActiveIncidentCard';
import IncidentTimeline from '@/src/components/IncidentTimeline';
import FactsCard from '@/src/components/FactsCard';
import AssumptionsCard from '@/src/components/AssumptionsCard';
import ActionOwnership from '@/src/components/ActionOwnership';
import AlertsSection from '@/src/components/AlertsSection';
import HumanInTheLoop from '@/src/components/HumanInTheLoop';
import VoiceTranscriptStream from '@/src/components/VoiceTranscriptStream';
import { mockIncidentData } from '@/src/data/mockData';
import { Mic, MicOff, PhoneCall, Volume2, ShieldAlert, Sparkles, Radio, Key, CheckCircle, AlertTriangle } from 'lucide-react';

export default function Home() {
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [liveIncident, setLiveIncident] = useState(mockIncidentData.incident);
  const [liveTimeline, setLiveTimeline] = useState(mockIncidentData.timeline);
  const [liveFacts, setLiveFacts] = useState(mockIncidentData.facts);
  const [liveAssumptions, setLiveAssumptions] = useState(mockIncidentData.assumptions);
  const [liveActions, setLiveActions] = useState(mockIncidentData.actions);
  const [liveAlerts, setLiveAlerts] = useState(mockIncidentData.alerts);
  const [liveHitl, setLiveHitl] = useState(mockIncidentData.humanInTheLoop);
  const [voiceTranscripts, setVoiceTranscripts] = useState(mockIncidentData.voiceStreamMock);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [agoraAppId, setAgoraAppId] = useState('');
  const [agoraCert, setAgoraCert] = useState('');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Subscribe to real-time backend events via SSE (/api/events)
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events?channel=echoops-war-room');
      eventSource.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.event === 'state.update' && payload.data) {
            const inc = payload.data;
            if (inc.title) {
              setLiveIncident((prev: any) => ({
                ...prev,
                title: inc.title,
                severity: inc.severity,
                status: inc.status,
              }));
            }
            if (inc.facts && inc.facts.length > 0) {
              setLiveFacts(
                inc.facts.map((f: any, i: number) => ({
                  id: f.id || `f-${i}`,
                  fact: f.fact || f.statement || f.text,
                  timestamp: f.timestamp || f.time || '10:33 AM',
                  verifiedBy: f.verifiedBy || 'Postgres APM / Sarah J.',
                  confidence: 'Confirmed',
                })),
              );
            }
            if (inc.timeline && inc.timeline.length > 0) {
              setLiveTimeline(
                inc.timeline.map((t: any, i: number) => ({
                  id: t.id || `t-${i}`,
                  time: t.time || '10:31 AM',
                  title: t.title || t.note || 'System Event',
                  description: t.description || t.note || 'Event details registered on voice bridge.',
                  source: t.source || t.speaker || 'EchoOps AI',
                  type: t.type || (t.category === 'action' ? 'action' : t.category === 'error' ? 'error' : 'system'),
                  badge: t.badge || 'EVENT',
                })),
              );
            }
          }
        } catch {
          // Ignore parse error
        }
      };
    } catch {
      // EventSource fallback
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  const toggleVoiceSession = () => {
    if (!isVoiceActive) {
      setIsVoiceActive(true);
      setStatusBanner('🟢 EchoOps Voice AI is active and monitoring audio on channel "incident-war-room".');
      
      // Simulate live AI voice response if browser supports speech
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance("EchoOps Incident Commander connected. I am monitoring the voice room and tracking verified incident state.");
          utterance.rate = 1.05;
          utterance.pitch = 1.0;
          window.speechSynthesis.speak(utterance);
        } catch {
          // Speech synthesis fallback
        }
      }
    } else {
      setIsVoiceActive(false);
      setStatusBanner(null);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  };

  const handleSimulateTurn = async (text: string, speaker = 'Lead SRE') => {
    try {
      const res = await fetch('/api/ai/analyze-incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelName: 'echoops-war-room',
          speakerName: speaker,
          transcript: text,
        }),
      });
      const data = await res.json();
      if (data.incident) {
        setLiveIncident((prev: any) => ({
          ...prev,
          title: data.incident.title,
          severity: data.incident.severity,
          status: data.incident.status,
        }));
      }

      setVoiceTranscripts((prev: any) => [
        {
          id: `vt-${Date.now()}`,
          speaker,
          role: 'Responder',
          time: 'Just now',
          text,
          verified: true,
        },
        ...prev,
      ]);
    } catch (err) {
      console.warn('Turn analysis dispatch error:', err);
    }
  };

  return (
    <div className="app-layout" style={{ background: '#f8fafc', minHeight: '100vh', color: '#0f172a' }}>
      {/* 1. HEADER with EchoOps, Voice AI Commander, and LIVE status */}
      <Header />

      {/* Voice Room Live Control Bar */}
      <div style={{ background: 'linear-gradient(90deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)', color: '#ffffff', padding: '0.875rem 2rem', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.1)', padding: '0.35rem 0.75rem', borderRadius: '20px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isVoiceActive ? '#22c55e' : '#94a3b8', animation: isVoiceActive ? 'pulse 1.5s infinite' : 'none' }}></div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                {isVoiceActive ? 'Voice Bridge Connected' : 'Voice Bridge Standby'}
              </span>
            </div>
            <span style={{ fontSize: '0.875rem', color: '#c7d2fe' }}>
              Room: <strong style={{ color: '#fff' }}>incident-war-room</strong> • Agora Voice AI: <strong style={{ color: '#86efac' }}>EchoOps</strong>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {isVoiceActive && (
              <button
                onClick={() => setIsMuted(!isMuted)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: isMuted ? '#ef4444' : 'rgba(255,255,255,0.15)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.45rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
                {isMuted ? 'Muted' : 'Mute Mic'}
              </button>
            )}

            <button
              onClick={toggleVoiceSession}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: isVoiceActive ? '#ef4444' : '#4f46e5',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '0.5rem 1.25rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: isVoiceActive ? '0 0 15px rgba(239, 68, 68, 0.4)' : '0 0 15px rgba(79, 70, 229, 0.4)',
                transition: 'all 0.2s',
              }}
            >
              {isVoiceActive ? <PhoneCall size={16} /> : <Mic size={16} />}
              {isVoiceActive ? 'Leave Voice Room' : 'Join Voice Room'}
            </button>

            <button
              onClick={() => handleSimulateTurn('Confirmed water level reached 2.3 meters near Sector 7 drainage.')}
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '6px',
                padding: '0.5rem 0.85rem',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
              title="Simulate speech from responders into EchoOps"
            >
              <Sparkles size={14} style={{ display: 'inline', marginRight: '4px' }} />
              Test Speech Ingestion
            </button>
          </div>
        </div>
      </div>

      {statusBanner && (
        <div style={{ background: '#ecfdf5', borderBottom: '1px solid #a7f3d0', padding: '0.5rem 2rem', color: '#065f46', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle size={16} />
          <span>{statusBanner}</span>
        </div>
      )}

      {/* Main Dashboard Container */}
      <main className="dashboard-container">
        {/* 2. ACTIVE INCIDENT HERO: Payment Service Outage, HIGH severity, ACTIVE status */}
        <ActiveIncidentCard incident={liveIncident} />

        {/* 2-Column Responsive Dashboard Layout */}
        <div className="dashboard-grid">
          {/* Left Column: Investigation, Timeline & Actions */}
          <div className="grid-col">
            {/* 3. INCIDENT TIMELINE: Chronological events with timestamps */}
            <IncidentTimeline timeline={liveTimeline} />

            {/* 6. ACTION & OWNERSHIP: PENDING, IN PROGRESS, COMPLETED */}
            <ActionOwnership initialActions={liveActions} />

            {/* 8. HUMAN-IN-THE-LOOP: Critical action requiring approval */}
            <HumanInTheLoop hitlData={liveHitl} />
          </div>

          {/* Right Column: Intelligence, Alerts, Facts & Assumptions */}
          <div className="grid-col">
            {/* 7. ALERTS: Separate Conflict, Gap, and Risk alerts */}
            <AlertsSection alerts={liveAlerts} />

            {/* 4. FACTS: Confirmed information */}
            <FactsCard facts={liveFacts} />

            {/* 5. ASSUMPTIONS: Unconfirmed information clearly labeled */}
            <AssumptionsCard assumptions={liveAssumptions} />

            {/* VOICE AI REAL-TIME SYNTHESIS STREAM */}
            <VoiceTranscriptStream transcripts={voiceTranscripts} />
          </div>
        </div>
      </main>
    </div>
  );
}
