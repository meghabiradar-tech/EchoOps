'use client';

import React from 'react';
import Header from './components/Header';
import ActiveIncidentCard from './components/ActiveIncidentCard';
import IncidentTimeline from './components/IncidentTimeline';
import FactsCard from './components/FactsCard';
import AssumptionsCard from './components/AssumptionsCard';
import ActionOwnership from './components/ActionOwnership';
import AlertsSection from './components/AlertsSection';
import HumanInTheLoop from './components/HumanInTheLoop';
import VoiceTranscriptStream from './components/VoiceTranscriptStream';
import { IncidentProvider, useIncidentContext } from './context/IncidentContext';
import './App.css';

function DashboardContent({ voiceSlot, liveTranscripts, headerRightSlot } = {}) {
  return (
    <div className="app-layout">
      {/* 1. HEADER with EchoOps, Voice AI Commander, and LIVE status */}
      <Header rightSlot={headerRightSlot} />

      <main className="dashboard-container">
        {/* Voice Commander War Room Slot (when active or prompt) */}
        {voiceSlot}

        {/* 2. ACTIVE INCIDENT HERO: Dynamic overview, severity, status & metrics */}
        <ActiveIncidentCard />

        {/* 2-Column Responsive Dashboard Layout */}
        <div className="dashboard-grid">
          {/* Left Column: Investigation, Timeline & Actions */}
          <div className="grid-col">
            {/* 3. INCIDENT TIMELINE: Chronological events with timestamps */}
            <IncidentTimeline />

            {/* 6. ACTION & OWNERSHIP: Dynamic action items & interactive status toggle */}
            <ActionOwnership />

            {/* 8. HUMAN-IN-THE-LOOP: Dynamic pending action & approval gate */}
            <HumanInTheLoop />
          </div>

          {/* Right Column: Intelligence, Alerts, Facts & Assumptions */}
          <div className="grid-col">
            {/* 7. ALERTS: Dynamic Conflict, Gap, and Risk alerts */}
            <AlertsSection />

            {/* 4. FACTS: Dynamic confirmed information */}
            <FactsCard />

            {/* 5. ASSUMPTIONS: Dynamic unconfirmed information clearly labeled */}
            <AssumptionsCard />

            {/* VOICE AI REAL-TIME SYNTHESIS STREAM */}
            <VoiceTranscriptStream transcripts={liveTranscripts} />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App(props = {}) {
  // If an IncidentContext is already present in the component tree (e.g. from RootLayout),
  // render directly. Otherwise wrap with IncidentProvider so it is completely self-contained.
  try {
    const existingCtx = useIncidentContext();
    if (existingCtx) {
      return <DashboardContent {...props} />;
    }
  } catch {
    // No parent IncidentProvider
  }

  return (
    <IncidentProvider>
      <DashboardContent {...props} />
    </IncidentProvider>
  );
}
