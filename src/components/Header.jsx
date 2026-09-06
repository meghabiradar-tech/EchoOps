'use client';

import React, { useState, useEffect } from 'react';
import {
  Radio,
  Users,
  Clock,
  Layers,
  LayoutDashboard,
  Terminal,
  Columns2,
  ExternalLink,
  PhoneOff,
  Bot,
} from 'lucide-react';
import { useIncidentContext } from '../context/IncidentContext';

export default function Header({
  viewMode = 'dashboard',
  onSelectViewMode,
  showConversation = false,
  onEndConversation,
  isStopping = false,
  channelName: propChannelName,
  rightSlot,
} = {}) {
  const context = useIncidentContext();
  const incident = context?.incident || {};
  const respondersCount = context?.respondersCount || 4;
  const channelName =
    propChannelName || incident?.channelName || incident?.channel || 'echoops-war-room-042';

  const [elapsedSeconds, setElapsedSeconds] = useState(876); // 14m 36s initial

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
    <header className="dashboard-header" role="banner">
      <div className="header-inner">
        {/* ========================================================
            1. LEFT ZONE: Identity & Incident Scope
            ======================================================== */}
        <div className="header-zone-left">
          <div className="header-brand-group">
            <div className="brand-icon-wrapper" title="EchoOps Autonomous Voice SRE">
              <Radio size={20} strokeWidth={2.4} />
            </div>
            <div className="brand-text-col">
              <div className="brand-title-row">
                <span className="brand-name">EchoOps</span>
                <span className="brand-ai-badge" title="AI Incident Commander Active">
                  <Bot size={11} />
                  <span>AI Commander</span>
                </span>
              </div>
              <span className="brand-subtitle">
                {incident?.commander || 'Autonomous SRE Voice Bridge'}
              </span>
            </div>
          </div>

          {/* Current War Room Channel Pill */}
          <div
            className="header-channel-pill"
            title={`Current War Room Channel: #${channelName}`}
            id="header-channel-scope"
          >
            <span className="header-channel-hash">#</span>
            <span className="header-channel-name">{channelName}</span>
          </div>
        </div>

        {/* ========================================================
            2. CENTER ZONE: Operational Telemetry
            ======================================================== */}
        <div className="header-zone-center">
          <div className="telemetry-pill-container" title="Operational Telemetry & Audio Engine">
            {/* Connection pulse & Responders */}
            <div className="telemetry-item" title="Active responders currently on the bridge">
              <span className="pulse-green-dot" />
              <Users size={13} className="text-slate-500" />
              <span className="telemetry-text">
                <strong>{respondersCount}</strong> Responders
              </span>
            </div>

            <div className="telemetry-divider" />

            {/* Incident Duration Timer */}
            <div
              className="telemetry-item font-mono"
              title="Time elapsed since incident declaration"
            >
              <Clock size={13} className="text-amber-500" />
              <span className="telemetry-text">
                ⏱ <strong>{formatTimer(elapsedSeconds)}</strong>
              </span>
            </div>

            <div className="telemetry-divider" />

            {/* AI Voice Activity Waveform */}
            <div className="telemetry-item" title="AI Voice Commander synthesis stream ready">
              <div className="mini-equalizer-bars" aria-hidden="true">
                <span className="eq-bar eq-1" />
                <span className="eq-bar eq-2" />
                <span className="eq-bar eq-3" />
                <span className="eq-bar eq-4" />
                <span className="eq-bar eq-5" />
              </div>
              <span className="telemetry-text font-semibold text-indigo-700">
                Commander Active
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================
            3. RIGHT ZONE: Navigation & Action
            ======================================================== */}
        <div className="header-zone-right">
          {/* Secondary Action: Single clean link to All Incident Rooms */}
          <a
            href="/rooms"
            className="header-rooms-link"
            id="header-nav-rooms"
            title="Browse all incident rooms and conversation histories"
          >
            <Layers size={13} className="text-slate-500" />
            <span>Rooms & History</span>
          </a>

          {/* Segmented Tab Control: Dashboard | SRE Console | Split View */}
          {onSelectViewMode ? (
            <div className="header-segmented-tabs" role="tablist" aria-label="Dashboard View Modes">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'dashboard'}
                onClick={() => onSelectViewMode('dashboard')}
                className={`segment-btn ${viewMode === 'dashboard' ? 'active' : ''}`}
                id="tab-view-dashboard"
                title="Incident Overview Dashboard"
              >
                <LayoutDashboard size={13} />
                <span>Dashboard</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'console'}
                onClick={() => onSelectViewMode('console')}
                className={`segment-btn ${viewMode === 'console' ? 'active' : ''}`}
                id="tab-view-console"
                title="SRE Voice Console & Runbooks"
              >
                <Terminal size={13} />
                <span>SRE Console</span>
                {showConversation && <span className="tab-live-dot" />}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'split'}
                onClick={() => onSelectViewMode('split')}
                className={`segment-btn ${viewMode === 'split' ? 'active' : ''}`}
                id="tab-view-split"
                title="Side-by-side Split View"
              >
                <Columns2 size={13} />
                <span>Split View</span>
              </button>
            </div>
          ) : null}

          {/* The Single Primary War Room Action Button */}
          {!showConversation ? (
            <a
              href={`/room/${encodeURIComponent(channelName)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="header-primary-join-btn"
              id="header-primary-join-war-room"
              title="Open Dedicated Voice War Room in a New Tab"
            >
              <Radio size={14} className="animate-pulse" />
              <span>Join War Room</span>
              <ExternalLink size={13} className="opacity-80" />
            </a>
          ) : (
            <div className="header-connected-group">
              <span className="header-live-badge" title="Audio session is connected and active">
                <span className="pulse-green-dot" />
                Voice Live
              </span>
              {onEndConversation && (
                <button
                  type="button"
                  onClick={onEndConversation}
                  disabled={isStopping}
                  className="header-leave-btn"
                  id="header-leave-voice"
                  title="Leave Voice Session"
                >
                  <PhoneOff size={13} />
                  <span>{isStopping ? 'Leaving...' : 'Leave'}</span>
                </button>
              )}
            </div>
          )}

          {/* Optional slot for additional context or actions */}
          {rightSlot}
        </div>
      </div>
    </header>
  );
}
