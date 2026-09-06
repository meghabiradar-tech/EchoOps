'use client';

import React, { useState, useEffect } from 'react';
import {
  Radio,
  Users,
  Clock,
  LayoutDashboard,
  Terminal,
  History,
  ExternalLink,
  PhoneOff,
  Bot,
  Copy,
  Check,
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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSecs) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleCopyChannel = (e) => {
    e.stopPropagation();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(channelName);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  // Determine active view mode label
  const isCockpitActive = viewMode === 'dashboard' || viewMode === 'cockpit';
  const isConsoleActive = viewMode === 'console';
  const isTimelineActive = viewMode === 'timeline';

  return (
    <header className="dashboard-header" role="banner">
      <div className="header-inner">
        {/* ========================================================
            1. LEFT COLUMN: Identity & Dynamic War Room Tag
            ======================================================== */}
        <div className="header-zone-left">
          <div className="header-brand-group">
            <div className="brand-icon-wrapper" title="EchoOps Autonomous Voice SRE">
              <Radio size={18} strokeWidth={2.4} />
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

          {/* Dynamic War Room Tag with 1-Click Copy */}
          <button
            type="button"
            onClick={handleCopyChannel}
            className="header-channel-pill group"
            title={`Click to copy channel: #${channelName}`}
            id="header-channel-scope"
          >
            <span className="header-channel-hash">#</span>
            <span className="header-channel-name">{channelName}</span>
            <span className="header-copy-icon">
              {copied ? (
                <Check size={12} className="text-emerald-400" />
              ) : (
                <Copy size={12} className="text-slate-400 group-hover:text-slate-200 transition-colors" />
              )}
            </span>
            {copied && <span className="copy-tooltip">Copied!</span>}
          </button>
        </div>

        {/* ========================================================
            2. CENTER COLUMN: Clustered Status Pill
            ======================================================== */}
        <div className="header-zone-center">
          <div className="telemetry-pill-container" title="Operational Telemetry & Audio Engine">
            {/* Live Incident Duration Clock */}
            <div
              className="telemetry-item font-mono"
              title="Time elapsed since incident declaration"
            >
              <Clock size={13} className="text-amber-400" />
              <span className="telemetry-text">
                ⏱ <strong className="font-mono tracking-tight">{formatTimer(elapsedSeconds)}</strong>
              </span>
            </div>

            <div className="telemetry-divider" />

            {/* Active Headcount Indicator */}
            <div className="telemetry-item" title="Active responders currently on the bridge">
              <span className="pulse-green-dot" />
              <Users size={13} className="text-emerald-400" />
              <span className="telemetry-text">
                <strong>{respondersCount}</strong> Responders
              </span>
            </div>

            <div className="telemetry-divider" />

            {/* Pure CSS Audio Equalizer (4 vertical bars) */}
            <div className="telemetry-item" title="AI Voice Commander synthesis & audio stream ready">
              <div className="mini-equalizer-bars" aria-hidden="true">
                <span className="eq-bar eq-1" />
                <span className="eq-bar eq-2" />
                <span className="eq-bar eq-3" />
                <span className="eq-bar eq-4" />
              </div>
              <span className="telemetry-text font-semibold text-indigo-400">
                Voice Ready
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================
            3. RIGHT COLUMN: View Switcher & Single Primary War Room Button
            ======================================================== */}
        <div className="header-zone-right">
          {/* View Switcher: Cockpit | SRE Console | Timeline */}
          {onSelectViewMode ? (
            <div className="header-segmented-tabs" role="tablist" aria-label="Dashboard View Modes">
              <button
                type="button"
                role="tab"
                aria-selected={isCockpitActive}
                onClick={() => onSelectViewMode('dashboard')}
                className={`segment-btn ${isCockpitActive ? 'active' : ''}`}
                id="tab-view-cockpit"
                title="Incident Cockpit Overview"
              >
                <LayoutDashboard size={13} />
                <span>Cockpit</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={isConsoleActive}
                onClick={() => onSelectViewMode('console')}
                className={`segment-btn ${isConsoleActive ? 'active' : ''}`}
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
                aria-selected={isTimelineActive}
                onClick={() => onSelectViewMode('timeline')}
                className={`segment-btn ${isTimelineActive ? 'active' : ''}`}
                id="tab-view-timeline"
                title="Incident Timeline & Events"
              >
                <History size={13} />
                <span>Timeline</span>
              </button>
            </div>
          ) : null}

          {/* Single Primary "Open War Room" Button */}
          {!showConversation ? (
            <a
              href={`/room/${encodeURIComponent(channelName)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="header-primary-join-btn"
              id="header-primary-join-war-room"
              title="Open Dedicated Voice War Room in a New Tab"
            >
              <Radio size={14} className="animate-pulse text-white" />
              <span>Open War Room</span>
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
