import React from 'react';
import Link from 'next/link';
import { Clock, AlertTriangle, XCircle, Sparkles, ShieldX, CheckCircle2, ArrowRight } from 'lucide-react';
import { useIncidentContext } from '../context/IncidentContext';

export default function IncidentTimeline(props) {
  const context = useIncidentContext();
  const timeline = props?.timeline || context?.timeline || [];
  const channel = context?.channelName || context?.incident?.channelName || 'echoops-war-room-042';

  const getNodeIcon = (type) => {
    switch (type) {
      case 'alert':
        return <AlertTriangle size={16} />;
      case 'error':
        return <XCircle size={16} />;
      case 'system':
        return <Sparkles size={16} />;
      case 'warning':
        return <ShieldX size={16} />;
      case 'action':
        return <CheckCircle2 size={16} />;
      default:
        return <Clock size={16} />;
    }
  };

  return (
    <div className="card" aria-label="Incident Timeline">
      <div className="card-header">
        <div className="card-title-group">
          <div className="card-icon-badge" style={{ background: '#eef2ff', color: '#4f46e5' }}>
            <Clock size={17} />
          </div>
          <h2 className="card-title">Incident Timeline</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="card-badge-count" id="timeline-events-count">{timeline.length} Chronological Events</span>
          <Link
            href={`/room/${encodeURIComponent(channel)}/timeline`}
            className="timeline-drilldown-link"
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#4f46e5',
              background: '#f5f3ff',
              border: '1px solid #ddd6fe',
              borderRadius: '6px',
              padding: '2px 8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              textDecoration: 'none',
            }}
            title="Open Dedicated Post-Mortem & Timeline Drilldown"
            id="timeline-drilldown-button"
          >
            <span>Drilldown</span>
            <ArrowRight size={11} />
          </Link>
        </div>
      </div>


      <div className="card-body">
        <div className="timeline-container">
          <div className="timeline-track">
            {timeline.map((item) => (
              <div key={item.id} className="timeline-item">
                {/* Node icon with type-specific color */}
                <div className={`timeline-node ${item.type || 'system'}`} title={item.type || 'system'}>
                  {getNodeIcon(item.type)}
                </div>

                {/* Event Content Card */}
                <div className="timeline-content-card">
                  <div className="timeline-meta-row">
                    <span className="timeline-time-badge">{item.time}</span>
                    <span className="timeline-tag">{item.badge || (item.category ? item.category.toUpperCase() : 'UPDATE')}</span>
                  </div>

                  <h3 className="timeline-event-title">{item.title || item.note || item.category || 'Incident Event'}</h3>
                  <p className="timeline-event-desc">{item.description || item.note || ''}</p>

                  <div className="timeline-source-pill">
                    <span>Source:</span>
                    <strong style={{ color: '#334155' }}>{item.source || item.speaker || 'EchoOps Voice AI'}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
