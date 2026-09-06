'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  Download,
  AlertTriangle,
  XCircle,
  Sparkles,
  ShieldX,
  CheckCircle2,
  Search,
  FileText,
  Flame,
  Activity,
  Layers,
} from 'lucide-react';
import { useIncidentContext } from '@/src/context/IncidentContext';
import { Button } from '@/components/ui/button';

interface TimelineDrilldownClientProps {
  channelName: string;
}

export function TimelineDrilldownClient({ channelName }: TimelineDrilldownClientProps) {
  const cleanChannel = decodeURIComponent(channelName).trim() || 'echoops-war-room-042';
  const context = useIncidentContext();

  const contextTimeline = context?.timeline;
  const timeline = useMemo(() => contextTimeline || [], [contextTimeline]);
  const incident = context?.incident || {};
  const facts = context?.facts || [];
  const hypotheses = context?.assumptions || [];
  const actions = context?.actions || [];

  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredTimeline = useMemo(() => {
    return timeline.filter((item) => {
      const matchesType = filterType === 'all' || item.type === filterType;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =

        !q ||
        item.title.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        item.source.toLowerCase().includes(q) ||
        item.badge.toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [timeline, filterType, searchQuery]);


  const getNodeIcon = (type?: string) => {
    switch (type) {
      case 'alert':
        return <AlertTriangle size={15} className="text-amber-500" />;
      case 'error':
        return <XCircle size={15} className="text-red-500" />;
      case 'system':
        return <Sparkles size={15} className="text-indigo-500" />;
      case 'warning':
        return <ShieldX size={15} className="text-orange-500" />;
      case 'action':
        return <CheckCircle2 size={15} className="text-emerald-500" />;
      default:
        return <Clock size={15} className="text-slate-400" />;
    }
  };

  const handleExportPostMortem = () => {
    const ts = new Date().toISOString();
    const mdLines: string[] = [];

    mdLines.push(`# Incident Post-Mortem: ${incident.title || cleanChannel}`);
    mdLines.push(`\n**Channel:** \`${cleanChannel}\`  `);
    mdLines.push(`**Severity:** ${incident.severity || 'HIGH'}  `);
    mdLines.push(`**Status:** ${incident.status || 'RESOLVED'}  `);
    mdLines.push(`**Generated:** ${ts}\n`);

    mdLines.push(`## Executive Summary`);
    mdLines.push(
      incident.summary ||
        'PostgreSQL connection pool saturation and upstream gateway timeouts caused 504 errors on checkout endpoints. Remediated via connection pool drain and rolling pod restart.',
    );
    mdLines.push(`\n`);

    mdLines.push(`## Established Facts (${facts.length})`);
    facts.forEach((f) => {
      mdLines.push(`- **[${f.timestamp || 'Verified'}]** ${f.fact} *(Verified by ${f.verifiedBy})*`);
    });
    mdLines.push(`\n`);

    mdLines.push(`## Hypotheses Investigated (${hypotheses.length})`);
    hypotheses.forEach((h) => {
      mdLines.push(`- **[${h.status || 'INVESTIGATED'}]** ${h.hypothesis} *(Risk: ${h.riskLevel || 'Medium'})*`);
    });
    mdLines.push(`\n`);

    mdLines.push(`## Action Items Executed (${actions.length})`);
    actions.forEach((a) => {
      mdLines.push(`- [x] **${a.action}** — Assigned to ${a.owner?.name || 'Commander'} [Status: ${a.status}]`);
    });
    mdLines.push(`\n`);

    mdLines.push(`## Chronological Event Timeline (${timeline.length} Events)`);
    timeline.forEach((item) => {
      mdLines.push(`### ${item.time} — ${item.title} [${item.badge || 'EVENT'}]`);
      if (item.description) mdLines.push(`> ${item.description}\n`);
      mdLines.push(`*Source:* \`${item.source}\` | *Category:* \`${item.type}\`\n`);
    });

    const blob = new Blob([mdLines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incident-post-mortem-${cleanChannel}-${Math.floor(Date.now() / 1000)}.md`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Navigation Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href={`/room/${encodeURIComponent(cleanChannel)}`}
            className="flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors bg-indigo-50 dark:bg-indigo-950/50 px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-900"
            id="back-to-war-room-timeline-btn"
          >
            <ArrowLeft size={16} />
            <span>← Back to Incident War Room</span>
          </Link>
          <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800" />
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
            <span>Room: {cleanChannel}</span>
            <span>/</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">Timeline & Post-Mortem</span>
          </div>
        </div>

        <Button
          onClick={handleExportPostMortem}
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 text-xs font-semibold"
          id="export-postmortem-btn"
        >
          <Download size={14} />
          <span>Export Post-Mortem (Markdown)</span>
        </Button>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 md:p-8 space-y-6">
        {/* Incident Summary Card */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">
                {incident.incidentId || incident.id || 'INC-8492'}
              </span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900 flex items-center gap-1">
                <Flame size={12} />
                SEVERITY: {incident.severity || 'HIGH'}
              </span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 flex items-center gap-1">
                <Activity size={12} />
                STATUS: {incident.status || 'ACTIVE'}
              </span>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {timeline.length} Chronological Events Recorded
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
            Post-Mortem & Timeline Drilldown: {incident.title || cleanChannel}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {incident.summary ||
              'Complete forensic event reconstruction with verified facts, root-cause assumptions, and remediation governance.'}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div>
              <span className="text-slate-400 font-medium">Verified Facts</span>
              <p className="text-base font-bold text-slate-800 dark:text-slate-200">{facts.length}</p>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Root Causes Correlated</span>
              <p className="text-base font-bold text-slate-800 dark:text-slate-200">{hypotheses.length}</p>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Assigned Mitigations</span>
              <p className="text-base font-bold text-slate-800 dark:text-slate-200">{actions.length}</p>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Incident MTTR Target</span>
              <p className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">&lt; 15 min</p>
            </div>
          </div>
        </section>

        {/* Filter and Search Bar */}
        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Type Filter Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
            <span className="text-xs text-slate-400 font-medium mr-1 flex items-center gap-1">
              <Layers size={13} /> Filters:
            </span>
            {[
              { id: 'all', label: 'All' },
              { id: 'alert', label: 'Alerts' },
              { id: 'action', label: 'Actions' },
              { id: 'error', label: 'Errors' },
              { id: 'system', label: 'System' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterType(f.id)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  filterType === f.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search timeline..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </section>

        {/* Chronological Timeline Stream */}
        <section className="space-y-4">
          {filteredTimeline.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400">
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold">No timeline events match your filter</p>
              <p className="text-xs mt-1">Try selecting &quot;All&quot; or clearing your search term.</p>
            </div>
          ) : (
            <div className="relative pl-6 border-l-2 border-indigo-200 dark:border-indigo-900/60 space-y-6">
              {filteredTimeline.map((item) => (
                <div key={item.id} className="relative group">
                  {/* Timeline Node Icon Pin */}
                  <div className="absolute -left-[35px] top-1.5 w-6 h-6 rounded-full bg-white dark:bg-slate-900 border-2 border-indigo-500 flex items-center justify-center shadow-sm">
                    {getNodeIcon(item.type)}
                  </div>

                  {/* Event Card */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          {item.time}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900">
                          {item.badge}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        Source: <span className="font-semibold text-slate-700 dark:text-slate-300">{item.source}</span>
                      </div>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {item.title}
                    </h3>
                    {item.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
