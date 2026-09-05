'use client';

import React from 'react';
import { CheckSquare } from 'lucide-react';
import { useIncidentContext } from '../context/IncidentContext';

export default function ActionOwnership(props) {
  const context = useIncidentContext();
  const actions = props?.actions || props?.initialActions || context?.actions || [];

  // Cycle status on click: PENDING -> IN PROGRESS -> COMPLETED -> PENDING
  const handleCycleStatus = (id, currentStatus) => {
    let nextStatus = 'IN PROGRESS';
    if (currentStatus === 'PENDING') nextStatus = 'IN PROGRESS';
    else if (currentStatus === 'IN PROGRESS') nextStatus = 'COMPLETED';
    else if (currentStatus === 'COMPLETED') nextStatus = 'PENDING';

    if (context?.updateActionStatus) {
      context.updateActionStatus(id, nextStatus);
    }
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'COMPLETED':
        return 'status-completed';
      case 'IN PROGRESS':
        return 'status-in-progress';
      case 'PENDING':
      default:
        return 'status-pending';
    }
  };

  return (
    <div className="card" aria-label="Action Items and Ownership">
      <div className="card-header">
        <div className="card-title-group">
          <div className="card-icon-badge" style={{ background: '#e0f2fe', color: '#0284c7' }}>
            <CheckSquare size={18} />
          </div>
          <h2 className="card-title">Action & Ownership</h2>
        </div>
        <span className="card-badge-count" id="actions-count">{actions.length} Assigned Items</span>
      </div>

      <div className="card-body">
        <div className="actions-list">
          {actions.map((act) => (
            <div key={act.id} className="action-row-card">
              {/* Action Description & Owner */}
              <div className="action-main-info">
                <h3 className="action-title-text">{act.action}</h3>

                <div className="action-owner-tag">
                  <div
                    className="owner-avatar"
                    style={{
                      backgroundColor: act.owner?.bg || '#eef2ff',
                      color: act.owner?.color || '#4f46e5',
                    }}
                    title={act.owner?.role || 'Responder'}
                  >
                    {act.owner?.initials || 'EO'}
                  </div>
                  <span className="owner-name">{act.owner?.name || 'EchoOps Commander'}</span>
                  <span className="owner-role">• {act.owner?.role || 'SRE Engine'}</span>
                </div>
              </div>

              {/* Status Pill Badge (Clickable to toggle status) */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                <span
                  className={`status-pill ${getStatusClass(act.status)}`}
                  onClick={() => handleCycleStatus(act.id, act.status)}
                  title="Click to toggle status"
                  id={`action-status-pill-${act.id}`}
                >
                  {act.status}
                </span>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                  Updated {act.updatedAt}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
