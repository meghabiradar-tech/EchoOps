'use client';

import React, { useState, useEffect } from 'react';
import {
  Flame,
  AlertTriangle,
  Clock,
  DollarSign,
  Users,
  Radio,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import { useIncidentContext } from '../context/IncidentContext';

// Helper to determine SLA urgency color
function getSlaSeverity(slaText) {
  if (!slaText) return 'critical';
  const lower = String(slaText).toLowerCase();
  if (lower.includes('breached') || lower.includes('0m') || lower.includes('overdue')) {
    return 'critical';
  }
  // Extract minutes if formatted like "12m 45s"
  const match = lower.match(/(\d+)\s*m/);
  if (match) {
    const mins = parseInt(match[1], 10);
    if (mins < 10) return 'critical';
    if (mins < 25) return 'warning';
    return 'neutral';
  }
  return 'warning';
}

export default function ActiveIncidentCard(props) {
  const context = useIncidentContext();
  const incident = props?.incident || context?.incident || {};
  const metrics = props?.metrics || context?.impactMetrics || {};
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const incidentId = incident.incidentId || incident.id || 'INC-8492';
  const severity = incident.severity || 'Sev-1';
  const status = (incident.status || 'investigating').toLowerCase();
  const rawEnv = incident.environment || 'Production • us-east-1';
  const [regionPart, envPart] = rawEnv.includes('•')
    ? rawEnv.split('•').map((s) => s.trim().toUpperCase())
    : ['US-EAST-1', rawEnv.toUpperCase()];
  const environment = envPart || 'PRODUCTION';
  const region = regionPart || 'US-EAST-1';

  const title = incident.title || 'Core API Elevated Latency & Database Saturation';
  const summary =
    incident.summary ||
    'High rate of HTTP 504 Gateway Timeouts and elevated API latency observed across checkout endpoints. Database worker connection pool is currently saturated.';
  const channelName = incident.channelName || incident.channel || 'echoops-war-room-042';

  const activeImpact =
    metrics.activeImpact || incident.activeImpact || incident.impact || 'Active telemetry threshold breach';
  const estRevenueLoss =
    metrics.estRevenueLoss || incident.estRevenueLoss || incident.estimatedRevenueImpact || '$0 / hr';
  const slaBreachIn =
    metrics.slaBreachIn || incident.slaBreachIn || incident.slaTimeRemaining || (status === 'resolved' ? 'Mitigated' : 'Active Triage');
  const impactedTraffic =
    metrics.impactedTraffic || incident.impactedTraffic || metrics.impactedCustomers || incident.impactedCustomers || 'Monitoring sessions';

  const isSev1 =
    String(severity).toUpperCase().includes('1') ||
    String(severity).toUpperCase() === 'CRITICAL' ||
    String(severity).toUpperCase() === 'HIGH';

  const slaColorState = status === 'resolved' ? 'neutral' : getSlaSeverity(slaBreachIn);

  return (
    <section
      className={`incident-cockpit-hero ${isSev1 ? 'border-l-sev1' : 'border-l-sev2'}`}
      aria-label="Active Incident Overview"
    >
      <div className="cockpit-header-wrapper">
        {/* Monospace Editorial Breadcrumbs Bar */}
        <div className="cockpit-breadcrumbs" aria-label="Incident Hierarchy">
          <span className="crumb-item font-mono font-bold text-rose-400 flex items-center gap-1.5" id="incident-id-display">
            <ShieldAlert size={12} className="text-rose-500" />
            <span>{incidentId.toUpperCase()}</span>
          </span>

          <span className="crumb-sep">/</span>

          <span className="crumb-item font-mono text-slate-300 font-semibold" title="Environment">
            {environment}
          </span>

          <span className="crumb-sep">/</span>

          <span className="crumb-item font-mono text-slate-400" title="AWS Region">
            {region}
          </span>

          <span className="crumb-sep">/</span>

          <span className="crumb-item font-mono text-indigo-400 font-semibold" title="Active War Room">
            #{channelName}
          </span>

          <div className="breadcrumbs-badges-right">
            {/* Severity Badge: Critical / Sev-1 crimson tint + pulsing red dot */}
            <span
              className={`status-pill ${
                isSev1 ? 'status-pill-critical' : 'status-pill-warning'
              }`}
              id="incident-severity-badge"
              title={`Severity Level: ${severity}`}
            >
              <span className="beacon-red-dot" />
              <Flame size={12} strokeWidth={2.4} />
              <span>{severity.toUpperCase().startsWith('SEV') ? severity.toUpperCase() : `SEV-${severity}`}</span>
            </span>

            {/* Status Badge: Investigating warm amber beacon or Mitigating emerald */}
            <span
              className={`status-pill ${
                status === 'investigating'
                  ? 'status-pill-investigating'
                  : status === 'mitigated' || status === 'resolved' || status === 'stable'
                  ? 'status-pill-stable'
                  : 'status-pill-amber'
              }`}
              id="incident-status-badge"
              title={`Lifecycle Status: ${status}`}
            >
              {status === 'investigating' ? (
                <span className="beacon-amber-dot" />
              ) : (
                <span className="beacon-green-dot" />
              )}
              <span>{status.toUpperCase()}</span>
            </span>
          </div>
        </div>

        {/* Main Title & Editorial Description */}
        <div className="cockpit-title-row">
          <h1 className="cockpit-headline font-sans" id="incident-title-display">
            {title}
          </h1>
          <p className="cockpit-subtext" id="incident-summary-display">
            {summary}
          </p>
        </div>

        {/* Telemetry Voice AI Bridge Status Strip */}
        <div className="cockpit-voice-strip" id="incident-voice-status-strip">
          <div className="voice-strip-left">
            <span className="voice-radar-icon">
              <Radio size={12} className="animate-pulse text-indigo-400" />
            </span>
            <span className="text-slate-400 font-mono text-xs">VOICE BRIDGE ACTIVE:</span>
            <span className="font-mono text-xs font-bold text-indigo-300">#{channelName}</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400 text-xs hidden sm:inline">
              Agora SD-RTN + Deepgram Nova-3 + GPT-4o-mini + MiniMax Voice
            </span>
          </div>
          <div className="voice-strip-right">
            <span className="cockpit-telemetry-badge">
              <Sparkles size={11} className="text-emerald-400" />
              <span>Autonomous SRE Active</span>
            </span>
          </div>
        </div>
      </div>

      {/* Unified Glassmorphic Metric Strip */}
      <div
        className="glassmorphic-metric-strip"
        role="region"
        aria-label="Incident Impact Metrics"
      >
        {/* 1. Active Impact */}
        <div className="glass-metric-cell" id="card-active-impact">
          <div className="cell-top">
            <AlertTriangle size={13} className="text-rose-400" />
            <span className="cell-title">Active Impact</span>
          </div>
          <div className="cell-value-wrap">
            {!isHydrated ? (
              <div className="metric-shimmer-skeleton" />
            ) : (
              <span className="cell-value text-rose-400 font-mono tracking-tight" id="metric-active-impact">
                {activeImpact}
              </span>
            )}
          </div>
          <span className="cell-footnote">
            {incident.impactFootnote || (status === 'resolved' ? 'System restored to normal operating envelope' : isSev1 ? 'Active telemetry threshold exceeded SLA' : 'Service degradation detected')}
          </span>
        </div>

        {/* 2. Est Revenue Loss */}
        <div className="glass-metric-cell" id="card-est-revenue-loss">
          <div className="cell-top">
            <DollarSign size={13} className="text-amber-400" />
            <span className="cell-title">Est. Revenue Loss</span>
          </div>
          <div className="cell-value-wrap">
            {!isHydrated ? (
              <div className="metric-shimmer-skeleton" />
            ) : (
              <span className="cell-value text-amber-400 font-mono tracking-tight" id="metric-est-revenue-loss">
                {estRevenueLoss}
              </span>
            )}
          </div>
          <span className="cell-footnote">
            {incident.revenueFootnote || (status === 'resolved' ? 'No financial loss accruing' : 'Calculated on active business velocity')}
          </span>
        </div>

        {/* 3. SLA Breach In (Transitions dynamically: Neutral -> Warning Amber -> Urgent Red) */}
        <div className={`glass-metric-cell ${slaColorState === 'critical' ? 'cell-glow-red' : ''}`} id="card-sla-breach">
          <div className="cell-top">
            <Clock
              size={13}
              className={
                slaColorState === 'critical'
                  ? 'text-rose-400 animate-pulse'
                  : slaColorState === 'warning'
                  ? 'text-amber-400'
                  : 'text-slate-300'
              }
            />
            <span className="cell-title">SLA Breach In</span>
          </div>
          <div className="cell-value-wrap">
            {!isHydrated ? (
              <div className="metric-shimmer-skeleton" />
            ) : (
              <span
                className={`cell-value font-mono tracking-tight ${
                  slaColorState === 'critical'
                    ? 'text-rose-400 font-black'
                    : slaColorState === 'warning'
                    ? 'text-amber-400 font-bold'
                    : 'text-slate-200'
                }`}
                id="metric-sla-breach"
              >
                {slaBreachIn}
              </span>
            )}
          </div>
          <span className="cell-footnote">
            {incident.slaFootnote || (status === 'resolved' ? 'MTTR target satisfied & verified' : isSev1 ? 'Sev-1 MTTR breach target: under 30m' : 'Target MTTR resolution window: under 60m')}
          </span>
        </div>

        {/* 4. Impacted Traffic */}
        <div className="glass-metric-cell" id="card-impacted-traffic">
          <div className="cell-top">
            <Users size={13} className="text-indigo-400" />
            <span className="cell-title">Impacted Traffic</span>
          </div>
          <div className="cell-value-wrap">
            {!isHydrated ? (
              <div className="metric-shimmer-skeleton" />
            ) : (
              <span className="cell-value text-indigo-300 font-mono tracking-tight" id="metric-impacted-traffic">
                {impactedTraffic}
              </span>
            )}
          </div>
          <span className="cell-footnote">
            {incident.trafficFootnote || (status === 'resolved' ? 'All customer sessions processing normally' : 'Active customer sessions experiencing degradation')}
          </span>
        </div>
      </div>
    </section>
  );
}
