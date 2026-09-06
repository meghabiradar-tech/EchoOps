'use client';

import React from 'react';
import { HelpCircle, AlertCircle } from 'lucide-react';
import { useIncidentContext } from '../context/IncidentContext';

export default function AssumptionsCard(props) {
  const context = useIncidentContext();
  const assumptions = props?.assumptions || context?.hypotheses || context?.assumptions || [];

  return (
    <div className="card" aria-label="Unconfirmed Assumptions and Hypotheses">
      <div className="card-header">
        <div className="card-title-group">
          <div className="card-icon-badge" style={{ background: '#fffbeb', color: '#d97706' }}>
            <HelpCircle size={18} />
          </div>
          <h2 className="card-title">Assumptions & Hypotheses</h2>
        </div>
        <span
          className="card-badge-count"
          style={{ background: '#fffbeb', color: '#b45309', borderColor: '#fde68a' }}
          id="hypotheses-count"
        >
          {assumptions.length} Unconfirmed
        </span>
      </div>

      <div className="card-body">
        <div className="assumptions-list">
          {assumptions.map((a) => (
            <div key={a.id} className="assumption-item-card">
              <div className="assumption-header-row">
                <span className="unconfirmed-badge">
                  <AlertCircle size={12} strokeWidth={2.5} />
                  {a.status || 'UNVERIFIED'}
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: '700',
                    color: (a.riskLevel || a.risk) === 'High' ? '#dc2626' : (a.riskLevel || a.risk) === 'Medium' ? '#d97706' : '#16a34a',
                  }}
                >
                  Risk: {a.riskLevel || a.risk || 'Medium'}
                </span>
              </div>

              <p className="assumption-text">{a.hypothesis || a.statement}</p>

              <div className="assumption-footer-row">
                <span>
                  Source: <strong style={{ color: '#475569' }}>{a.source || a.raisedBy || 'Voice Bridge Triage'}</strong>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
