'use client';

import React from 'react';
import { ShieldCheck, Check } from 'lucide-react';
import { useIncidentContext } from '../context/IncidentContext';

export default function FactsCard(props) {
  const context = useIncidentContext();
  const facts = props?.facts || context?.confirmedFacts || context?.facts || [];

  return (
    <div className="card" aria-label="Confirmed Incident Facts">
      <div className="card-header">
        <div className="card-title-group">
          <div className="card-icon-badge" style={{ background: '#ecfdf5', color: '#059669' }}>
            <ShieldCheck size={18} />
          </div>
          <h2 className="card-title">Confirmed Facts</h2>
        </div>
        <span
          className="card-badge-count"
          style={{ background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0' }}
          id="confirmed-facts-count"
        >
          {facts.length} Verified
        </span>
      </div>

      <div className="card-body">
        <div className="facts-list">
          {facts.map((f) => (
            <div key={f.id} className="fact-item-card">
              <div className="fact-header-row">
                <span className="confirmed-badge">
                  <Check size={12} strokeWidth={3} />
                  {f.confidence || 'Confirmed'}
                </span>
                <span className="font-mono text-dim" style={{ fontSize: '0.72rem' }}>
                  {f.timestamp}
                </span>
              </div>

              <p className="fact-text">{f.fact || f.statement}</p>

              <div className="fact-footer-row">
                <span>
                  Verified via: <strong style={{ color: '#475569' }}>{f.verifiedBy || 'Telemetry APM'}</strong>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
