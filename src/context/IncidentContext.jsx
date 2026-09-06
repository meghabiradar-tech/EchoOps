'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { mockIncidentData } from '../data/mockData';

const IncidentContext = createContext(null);

export function IncidentProvider({ children, initialChannel = 'echoops-war-room-042' }) {
  const [channelName, setChannelName] = useState(initialChannel);

  // 1. Incident Overview State (holds incidentId, title, summary, severity, status, environment, etc.)
  const [incident, setIncident] = useState({
    ...mockIncidentData.incident,
    incidentId: mockIncidentData.incident.id,
    channelName: initialChannel,
  });

  // 2. Impact Metrics State (holds activeImpact, estRevenueLoss, slaBreachIn, impactedTraffic)
  const [impactMetrics, setImpactMetrics] = useState({
    activeImpact: mockIncidentData.incident.impact,
    estRevenueLoss: mockIncidentData.incident.estimatedRevenueImpact,
    slaBreachIn: mockIncidentData.incident.slaTimeRemaining,
    impactedTraffic: mockIncidentData.incident.impactedCustomers,
    impactedCustomers: mockIncidentData.incident.impactedCustomers,
  });

  // 3. Real-time lists: timeline, alerts, confirmedFacts, hypotheses, actions
  const [timeline, setTimeline] = useState(mockIncidentData.timeline);
  const [facts, setFacts] = useState(mockIncidentData.facts);
  const [assumptions, setAssumptions] = useState(mockIncidentData.assumptions);
  const [actions, setActions] = useState(mockIncidentData.actions);
  const [alerts, setAlerts] = useState(mockIncidentData.alerts);

  // 4. Human-In-The-Loop Governance state (pendingAction)
  const [humanInTheLoop, setHumanInTheLoop] = useState({
    ...mockIncidentData.humanInTheLoop,
    isConfirmed: false,
    confirmedTime: null,
  });

  // 5. Live Audio Stream Synthesis Transcripts
  const [transcripts, setTranscripts] = useState(mockIncidentData.voiceStreamMock);

  // 6. War Room Metadata
  const [warRoomId, setWarRoomId] = useState(`WAR ROOM: ${initialChannel}`);
  const [respondersCount, setRespondersCount] = useState(4);
  const [isRehydrating, setIsRehydrating] = useState(false);

  // Cross-tab broadcast channel ref
  const broadcastRef = useRef(null);

  // Re-hydrate state from database on room load / join
  const rehydrateRoom = useCallback(async (targetChannel) => {
    const clean = (targetChannel || channelName || 'echoops-war-room-042').trim();
    setIsRehydrating(true);
    try {
      const res = await fetch(`/api/room/${encodeURIComponent(clean)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.incident) {
          const inc = data.incident;
          setIncident((prev) => ({
            ...prev,
            ...inc,
            incidentId: inc.id || prev.incidentId,
            channelName: clean,
          }));
          if (Array.isArray(inc.timeline) && inc.timeline.length > 0) {
            setTimeline(inc.timeline);
          }
          if (Array.isArray(inc.facts) && inc.facts.length > 0) {
            setFacts(inc.facts.map((f) => ({
              id: f.id,
              fact: f.statement,
              verifiedBy: f.verifiedBy,
              timestamp: f.timestamp,
              confidence: f.confidence ? 'Confirmed' : 'Unconfirmed',
            })));
          }
          if (Array.isArray(inc.actionItems) && inc.actionItems.length > 0) {
            setActions(inc.actionItems.map((a) => ({
              id: a.id,
              action: a.task,
              owner: {
                name: a.owner,
                role: 'Assigned Responder',
                initials: a.owner.slice(0, 2).toUpperCase(),
                color: '#4f46e5',
                bg: '#eef2ff',
              },
              status: (a.status || 'PENDING').toUpperCase(),
              updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            })));
          }
        }
        if (Array.isArray(data.transcripts) && data.transcripts.length > 0) {
          setTranscripts(data.transcripts.map((t) => ({
            speaker: t.speaker,
            text: t.text,
            time: t.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          })));
        }
      }
    } catch (err) {
      console.warn('[EchoOps] Room re-hydration note:', err);
    } finally {
      setIsRehydrating(false);
    }
  }, [channelName]);

  useEffect(() => {
    rehydrateRoom(channelName);
  }, [channelName, rehydrateRoom]);

  // Helpers
  const addTranscript = useCallback((entry) => {
    if (!entry || !entry.text) return;
    const now = new Date();
    const timeStr = entry.time || now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const newEntry = {
      speaker: entry.speaker || 'Operator',
      time: timeStr,
      text: entry.text,
    };
    setTranscripts((prev) => [...prev, newEntry].slice(-50));
    try {
      broadcastRef.current?.postMessage({ type: 'ADD_TRANSCRIPT', payload: newEntry });
    } catch {}

    // Persist to backend database
    void fetch(`/api/room/${encodeURIComponent(channelName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_transcript',
        transcript: newEntry,
      }),
    }).catch((err) => console.warn('Transcript async persist note:', err));
  }, [channelName]);

  const addTimelineEvent = useCallback((event) => {
    if (!event || !event.title) return;
    const now = new Date();
    const timeStr = event.time || now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newEvent = {
      id: event.id || `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      time: timeStr,
      title: event.title,
      description: event.description || '',
      source: event.source || 'EchoOps Voice AI',
      type: event.type || 'system',
      badge: event.badge || 'UPDATE',
    };
    setTimeline((prev) => [newEvent, ...prev]);
  }, []);

  const addFact = useCallback((factItem) => {
    if (!factItem || !factItem.fact) return;
    const now = new Date();
    const timeStr = factItem.timestamp || now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newFact = {
      id: factItem.id || `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fact: factItem.fact,
      verifiedBy: factItem.verifiedBy || 'EchoOps SRE Agent',
      timestamp: timeStr,
      confidence: factItem.confidence || 'Confirmed',
    };
    setFacts((prev) => [newFact, ...prev]);
  }, []);

  const addAssumption = useCallback((item) => {
    if (!item || !item.hypothesis) return;
    const newHypo = {
      id: item.id || `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      hypothesis: item.hypothesis,
      source: item.source || 'Voice AI Real-Time Correlation',
      status: item.status || 'Investigating',
      riskLevel: item.riskLevel || 'Medium',
    };
    setAssumptions((prev) => [newHypo, ...prev]);
  }, []);

  const addAction = useCallback((act) => {
    if (!act || !act.action) return;
    const now = new Date();
    const timeStr = act.updatedAt || now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newAction = {
      id: act.id || `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action: act.action,
      owner: act.owner || {
        name: 'EchoOps Commander',
        role: 'Automated SRE Engine',
        initials: 'EO',
        color: '#4f46e5',
        bg: '#eef2ff',
      },
      status: act.status || 'IN PROGRESS',
      updatedAt: timeStr,
    };
    setActions((prev) => [newAction, ...prev]);
  }, []);

  const updateActionStatus = useCallback((id, nextStatus) => {
    setActions((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            status: nextStatus,
            updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
        }
        return item;
      })
    );
  }, []);

  // Confirm Human-In-The-Loop action
  const confirmPendingAction = useCallback(() => {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    setHumanInTheLoop((prev) => ({
      ...prev,
      isConfirmed: true,
      confirmedTime: timeString,
    }));

    // Append to actions list as completed action
    addAction({
      action: humanInTheLoop.actionTitle + ' — ' + humanInTheLoop.actionSub,
      owner: {
        name: 'Incident Commander',
        role: 'Human Operator',
        initials: 'IC',
        color: '#059669',
        bg: '#ecfdf5',
      },
      status: 'COMPLETED',
      updatedAt: timeString,
    });

    // Append to timeline
    addTimelineEvent({
      title: `Human Approval: ${humanInTheLoop.actionTitle}`,
      description: `Action authorized by Incident Commander. Dispatched execution command to ${humanInTheLoop.targetCluster}.`,
      source: 'Human-in-the-Loop Governance',
      type: 'action',
      badge: 'ACTION EXECUTED',
    });
  }, [humanInTheLoop, addAction, addTimelineEvent]);

  const resetPendingAction = useCallback(() => {
    setHumanInTheLoop((prev) => ({
      ...prev,
      isConfirmed: false,
      confirmedTime: null,
    }));
  }, []);

  // Internal raw delta applier
  const rawApplyStateDelta = useCallback((delta) => {
    if (!delta || typeof delta !== 'object') return;

    // 1. Merge Incident Overview
    if (delta.incident && typeof delta.incident === 'object') {
      setIncident((prev) => ({
        ...prev,
        ...delta.incident,
        incidentId: delta.incident.incidentId || delta.incident.id || prev.incidentId || prev.id,
      }));
    }

    // 2. Merge Impact Metrics
    if (delta.impactMetrics && typeof delta.impactMetrics === 'object') {
      const activeImpact = delta.impactMetrics.activeImpact || delta.impactMetrics.impact;
      const estRevenueLoss = delta.impactMetrics.estRevenueLoss || delta.impactMetrics.estimatedRevenueImpact;
      const slaBreachIn = delta.impactMetrics.slaBreachIn || delta.impactMetrics.slaTimeRemaining;
      const impactedTraffic = delta.impactMetrics.impactedTraffic || delta.impactMetrics.impactedCustomers;

      setImpactMetrics((prev) => ({
        ...prev,
        ...delta.impactMetrics,
        ...(activeImpact ? { activeImpact } : {}),
        ...(estRevenueLoss ? { estRevenueLoss } : {}),
        ...(slaBreachIn ? { slaBreachIn } : {}),
        ...(impactedTraffic ? { impactedTraffic, impactedCustomers: impactedTraffic } : {}),
      }));

      setIncident((prev) => ({
        ...prev,
        impact: activeImpact || prev.impact,
        estimatedRevenueImpact: estRevenueLoss || prev.estimatedRevenueImpact,
        slaTimeRemaining: slaBreachIn || prev.slaTimeRemaining,
        impactedCustomers: impactedTraffic || prev.impactedCustomers,
      }));
    }

    // 3. New Timeline Events
    const eventsToAdd = delta.newTimelineEvents || (Array.isArray(delta.timeline) ? delta.timeline : null);
    if (Array.isArray(eventsToAdd)) {
      eventsToAdd.forEach((ev) => addTimelineEvent(ev));
    }

    // 4. New Confirmed Facts
    const factsToAdd = delta.newFacts || delta.confirmedFacts || (Array.isArray(delta.facts) ? delta.facts : null);
    if (Array.isArray(factsToAdd)) {
      factsToAdd.forEach((f) => addFact(f));
    }

    // 5. New Hypotheses
    const hypToAdd = delta.newHypotheses || delta.hypotheses || (Array.isArray(delta.assumptions) ? delta.assumptions : null);
    if (Array.isArray(hypToAdd)) {
      hypToAdd.forEach((h) => addAssumption(h));
    }

    // 6. New Actions
    const actionsToAdd = delta.newActions || (Array.isArray(delta.actions) ? delta.actions : null);
    if (Array.isArray(actionsToAdd)) {
      actionsToAdd.forEach((act) => addAction(act));
    }

    // 7. Updated Actions Statuses
    if (Array.isArray(delta.updatedActions)) {
      delta.updatedActions.forEach((upd) => {
        if (upd.id && upd.status) {
          updateActionStatus(upd.id, upd.status);
        }
      });
    }

    // 8. Alerts update
    if (delta.alerts && typeof delta.alerts === 'object') {
      setAlerts((prev) => ({
        ...prev,
        ...delta.alerts,
      }));
    }

    // 9. Pending Action (HITL) update
    const pendingActionUpdate = delta.pendingAction || delta.humanInTheLoop;
    if (pendingActionUpdate && typeof pendingActionUpdate === 'object') {
      setHumanInTheLoop((prev) => ({
        ...prev,
        ...pendingActionUpdate,
        isConfirmed: false,
        confirmedTime: null,
      }));
    }

    // 10. Responders count
    if (typeof delta.respondersCount === 'number') {
      setRespondersCount(delta.respondersCount);
    }

    // 11. SRE Incident Commander Severity update
    if (delta.severity) {
      setIncident((prev) => ({ ...prev, severity: delta.severity }));
    }

    // 12. SRE Incident Commander newConfirmedFact ({ text, verifiedVia, time })
    if (delta.newConfirmedFact && typeof delta.newConfirmedFact === 'object' && delta.newConfirmedFact.text) {
      addFact({
        fact: delta.newConfirmedFact.text,
        verifiedBy: delta.newConfirmedFact.verifiedVia || 'EchoOps SRE Agent',
        timestamp: delta.newConfirmedFact.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        confidence: 'Confirmed',
      });
    }

    // 13. SRE Incident Commander newHypothesis ({ status, risk, description, source })
    if (delta.newHypothesis && typeof delta.newHypothesis === 'object' && delta.newHypothesis.description) {
      addAssumption({
        hypothesis: delta.newHypothesis.description,
        source: delta.newHypothesis.source || 'Voice AI Real-Time Correlation',
        status: delta.newHypothesis.status || 'INVESTIGATING',
        riskLevel: delta.newHypothesis.risk || 'High',
      });
    }

    // 14. SRE Incident Commander recommendedAction ({ actionTitle, subtitle, impactAssessment, target })
    if (delta.recommendedAction && typeof delta.recommendedAction === 'object' && delta.recommendedAction.actionTitle) {
      const rec = delta.recommendedAction;
      const targetStr = rec.target || 'k8s-prod-useast1';
      const impactStr = rec.impactAssessment || 'High-priority mitigation command';
      const actionSubStr = rec.subtitle || `Target: ${targetStr}`;

      setHumanInTheLoop({
        actionTitle: rec.actionTitle,
        actionSub: actionSubStr,
        consequence: impactStr,
        impactAssessment: impactStr,
        targetCluster: targetStr,
        target: targetStr,
        requiresApprovalBy: 'Incident Commander (Human)',
        riskLevel: delta.severity || 'CRITICAL',
        isConfirmed: false,
        confirmedTime: null,
      });

      addAction({
        action: rec.actionTitle,
        target: targetStr,
        impactAssessment: impactStr,
        owner: {
          name: 'EchoOps Commander',
          role: 'SRE Engine',
          initials: 'EO',
          color: '#4f46e5',
          bg: '#eef2ff',
        },
        status: 'PENDING',
        updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });

      addTimelineEvent({
        title: `Mitigation Staged: ${rec.actionTitle}`,
        description: `Target: ${targetStr}. ${impactStr}`,
        source: 'EchoOps AI Commander',
        type: 'action',
        badge: 'ACTION STAGED',
      });
    }
  }, [addTimelineEvent, addFact, addAssumption, addAction, updateActionStatus]);

  // Public delta applier that also broadcasts cross-tab
  const applyStateDelta = useCallback((delta) => {
    rawApplyStateDelta(delta);
    try {
      broadcastRef.current?.postMessage({ type: 'STATE_DELTA', payload: delta });
    } catch {}
  }, [rawApplyStateDelta]);

  // Setup cross-tab BroadcastChannel
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    const bc = new BroadcastChannel('echoops-state-sync');
    broadcastRef.current = bc;

    bc.onmessage = (event) => {
      const msg = event?.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'STATE_DELTA' && msg.payload) {
        rawApplyStateDelta(msg.payload);
      } else if (msg.type === 'ADD_TRANSCRIPT' && msg.payload) {
        setTranscripts((prev) => [...prev, msg.payload].slice(-30));
      }
    };

    return () => {
      bc.close();
      broadcastRef.current = null;
    };
  }, [rawApplyStateDelta]);

  const value = {
    channelName,
    setChannelName,
    rehydrateRoom,
    isRehydrating,
    incident,
    setIncident,
    impactMetrics,
    setImpactMetrics,
    timeline,
    setTimeline,
    facts,
    confirmedFacts: facts,
    setFacts,
    setConfirmedFacts: setFacts,
    assumptions,
    hypotheses: assumptions,
    setAssumptions,
    setHypotheses: setAssumptions,
    actions,
    setActions,
    alerts,
    setAlerts,
    humanInTheLoop,
    pendingAction: humanInTheLoop,
    setHumanInTheLoop,
    setPendingAction: setHumanInTheLoop,
    transcripts,
    setTranscripts,
    warRoomId,
    setWarRoomId,
    respondersCount,
    setRespondersCount,
    addTranscript,
    addTimelineEvent,
    addFact,
    addAssumption,
    addAction,
    updateActionStatus,
    confirmPendingAction,
    resetPendingAction,
    applyStateDelta,
  };


  return (
    <IncidentContext.Provider value={value}>
      {children}
    </IncidentContext.Provider>
  );
}

export function useIncidentContext() {
  return useContext(IncidentContext);
}
