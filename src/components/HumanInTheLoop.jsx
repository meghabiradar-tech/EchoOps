'use client';

import React from 'react';
import { UserCheck, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { useIncidentContext } from '../context/IncidentContext';

export default function HumanInTheLoop(props) {
  const context = useIncidentContext();
  const hitlData = props?.hitlData || context?.pendingAction || context?.humanInTheLoop || {};
  const isConfirmed = hitlData.isConfirmed || false;
  const confirmedTime = hitlData.confirmedTime || null;

  const actionTitle = hitlData.actionTitle || 'Restart Payment Service Pods';
  const subtitle = hitlData.subtitle || hitlData.actionSub || 'Rolling restart across payment-service-prod cluster';
  const impactAssessment = hitlData.impactAssessment || hitlData.consequence || 'Will drop active in-flight checkout connections for 4-7 seconds during pod rotation.';
  const target = hitlData.target || hitlData.targetCluster || 'k8s-prod-useast1';

  const handleConfirm = () => {
    if (context?.confirmPendingAction) {
      context.confirmPendingAction();
    }
  };

  const handleReset = () => {
    if (context?.resetPendingAction) {
      context.resetPendingAction();
    }
  };

  return (
    <div className="hitl-container" aria-label="Human in the loop approval card">
      <div className="hitl-header-banner">
        <div className="hitl-title-row">
          <UserCheck size={18} strokeWidth={2.5} />
          <span>Human-In-The-Loop Governance</span>
        </div>
        <span className="hitl-guardrail-badge">AI SAFETY GUARDRAIL</span>
      </div>

      <div className="hitl-body">
        <div className="hitl-action-box">
          <h3 className="hitl-action-title" id="hitl-action-title">{actionTitle}</h3>
          <p className="hitl-action-sub" id="hitl-action-sub">{subtitle}</p>
          <p className="hitl-consequence-text" id="hitl-consequence">
            <strong>Impact Assessment:</strong> {impactAssessment}
          </p>
        </div>

        <div className="hitl-footer-action-row">
          <div className="hitl-approval-meta">
            <AlertCircle size={14} className="text-amber-500" />
            <span>Target: <code className="font-mono text-dim" id="hitl-target-cluster">{target}</code></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {isConfirmed ? (
              <>
                <button className="btn-action-confirmed" disabled id="action-confirmed-badge">
                  <Check size={18} strokeWidth={3} />
                  ✓ Action Confirmed
                </button>
                <button
                  className="btn-reset-demo"
                  onClick={handleReset}
                  title="Reset state for demo pitch"
                  id="reset-hitl-button"
                >
                  <RefreshCw size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  Reset Demo
                </button>
              </>
            ) : (
              <button
                className="btn-confirm-action"
                onClick={handleConfirm}
                id="confirm-action-button"
              >
                Confirm Action
              </button>
            )}
          </div>
        </div>

        {isConfirmed && (
          <div
            id="hitl-confirmed-banner"
            style={{
              marginTop: '0.85rem',
              padding: '0.5rem 0.75rem',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '6px',
              fontSize: '0.75rem',
              color: '#166534',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>
              ✓ Dispatched command &ldquo;{actionTitle}&rdquo; to {target}.
            </span>
            <span className="font-mono" style={{ fontWeight: '700' }}>
              Authorized at {confirmedTime}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
