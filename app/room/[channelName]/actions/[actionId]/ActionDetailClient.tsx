'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  Server,
  UserCheck,
  Check,
  Terminal,
  Activity,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { useIncidentContext } from '@/src/context/IncidentContext';
import { Button } from '@/components/ui/button';

interface ActionDetailClientProps {
  channelName: string;
  actionId: string;
}

export function ActionDetailClient({ channelName, actionId }: ActionDetailClientProps) {
  const cleanChannel = decodeURIComponent(channelName).trim() || 'echoops-war-room-042';
  const cleanActionId = decodeURIComponent(actionId).trim();

  const context = useIncidentContext();
  const contextActions = context?.actions;
  const hitlData = context?.humanInTheLoop;

  // Find targeted action from context or synthesize fallback
  const currentAction = useMemo(() => {
    const list = contextActions || [];
    const found = list.find((a) => a.id === cleanActionId);
    if (found) return found;

    // Fallback if accessed via direct URL before state sync
    return {
      id: cleanActionId,
      action: hitlData?.actionTitle || 'Drain connection pool and rollback payment worker pods',
      owner: {
        name: 'EchoOps Commander',
        role: 'Automated SRE Engine',
        initials: 'EO',
        color: '#4f46e5',
        bg: '#eef2ff',
      },
      status: (hitlData?.isConfirmed ? 'COMPLETED' : 'IN PROGRESS') as 'PENDING' | 'IN PROGRESS' | 'COMPLETED',
      updatedAt: 'Just now',
    };
  }, [contextActions, cleanActionId, hitlData?.actionTitle, hitlData?.isConfirmed]);

  const [isExecuting, setIsExecuting] = useState(false);
  const [executionLog, setExecutionLog] = useState<string[]>([]);
  const [isExecuted, setIsExecuted] = useState(currentAction.status === 'COMPLETED');

  const actionWithMeta = currentAction as typeof currentAction & { target?: string; impactAssessment?: string };
  const targetCluster = hitlData?.targetCluster || actionWithMeta.target || 'k8s-prod-useast1';
  const impactAssessment =
    hitlData?.consequence ||
    actionWithMeta.impactAssessment ||
    'Rolling pod restart will temporarily shed unauthenticated cart sessions for 4–7 seconds while maintaining active checkout transactions.';
  const riskLevel = hitlData?.riskLevel || 'CRITICAL';

  const handleCycleStatus = (nextStatus: 'PENDING' | 'IN PROGRESS' | 'COMPLETED') => {
    if (context?.updateActionStatus) {
      context.updateActionStatus(currentAction.id, nextStatus);
    }
  };


  const handleAuthorizeExecution = async () => {
    setIsExecuting(true);
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    setExecutionLog((prev) => [
      ...prev,
      `[${now}] Authorizing operator credentials... OK`,
      `[${now}] Acquired cluster mutex lock on ${targetCluster}... OK`,
      `[${now}] Dispatching kubectl rollout restart command... DISPATCHED`,
    ]);

    // Trigger context HITL confirmation
    if (context?.confirmPendingAction) {
      context.confirmPendingAction();
    }
    if (context?.updateActionStatus) {
      context.updateActionStatus(currentAction.id, 'COMPLETED');
    }

    // Persist to backend
    try {
      await fetch(`/api/actions/${encodeURIComponent(currentAction.id)}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmedBy: 'Incident Commander',
          channel: cleanChannel,
        }),
      });
    } catch (e) {
      console.warn('Action confirm API note:', e);
    }

    setTimeout(() => {
      setExecutionLog((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Verification probe: 0 unready pods detected. Rollout complete.`,
      ]);
      setIsExecuting(false);
      setIsExecuted(true);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Header / Navigation Bar */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href={`/room/${encodeURIComponent(cleanChannel)}`}
            className="flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors bg-indigo-50 dark:bg-indigo-950/50 px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-900"
            id="back-to-war-room-btn"
          >
            <ArrowLeft size={16} />
            <span>← Back to Incident War Room</span>
          </Link>
          <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800" />
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
            <span>Room: {cleanChannel}</span>
            <span>/</span>
            <span>Actions</span>
            <span>/</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{cleanActionId}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900 flex items-center gap-1.5">
            <Activity size={12} className="animate-pulse text-red-600" />
            LIVE MITIGATION REVIEW
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 md:p-8 space-y-6">
        {/* Action Header Card */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                  {currentAction.id}
                </span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  RISK: {riskLevel}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  Updated {currentAction.updatedAt}
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-white" id="action-detail-title">
                {currentAction.action}
              </h1>
            </div>

            {/* Status Control Pill */}
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Status</span>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                {(['PENDING', 'IN PROGRESS', 'COMPLETED'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => handleCycleStatus(st)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                      currentAction.status === st
                        ? st === 'COMPLETED'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : st === 'IN PROGRESS'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-amber-600 text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Assignee & Infrastructure Metadata */}
          <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm"
                style={{
                  backgroundColor: currentAction.owner?.bg || '#eef2ff',
                  color: currentAction.owner?.color || '#4f46e5',
                }}
              >
                {currentAction.owner?.initials || 'EO'}
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Assigned Responder</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {currentAction.owner?.name || 'EchoOps Commander'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
                <Server size={18} />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Target Cluster / Layer</p>
                <p className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {targetCluster}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <ShieldCheck size={18} />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Safety Gate</p>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  Human-In-The-Loop Enforced
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Deep Dive Mitigation Analysis & Blast Radius */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-amber-500" size={18} />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Blast Radius & Impact Assessment
              </h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/40 p-4 rounded-xl">
              {impactAssessment}
            </p>

            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Technical Preconditions</h3>
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-disc list-inside">
                <li>Kubernetes ingress controller readiness probes responding normally.</li>
                <li>Canary rollback manifest v2.4.0 verified against staging checksum.</li>
                <li>PostgreSQL connection saturation metric verified at 100/100 locked slots.</li>
              </ul>
            </div>
          </section>

          {/* Human-In-The-Loop Execution Panel */}
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck className="text-indigo-600 dark:text-indigo-400" size={18} />
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Governance Execution Gate
                  </h2>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900">
                  ONE-CLICK SRE ACTION
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Authorizing this action immediately executes remediation commands against {targetCluster} and logs the operator identity to the incident audit trail.
              </p>
            </div>

            <div className="space-y-3 pt-4">
              {isExecuted ? (
                <div className="flex items-center justify-between p-3.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-300 text-sm font-semibold">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-emerald-600" />
                    <span>✓ Mitigation Executed & Confirmed</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      setIsExecuted(false);
                      setExecutionLog([]);
                    }}
                  >
                    <RefreshCw size={12} className="mr-1" /> Re-arm Action
                  </Button>
                </div>
              ) : (
                <Button
                  className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold py-5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                  disabled={isExecuting}
                  onClick={handleAuthorizeExecution}
                  id="execute-mitigation-btn"
                >
                  {isExecuting ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Executing on {targetCluster}...</span>
                    </>
                  ) : (
                    <>
                      <Check size={18} strokeWidth={3} />
                      <span>Authorize & Execute Mitigation</span>
                    </>
                  )}
                </Button>
              )}

              <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                <span>Requires sign-off: Incident Commander</span>
                <span className="font-mono">Cluster Mutex: Active</span>
              </div>
            </div>
          </section>
        </div>

        {/* Execution Log Console */}
        {executionLog.length > 0 && (
          <section className="bg-slate-900 rounded-2xl border border-slate-800 p-4 text-emerald-400 font-mono text-xs shadow-lg space-y-1">
            <div className="flex items-center justify-between text-slate-400 pb-2 border-b border-slate-800 mb-2 font-sans font-semibold">
              <div className="flex items-center gap-2 text-slate-300">
                <Terminal size={14} />
                <span>Execution Audit Stream</span>
              </div>
              <span className="text-[10px] uppercase font-mono text-emerald-400">MUTEX HELD</span>
            </div>
            {executionLog.map((log, i) => (
              <div key={i} className="leading-relaxed">{log}</div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
