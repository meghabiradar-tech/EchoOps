'use client';

import React from 'react';
import {
  Flame,
  AlertTriangle,
  Clock,
  DollarSign,
  Users,
  Radio,
  Sparkles,
  Server,
} from 'lucide-react';
import { useIncidentContext } from '../context/IncidentContext';

export default function ActiveIncidentCard(props) {
  const context = useIncidentContext();
  const incident = props?.incident || context?.incident || {};
  const metrics = props?.metrics || context?.impactMetrics || {};

  const incidentId = incident.incidentId || incident.id || 'inc-mtpz6hin';
  const severity = incident.severity || 'Sev-1';
  const status = incident.status || 'investigating';
  const environment = incident.environment || 'us-east-1 • Production';
  const title = incident.title || 'Core API Elevated Latency & Database Saturation';
  const summary =
    incident.summary ||
    'High rate of HTTP 504 Gateway Timeouts and elevated API latency observed across checkout endpoints. Database worker connection pool is currently saturated.';
  const channelName = incident.channelName || incident.channel || 'echoops-war-room-042';

  const activeImpact =
    metrics.activeImpact || incident.activeImpact || incident.impact || '74% Checkout Transactions Failing';
  const estRevenueLoss =
    metrics.estRevenueLoss || incident.estRevenueLoss || incident.estimatedRevenueImpact || '$42,000 / hr';
  const slaBreachIn =
    metrics.slaBreachIn || incident.slaBreachIn || incident.slaTimeRemaining || '12m 45s';
  const impactedTraffic =
    metrics.impactedTraffic || incident.impactedTraffic || metrics.impactedCustomers || incident.impactedCustomers || '1,420 Users Affected';

  const isSev1 =
    String(severity).toUpperCase().includes('1') ||
    String(severity).toUpperCase() === 'CRITICAL' ||
    String(severity).toUpperCase() === 'HIGH';

  return (
    <section className="incident-hero-card" aria-label="Active Incident Overview">
      <div className="hero-main-row">
        {/* Main Title & Badges */}
        <div className="incident-title-group">
          {/* Metadata Pill Hierarchy */}
          <div className="incident-badge-row">
            {/* Incident Identifier */}
            <span className="meta-pill meta-pill-id" id="incident-id-display">
              <Server size={12} className="text-slate-500" />
              <span>{incidentId}</span>
            </span>

            {/* Severity Badge */}
            <span
              className={`meta-pill ${isSev1 ? 'meta-pill-sev1' : 'meta-pill-sev2'}`}
              title={`Incident Severity: ${severity}`}
              id="incident-severity-badge"
            >
              <Flame size={12} strokeWidth={2.5} />
              <span>{severity.toUpperCase().startsWith('SEV') ? severity : `SEV: ${severity}`}</span>
            </span>

            {/* Status Badge */}
            <span
              className="meta-pill meta-pill-status"
              title={`Investigation Status: ${status}`}
              id="incident-status-badge"
            >
              <span className="pulse-amber-dot" />
              <span>STATUS: {status.toUpperCase()}</span>
            </span>

            {/* Environment Badge */}
            <span className="meta-pill meta-pill-env" title="Deployment Environment & Region">
              {environment}
            </span>

            {/* Channel Scope Tag */}
            <span className="meta-pill meta-pill-channel" title={`Incident Voice Channel: #${channelName}`}>
              #{channelName}
            </span>
          </div>

          {/* High-Contrast Incident Title */}
          <h1 className="incident-main-title" id="incident-title-display">
            {title}
          </h1>

          {/* Crisp Description */}
          <p className="incident-summary-text" id="incident-summary-display">
            {summary}
          </p>

          {/* Collapsed Inline Voice AI Status Strip (Replaces bulky promo card) */}
          <div className="hero-voice-status-strip" id="incident-voice-status-strip">
            <div className="voice-status-left">
              <div className="voice-status-icon-dot">
                <Radio size={13} className="text-indigo-600 animate-pulse" />
              </div>
              <span className="voice-status-label">Voice AI Bridge Ready:</span>
              <span className="voice-status-channel font-mono">#{channelName}</span>
              <span className="voice-status-dot">•</span>
              <span className="voice-status-stack">Agora SD-RTN + Deepgram Nova-3 + GPT-4o-mini + MiniMax TTS</span>
            </div>
            <div className="voice-status-right">
              <span className="voice-telemetry-badge">
                <Sparkles size={11} className="text-emerald-600" />
                <span>Autonomous Ops Active</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Standardized 4 Impact Metric Cards */}
      <div className="hero-metrics-grid" role="region" aria-label="Incident Impact Metrics">
        {/* 1. Active Impact */}
        <div className="metric-mini-card" id="card-active-impact">
          <span className="metric-label">
            <AlertTriangle size={13} className="text-rose-500" />
            <span>Active Impact</span>
          </span>
          <span className="metric-value critical" id="metric-active-impact">
            {activeImpact}
          </span>
          <span className="metric-subtext">Telemetry error rate threshold exceeded</span>
        </div>

        {/* 2. Est Revenue Loss */}
        <div className="metric-mini-card" id="card-est-revenue-loss">
          <span className="metric-label">
            <DollarSign size={13} className="text-amber-500" />
            <span>Est. Revenue Loss</span>
          </span>
          <span className="metric-value warning" id="metric-est-revenue-loss">
            {estRevenueLoss}
          </span>
          <span className="metric-subtext">Calculated on transaction checkout velocity</span>
        </div>

        {/* 3. SLA Breach In */}
        <div className="metric-mini-card" id="card-sla-breach">
          <span className="metric-label">
            <Clock size={13} className="text-rose-500" />
            <span>SLA Breach In</span>
          </span>
          <span className="metric-value critical font-mono" id="metric-sla-breach">
            {slaBreachIn}
          </span>
          <span className="metric-subtext">Sev-1 MTTR target: under 30 minutes</span>
        </div>

        {/* 4. Impacted Traffic */}
        <div className="metric-mini-card" id="card-impacted-traffic">
          <span className="metric-label">
            <Users size={13} className="text-indigo-500" />
            <span>Impacted Traffic</span>
          </span>
          <span className="metric-value info" id="metric-impacted-traffic">
            {impactedTraffic}
          </span>
          <span className="metric-subtext">Concurrent customer sessions degraded</span>
        </div>
      </div>
    </section>
  );
}
