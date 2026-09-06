import React from 'react';
import { useRouter } from 'next/navigation';
import { CheckSquare, ExternalLink, ChevronRight } from 'lucide-react';
import { useIncidentContext } from '../context/IncidentContext';

export default function ActionOwnership(props) {
  const router = useRouter();
  const context = useIncidentContext();
  const actions = props?.actions || props?.initialActions || context?.actions || [];
  const channel = context?.channelName || context?.incident?.channelName || 'echoops-war-room-042';

  // Cycle status on click: PENDING -> IN PROGRESS -> COMPLETED -> PENDING
  const handleCycleStatus = (e, id, currentStatus) => {
    e.stopPropagation();
    let nextStatus = 'IN PROGRESS';
    if (currentStatus === 'PENDING') nextStatus = 'IN PROGRESS';
    else if (currentStatus === 'IN PROGRESS') nextStatus = 'COMPLETED';
    else if (currentStatus === 'COMPLETED') nextStatus = 'PENDING';

    if (context?.updateActionStatus) {
      context.updateActionStatus(id, nextStatus);
    }
  };

  const handleOpenActionReview = (actionId) => {
    const targetUrl = `/room/${encodeURIComponent(channel)}/actions/${encodeURIComponent(actionId)}`;
    router.push(targetUrl);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="card-badge-count" id="actions-count">{actions.length} Assigned Items</span>
        </div>
      </div>

      <div className="card-body">
        <div className="actions-list">
          {actions.map((act) => (
            <div
              key={act.id}
              className="action-row-card"
              onClick={() => handleOpenActionReview(act.id)}
              style={{ cursor: 'pointer' }}
              title="Click to open dedicated mitigation review"
            >
              {/* Action Description & Owner */}
              <div className="action-main-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <h3 className="action-title-text">{act.action || act.task}</h3>
                  <ChevronRight size={14} className="text-slate-400 shrink-0" />
                </div>

                <div className="action-owner-tag">
                  <div
                    className="owner-avatar"
                    style={{
                      backgroundColor: (typeof act.owner === 'object' && act.owner?.bg) || '#eef2ff',
                      color: (typeof act.owner === 'object' && act.owner?.color) || '#4f46e5',
                    }}
                    title={typeof act.owner === 'object' ? (act.owner?.role || 'Responder') : act.owner}
                  >
                    {typeof act.owner === 'object'
                      ? (act.owner?.initials || 'EO')
                      : (act.owner ? String(act.owner).slice(0, 2).toUpperCase() : 'EO')}
                  </div>
                  <span className="owner-name">
                    {typeof act.owner === 'object' ? (act.owner?.name || 'EchoOps Commander') : (act.owner || 'EchoOps Commander')}
                  </span>
                  <span className="owner-role">
                    • {typeof act.owner === 'object' ? (act.owner?.role || 'SRE Engine') : 'Assigned Responder'}
                  </span>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      color: '#4f46e5',
                      marginLeft: '6px',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '2px',
                    }}
                  >
                    Review <ExternalLink size={10} />
                  </span>
                </div>
              </div>

              {/* Status Pill Badge (Clickable to toggle status) */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                <span
                  className={`status-pill ${getStatusClass(act.status)}`}
                  onClick={(e) => handleCycleStatus(e, act.id, act.status)}
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

