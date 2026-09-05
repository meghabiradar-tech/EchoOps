'use client';

import React from 'react';
import { AlertOctagon, Flame, Clock, DollarSign, Users } from 'lucide-react';
import { useIncidentContext } from '../context/IncidentContext';

export default function ActiveIncidentCard(props) {
  const context = useIncidentContext();
  const incident = props?.incident || context?.incident || {};
  const metrics = context?.impactMetrics || {};

  const incidentId = incident.incidentId || incident.id || 'INC-8492';
  const severity = incident.severity || 'HIGH';
  const status = incident.status || 'ACTIVE';
  const environment = incident.environment || 'PRODUCTION (us-east-1)';
  const title = incident.title || 'Payment Service Outage';
  const summary = incident.summary || '';

  const activeImpact = metrics.activeImpact || incident.impact || '74% Checkout Transactions Failing';
  const estRevenueLoss = metrics.estRevenueLoss || incident.estimatedRevenueImpact || '$42,000 / hr';
  const slaBreachIn = metrics.slaBreachIn || incident.slaTimeRemaining || '12m 45s';
  const impactedTraffic = metrics.impactedTraffic || metrics.impactedCustomers || incident.impactedCustomers || '1,420 Users Affected';

  const isCriticalSeverity = severity.toUpperCase() === 'CRITICAL' || severity.toUpperCase() === 'HIGH';

  return (
    <section className="incident-hero-card" aria-label="Active Incident Overview">
      <div className="hero-main-row">
        {/* Main Title & Badges */}
        <div className="incident-title-group">
          <div className="incident-badge-row">
            <span className="incident-id-badge" id="incident-id-display">{incidentId}</span>
            <span
              className={isCriticalSeverity ? 'severity-high-badge' : 'incident-id-badge'}
              title={`Severity Level: ${severity}`}
              id="incident-severity-badge"
            >
              <Flame size={13} strokeWidth={2.5} />
              SEVERITY: {severity}
            </span>
            <span className="status-active-badge" title={`Incident is currently ${status}`} id="incident-status-badge">
              <span className="pulse-red-dot"></span>
              STATUS: {status}
            </span>
            <span className="incident-id-badge font-mono" style={{ background: '#f8fafc', color: '#64748b' }}>
              {environment}
            </span>
          </div>

          <h1 className="incident-main-title" id="incident-title-display">{title}</h1>
          <p className="incident-summary-text" id="incident-summary-display">{summary}</p>
        </div>
      </div>

      {/* Mini Metrics Bar */}
      <div className="hero-metrics-grid">
        <div className="metric-mini-card">
          <span className="metric-label">
            <AlertOctagon size={13} className="text-red-500" />
            Active Impact
          </span>
          <span className="metric-value critical" id="metric-active-impact">{activeImpact}</span>
        </div>

        <div className="metric-mini-card">
          <span className="metric-label">
            <DollarSign size={13} className="text-amber-500" />
            Est. Revenue Loss
          </span>
          <span className="metric-value warning" id="metric-est-revenue-loss">{estRevenueLoss}</span>
        </div>

        <div className="metric-mini-card">
          <span className="metric-label">
            <Clock size={13} className="text-red-500" />
            SLA Breach In
          </span>
          <span className="metric-value critical font-mono" id="metric-sla-breach">{slaBreachIn}</span>
        </div>

        <div className="metric-mini-card">
          <span className="metric-label">
            <Users size={13} className="text-blue-500" />
            Impacted Traffic
          </span>
          <span className="metric-value" id="metric-impacted-traffic">{impactedTraffic}</span>
        </div>
      </div>
    </section>
  );
}
