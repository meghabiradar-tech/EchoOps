'use client';

import React from 'react';
import { GitFork, UserX, TrendingDown, ShieldAlert } from 'lucide-react';
import { useIncidentContext } from '../context/IncidentContext';

export default function AlertsSection(props) {
  const context = useIncidentContext();
  const alerts = props?.alerts || context?.alerts || {};

  const conflict = alerts.conflict || {
    title: 'Deployment vs Rollback Divergence',
    description: 'Service mesh route rules diverged between canary v2.14.2 and baseline v2.14.0.',
    impact: 'Stuck connection pool slots on Payment Gateway',
    time: '14:24:10',
    badge: 'Conflict Alert',
  };

  const gap = alerts.gap || {
    title: 'Missing Primary On-Call Responder',
    description: 'No active SRE ack on Redis cluster alert despite latency crossing 1,800ms threshold.',
    impact: 'Elevated checkout failure cascading to user cart sessions',
    time: '14:25:02',
    badge: 'Gap Alert',
  };

  const risk = alerts.risk || {
    title: 'Projected SLA Breach in < 12 Minutes',
    description: 'Four-nines availability SLA at risk if 504 gateway timeouts persist at current 74% error rate.',
    impact: 'Tier-1 contractual customer penalty ($50K+)',
    time: '14:26:45',
    badge: 'Risk Alert',
  };

  const totalAlerts = [conflict, gap, risk].filter(Boolean).length;

  return (
    <div className="card" aria-label="Incident Alerts">
      <div className="card-header">
        <div className="card-title-group">
          <div className="card-icon-badge" style={{ background: '#fef2f2', color: '#dc2626' }}>
            <ShieldAlert size={18} />
          </div>
          <h2 className="card-title">Active AI Alerts & Triages</h2>
        </div>
        <span
          className="card-badge-count"
          style={{ background: '#fef2f2', color: '#991b1b', borderColor: '#fecaca' }}
          id="alerts-count"
        >
          {totalAlerts} Critical Signals
        </span>
      </div>

      <div className="card-body">
        <div className="alerts-stack">
          {/* 1. Conflict Alert */}
          {conflict && (
            <div className="alert-box alert-conflict">
              <div className="alert-icon-col">
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#fee2e2',
                    color: '#dc2626',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <GitFork size={16} />
                </div>
              </div>

              <div className="alert-content-col">
                <div className="alert-top-row">
                  <span className="alert-category-tag tag-conflict">{conflict.badge || 'Conflict Alert'}</span>
                  <span className="font-mono text-dim" style={{ fontSize: '0.72rem' }}>{conflict.time}</span>
                </div>
                <h3 className="alert-heading">{conflict.title}</h3>
                <p className="alert-description">{conflict.description}</p>
                <div className="alert-impact-box">
                  <span style={{ color: '#991b1b', fontWeight: '700' }}>Impact: </span>
                  {conflict.impact}
                </div>
              </div>
            </div>
          )}

          {/* 2. Gap Alert */}
          {gap && (
            <div className="alert-box alert-gap">
              <div className="alert-icon-col">
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#ffedd5',
                    color: '#ea580c',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <UserX size={16} />
                </div>
              </div>

              <div className="alert-content-col">
                <div className="alert-top-row">
                  <span className="alert-category-tag tag-gap">{gap.badge || 'Gap Alert'}</span>
                  <span className="font-mono text-dim" style={{ fontSize: '0.72rem' }}>{gap.time}</span>
                </div>
                <h3 className="alert-heading">{gap.title}</h3>
                <p className="alert-description">{gap.description}</p>
                <div className="alert-impact-box">
                  <span style={{ color: '#9a3412', fontWeight: '700' }}>Impact: </span>
                  {gap.impact}
                </div>
              </div>
            </div>
          )}

          {/* 3. Risk Alert */}
          {risk && (
            <div className="alert-box alert-risk">
              <div className="alert-icon-col">
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#ede9fe',
                    color: '#7c3aed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <TrendingDown size={16} />
                </div>
              </div>

              <div className="alert-content-col">
                <div className="alert-top-row">
                  <span className="alert-category-tag tag-risk">{risk.badge || 'Risk Alert'}</span>
                  <span className="font-mono text-dim" style={{ fontSize: '0.72rem' }}>{risk.time}</span>
                </div>
                <h3 className="alert-heading">{risk.title}</h3>
                <p className="alert-description">{risk.description}</p>
                <div className="alert-impact-box">
                  <span style={{ color: '#5b21b6', fontWeight: '700' }}>Impact: </span>
                  {risk.impact}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
