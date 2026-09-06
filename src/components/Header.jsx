'use client';

import React, { useState, useEffect } from 'react';
import { Radio, Mic, Users, Activity, ExternalLink } from 'lucide-react';
import { useIncidentContext } from '../context/IncidentContext';

export default function Header({ rightSlot } = {}) {
  const { warRoomId, respondersCount, incident } = useIncidentContext();
  const [elapsedSeconds, setElapsedSeconds] = useState(862); // 14m 22s initial

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSecs) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  return (
    <header className="dashboard-header">
      <div className="header-inner">
        {/* Brand & Subtitle */}
        <div className="header-brand">
          <div className="brand-icon-wrapper" title="EchoOps Voice AI Commander">
            <Radio size={22} strokeWidth={2.4} />
          </div>
          <div className="brand-titles">
            <div className="brand-name-row">
              <span className="brand-name">EchoOps</span>
              <span className="brand-version-badge">{warRoomId}</span>
            </div>
            <span className="brand-subtitle">{incident.commander || 'Voice AI Incident Commander'}</span>
          </div>
        </div>

        {/* Live Audio Status & Responders */}
        <div className="header-meta">
          {/* Live Waveform Indicator */}
          <div className="voice-channel-badge">
            <Mic size={14} className="text-indigo-600" />
            <span>Voice Synthesizer:</span>
            <div className="audio-waves-container" title="Transcribing voice audio stream in real-time">
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
            </div>
          </div>

          {/* Responders Count */}
          <div className="voice-channel-badge" title="Active responders on audio bridge">
            <Users size={14} />
            <span><strong>{respondersCount}</strong> Responders Connected</span>
          </div>

          {/* War Room Duration */}
          <div className="voice-channel-badge font-mono" title="Time elapsed since incident declaration">
            <Activity size={14} className="text-amber-500" />
            <span>Duration: <strong>{formatTimer(elapsedSeconds)}</strong></span>
          </div>

          {/* Join War Room in New Tab */}
          <a
            href={`/room/${encodeURIComponent(incident?.channel || 'echoops-war-room-042')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="header-war-room-btn"
            id="header-open-war-room"
            title="Open Dedicated Voice War Room in a New Tab"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 13px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: '#ffffff',
              borderRadius: '8px',
              fontSize: '0.75rem',
              fontWeight: 700,
              textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
              transition: 'all 0.2s ease',
            }}
          >
            <Radio size={13} />
            <span>Join Voice Room</span>
            <ExternalLink size={12} style={{ opacity: 0.8 }} />
          </a>

          {rightSlot}
        </div>
      </div>
    </header>
  );
}
