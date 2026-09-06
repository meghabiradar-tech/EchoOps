'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Radio,
  Search,
  Plus,
  MessageSquare,
  Clock,
  Flame,
  Users,
  Download,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldAlert,
  Layers,
  Copy,
  Check,
  RefreshCw,
  LayoutDashboard,
} from 'lucide-react';
import type { IncidentRoomSummary, StoredTranscriptEntry } from '@/lib/db/models';

type FilterTab = 'ALL' | 'ACTIVE' | 'RESOLVED' | 'SEV1';

export interface IncidentRoomsDirectoryProps {
  onSelectIncident?: (channelName: string) => void;
}

export function IncidentRoomsDirectory({ onSelectIncident }: IncidentRoomsDirectoryProps = {}) {
  const router = useRouter();
  const [rooms, setRooms] = useState<IncidentRoomSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<FilterTab>('ALL');
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [copiedChannel, setCopiedChannel] = useState<string | null>(null);

  // New room launcher input state
  const [newRoomChannel, setNewRoomChannel] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  // Fetch rooms list from API
  const fetchRooms = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (data && Array.isArray(data.rooms)) {
        // Merge with any local offline transcripts from localStorage
        const enhancedRooms = data.rooms.map((room: IncidentRoomSummary) => {
          if (typeof window === 'undefined') return room;
          try {
            const localSaved = window.localStorage.getItem(`echoops_room_transcripts_${room.channelName}`);
            if (localSaved) {
              const parsed = JSON.parse(localSaved);
              if (Array.isArray(parsed) && parsed.length > (room.transcripts?.length || 0)) {
                return {
                  ...room,
                  transcripts: parsed.map((p: { uid?: string; text: string; createdAt?: number; speaker?: string }, idx: number) => ({
                    id: `local-${idx}`,
                    channelName: room.channelName,
                    speaker: p.speaker || (String(p.uid) === '0' ? 'You (Human Operator)' : 'EchoOps AI Commander'),
                    text: p.text,
                    time: p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent',
                  })),
                  transcriptsCount: parsed.length,
                };
              }
            }
          } catch {}
          return room;
        });

        setRooms(enhancedRooms);
      }
    } catch (err: unknown) {
      const e = err as Error;
      console.warn('[EchoOps] Error fetching rooms:', e);
      setError(e.message || 'Failed to load incident rooms');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // Toggle transcript expansion for a room card
  const toggleExpandRoom = (channelName: string) => {
    setExpandedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(channelName)) {
        next.delete(channelName);
      } else {
        next.add(channelName);
      }
      return next;
    });
  };

  // Copy channel ID to clipboard
  const handleCopyChannel = (channel: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(channel);
    setCopiedChannel(channel);
    setTimeout(() => setCopiedChannel(null), 1800);
  };

  // Rejoin room trigger
  const handleRejoinRoom = (channelName: string, inNewTab = true) => {
    const clean = encodeURIComponent(channelName.trim());
    const targetUrl = `/room/${clean}`;
    if (inNewTab && typeof window !== 'undefined') {
      try {
        const opened = window.open(targetUrl, '_blank', 'noopener,noreferrer');
        if (!opened || opened.closed) router.push(targetUrl);
      } catch {
        router.push(targetUrl);
      }
    } else {
      router.push(targetUrl);
    }
  };

  // Create and launch custom war room
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newRoomChannel.trim().replace(/\s+/g, '-').toLowerCase();
    if (!clean) return;

    setIsCreatingRoom(true);
    try {
      await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_room',
          channelName: clean,
          title: `War Room: ${clean}`,
          severity: 'Sev-2',
          status: 'investigating',
        }),
      });
      setNewRoomChannel('');
      handleRejoinRoom(clean, true);
    } catch (err) {
      console.error('Error creating room:', err);
      handleRejoinRoom(clean, true);
    } finally {
      setIsCreatingRoom(false);
    }
  };

  // Export room conversation as Markdown
  const handleExportConversation = (room: IncidentRoomSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    const lines: string[] = [];
    lines.push(`# Incident War Room Conversation Log — ${room.channelName}`);
    lines.push(`**Title:** ${room.incident.title}`);
    lines.push(`**Severity:** ${room.incident.severity} • **Status:** ${room.incident.status}`);
    lines.push(`**Exported At:** ${new Date().toISOString()}`);
    lines.push('');
    lines.push('## Full Conversation History');
    lines.push('');

    if (room.transcripts.length === 0) {
      lines.push('*No recorded voice turns in this room yet.*');
    } else {
      room.transcripts.forEach((turn: StoredTranscriptEntry) => {
        lines.push(`### [${turn.time}] ${turn.speaker}`);
        lines.push(`> ${turn.text}`);
        lines.push('');
      });
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incident-convo-${room.channelName}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  };

  // Filtered rooms calculation
  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      // 1. Tab filter
      if (selectedFilter === 'ACTIVE' && room.incident.status !== 'investigating') return false;
      if (selectedFilter === 'RESOLVED' && room.incident.status !== 'resolved') return false;
      if (selectedFilter === 'SEV1' && room.incident.severity !== 'Sev-1') return false;

      // 2. Search query filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        room.channelName.toLowerCase().includes(q) ||
        room.incident.title.toLowerCase().includes(q) ||
        room.transcripts.some((t) => t.text.toLowerCase().includes(q)) ||
        room.transcripts.some((t) => t.speaker.toLowerCase().includes(q))
      );
    });
  }, [rooms, selectedFilter, searchQuery]);

  // Total summary stats
  const totalTurnsAllRooms = useMemo(
    () => rooms.reduce((acc, r) => acc + (r.transcriptsCount || 0), 0),
    [rooms],
  );
  const activeRoomsCount = useMemo(
    () => rooms.filter((r) => r.incident.status === 'investigating').length,
    [rooms],
  );

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* 1. Header Overview & Stats */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 p-6 shadow-xl backdrop-blur">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Radio size={12} className="animate-pulse text-indigo-400" />
              <span>Multi-Room Incident Management</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>Incident War Rooms & Conversation Archive</span>
            </h1>
            <p className="text-xs text-slate-400 max-w-2xl">
              Browse all past and active war room sessions, inspect full conversation transcripts, and rejoin any room with historical context preserved.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchRooms}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors"
              title="Refresh Room List"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              <span>Sync Rooms</span>
            </button>

            <Link
              href="/"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 text-xs font-semibold text-slate-200 border border-slate-700 hover:bg-slate-700 transition-colors"
            >
              <span>Back to Dashboard</span>
            </Link>
          </div>
        </div>

        {/* Global Metric Chips */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Rooms</div>
            <div className="mt-1 text-xl font-bold text-white font-mono">{rooms.length}</div>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3">
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Active Bridges</span>
            </div>
            <div className="mt-1 text-xl font-bold text-emerald-400 font-mono">{activeRoomsCount}</div>
          </div>
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3">
            <div className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">Conversation Turns</div>
            <div className="mt-1 text-xl font-bold text-indigo-300 font-mono">{totalTurnsAllRooms}</div>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-3">
            <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">Context Memory</div>
            <div className="mt-1 text-xl font-bold text-amber-300 font-mono">100% Persisted</div>
          </div>
        </div>
      </div>

      {/* 2. Search, Filter Toolbar & Launch New Room */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Search & Filter Tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rooms, incident titles, or transcripts..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setSelectedFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                selectedFilter === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({rooms.length})
            </button>
            <button
              onClick={() => setSelectedFilter('ACTIVE')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                selectedFilter === 'ACTIVE'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Active ({rooms.filter((r) => r.incident.status === 'investigating').length})
            </button>
            <button
              onClick={() => setSelectedFilter('SEV1')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                selectedFilter === 'SEV1'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sev-1 ({rooms.filter((r) => r.incident.severity === 'Sev-1').length})
            </button>
            <button
              onClick={() => setSelectedFilter('RESOLVED')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                selectedFilter === 'RESOLVED'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Resolved
            </button>
          </div>
        </div>

        {/* 3. Launch Custom War Room */}
        <form onSubmit={handleCreateRoom} className="flex items-center gap-2">
          <input
            type="text"
            value={newRoomChannel}
            onChange={(e) => setNewRoomChannel(e.target.value)}
            placeholder="new-incident-room-id"
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-48"
          />
          <button
            type="submit"
            disabled={!newRoomChannel.trim() || isCreatingRoom}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition-all shrink-0"
          >
            <Plus size={14} />
            <span>{isCreatingRoom ? 'Launching...' : 'Launch Room'}</span>
          </button>
        </form>
      </div>

      {/* 4. Room List */}
      {isLoading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-12 text-center text-slate-400 text-xs">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent mb-3" />
          <p>Syncing incident war rooms & conversation records...</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-6 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={fetchRooms} className="underline hover:text-white">
            Retry
          </button>
        </div>
      ) : filteredRooms.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400 space-y-3">
          <div className="h-10 w-10 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
            <Search size={18} />
          </div>
          <p className="text-sm font-semibold text-slate-300">No matching incident rooms found</p>
          <p className="text-xs max-w-sm mx-auto text-slate-500">
            Try adjusting your search query or launch a new custom war room above.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRooms.map((room) => {
            const isExpanded = expandedRooms.has(room.channelName);
            const isLive = room.incident.status === 'investigating';
            const isSev1 = room.incident.severity === 'Sev-1';

            return (
              <div
                key={room.channelName}
                className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                  isLive
                    ? 'border-indigo-900/60 bg-slate-900/80 shadow-lg hover:border-indigo-700/80'
                    : 'border-slate-800/80 bg-slate-900/50 hover:border-slate-700'
                }`}
              >
                {/* Room Card Main Body */}
                <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    {/* Channel badge + status */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          isLive
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                          }`}
                        />
                        <span>{isLive ? 'LIVE BRIDGE' : 'RESOLVED'}</span>
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          isSev1
                            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        <Flame size={11} />
                        <span>{room.incident.severity}</span>
                      </span>

                      <button
                        type="button"
                        onClick={(e) => handleCopyChannel(room.channelName, e)}
                        className="inline-flex items-center gap-1 font-mono text-[11px] text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-800/70 px-2 py-0.5 rounded transition-colors"
                        title="Click to copy channel ID"
                      >
                        <span>{room.channelName}</span>
                        {copiedChannel === room.channelName ? (
                          <Check size={11} className="text-emerald-400" />
                        ) : (
                          <Copy size={11} className="opacity-60" />
                        )}
                      </button>

                      <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock size={11} />
                        <span>Started: {new Date(room.incident.startedAt).toLocaleDateString()}</span>
                      </span>
                    </div>

                    {/* Room Title & Scenario */}
                    <div>
                      <h2 className="text-base font-bold text-white tracking-tight">
                        {room.incident.title}
                      </h2>
                      {room.incident.summary && (
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                          {room.incident.summary}
                        </p>
                      )}
                    </div>

                    {/* Participants & Conversation Metric */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
                      <div className="flex items-center gap-1.5">
                        <Users size={13} className="text-slate-500" />
                        <span>Responders ({room.incident.participants?.length || 3}):</span>
                        <div className="flex items-center gap-1">
                          {(room.incident.participants || []).slice(0, 3).map((p, i) => (
                            <span
                              key={i}
                              className="inline-block px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 border border-slate-700 font-medium"
                            >
                              {p.name}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-indigo-300 font-medium">
                        <MessageSquare size={13} />
                        <span>{room.transcriptsCount} conversation turns recorded</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div className="flex flex-wrap lg:flex-col items-center lg:items-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (onSelectIncident) {
                          onSelectIncident(room.channelName);
                        } else {
                          router.push(`/?channel=${encodeURIComponent(room.channelName)}`);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-md shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95"
                      title="Load incident, previous history, and live telemetry into Cockpit"
                    >
                      <LayoutDashboard size={13} />
                      <span>Open in Cockpit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRejoinRoom(room.channelName, true)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 shadow transition-all hover:scale-105 active:scale-95"
                    >
                      <Radio size={13} className="text-indigo-400" />
                      <span>{isLive ? 'Voice Room' : 'Archived Voice'}</span>
                      <ExternalLink size={12} className="opacity-60" />
                    </button>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/room/${encodeURIComponent(room.channelName)}/timeline`}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-800 bg-slate-900 text-[11px] font-medium text-slate-300 hover:text-white transition-colors"
                        title="View Timeline Drilldown"
                      >
                        <Layers size={12} />
                        <span>Timeline</span>
                      </Link>

                      <button
                        type="button"
                        onClick={(e) => handleExportConversation(room, e)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-800 bg-slate-900 text-[11px] font-medium text-slate-300 hover:text-white transition-colors"
                        title="Export Conversation as Markdown"
                      >
                        <Download size={12} />
                        <span>Export</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleExpandRoom(room.channelName)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-indigo-900/60 bg-indigo-950/30 text-[11px] font-medium text-indigo-300 hover:text-white transition-colors"
                      >
                        <span>{isExpanded ? 'Hide History' : 'View History'}</span>
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 5. Expandable Conversation History Drawer */}
                {isExpanded && (
                  <div className="border-t border-slate-800 bg-slate-950/70 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare size={14} className="text-indigo-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">
                          Full Incident Conversation History ({room.transcripts.length} turns)
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Saved in PostgreSQL & Local Buffer
                      </span>
                    </div>

                    {room.transcripts.length === 0 ? (
                      <div className="text-xs text-slate-500 py-4 text-center italic">
                        No verbal turns recorded in this session yet.
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto space-y-2.5 pr-2">
                        {room.transcripts.map((turn, i) => {
                          const isAI =
                            turn.speaker.includes('AI') ||
                            turn.speaker.includes('Commander') ||
                            turn.speaker.includes('EchoOps');
                          const isUser =
                            turn.speaker.includes('Operator') ||
                            turn.speaker.includes('You') ||
                            turn.speaker.includes('Engineer');

                          return (
                            <div
                              key={turn.id || i}
                              className={`p-3 rounded-xl border text-xs leading-relaxed ${
                                isAI
                                  ? 'bg-purple-950/20 border-purple-800/40 text-purple-200 ml-4'
                                  : isUser
                                  ? 'bg-indigo-950/20 border-indigo-800/40 text-indigo-200 mr-4'
                                  : 'bg-slate-900 border-slate-800 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1 text-[10px] font-semibold opacity-75">
                                <span
                                  className={
                                    isAI
                                      ? 'text-purple-400 font-bold'
                                      : isUser
                                      ? 'text-indigo-400 font-bold'
                                      : 'text-amber-400'
                                  }
                                >
                                  {turn.speaker}
                                </span>
                                <span className="font-mono">{turn.time}</span>
                              </div>
                              <p className="whitespace-pre-wrap">{turn.text}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
