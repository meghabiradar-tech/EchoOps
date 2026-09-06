'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ChevronDown,
  Search,
  Flame,
  Users,
  MessageSquare,
  Check,
  Plus,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import type { IncidentRoomSummary } from '@/lib/db/models';
import { useIncidentContext } from '@/src/context/IncidentContext';

interface IncidentSelectorDropdownProps {
  currentChannel?: string;
  onSelectIncident?: (channelName: string) => void;
  onOpenDirectory?: () => void;
}

export default function IncidentSelectorDropdown({
  currentChannel,
  onSelectIncident,
  onOpenDirectory,
}: IncidentSelectorDropdownProps) {
  const context = useIncidentContext();
  const activeChannel = currentChannel || context?.channelName || 'echoops-war-room-042';
  const activeIncident = context?.incident;

  const [isOpen, setIsOpen] = useState(false);
  const [rooms, setRooms] = useState<IncidentRoomSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'ACTIVE' | 'SEV1' | 'RESOLVED'>('ALL');

  // New room quick-launcher
  const [newChannelInput, setNewChannelInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch rooms from backend
  const fetchRooms = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/rooms');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.rooms)) {
          setRooms(data.rooms);
        }
      }
    } catch (err) {
      console.warn('Incident dropdown fetch note:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // Refetch when opened
  useEffect(() => {
    if (isOpen) {
      fetchRooms();
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, fetchRooms]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Current incident metadata
  const currentSummary = useMemo(() => {
    return rooms.find((r) => r.channelName === activeChannel);
  }, [rooms, activeChannel]);

  const displayTitle = activeIncident?.title || currentSummary?.incident?.title || 'Core API Elevated Latency & Database Saturation';
  const displaySeverity = activeIncident?.severity || currentSummary?.incident?.severity || 'Sev-1';
  const displayStatus = (activeIncident?.status || currentSummary?.incident?.status || 'investigating').toLowerCase();
  const isSev1 = String(displaySeverity).toUpperCase().includes('1');

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      const title = (r.incident.title || '').toLowerCase();
      const channel = (r.channelName || '').toLowerCase();
      const summary = (r.incident.summary || '').toLowerCase();
      const service = (r.incident.service || '').toLowerCase();
      const q = searchQuery.toLowerCase().trim();

      const matchesQuery = !q || title.includes(q) || channel.includes(q) || summary.includes(q) || service.includes(q);
      if (!matchesQuery) return false;

      if (filterTab === 'ACTIVE') return r.incident.status === 'investigating';
      if (filterTab === 'SEV1') return r.incident.severity === 'Sev-1';
      if (filterTab === 'RESOLVED') return r.incident.status === 'resolved';
      return true;
    });
  }, [rooms, searchQuery, filterTab]);

  const handleSelect = (channelName: string) => {
    if (onSelectIncident) {
      onSelectIncident(channelName);
    } else if (context?.switchIncident) {
      context.switchIncident(channelName);
    }
    setIsOpen(false);
  };

  const handleQuickCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newChannelInput.trim().replace(/\s+/g, '-').toLowerCase();
    if (!clean || isCreating) return;

    setIsCreating(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_room',
          channelName: clean,
          title: `Incident War Room #${clean}`,
          scenario: 'tech_outage',
          severity: 'Sev-1',
        }),
      });
      if (res.ok) {
        setNewChannelInput('');
        await fetchRooms();
        handleSelect(clean);
      }
    } catch (err) {
      console.warn('Quick create room note:', err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* 1. Trigger Button in Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
          isOpen
            ? 'bg-slate-800/95 border-indigo-500/80 shadow-lg shadow-indigo-500/10'
            : 'bg-slate-900/80 hover:bg-slate-800/90 border-slate-700/80 hover:border-slate-600'
        }`}
        id="header-incident-selector-btn"
        title="Click to browse and switch incident war rooms"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {/* Severity badge pill */}
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
            isSev1
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isSev1 ? 'bg-rose-400 animate-pulse' : 'bg-amber-400'}`} />
          <span>{displaySeverity}</span>
        </span>

        {/* Status Pill */}
        <span
          className={`hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
            displayStatus === 'investigating'
              ? 'bg-amber-500/15 text-amber-300'
              : displayStatus === 'resolved'
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-slate-800 text-slate-400'
          }`}
        >
          {displayStatus}
        </span>

        {/* Channel scope & Title */}
        <div className="flex items-center gap-1.5 text-left max-w-[180px] sm:max-w-[260px] md:max-w-[320px] truncate">
          <span className="font-mono text-indigo-400 font-bold shrink-0">#{activeChannel}</span>
          <span className="text-slate-600 hidden sm:inline">•</span>
          <span className="text-slate-200 font-semibold truncate hidden sm:inline" title={displayTitle}>
            {displayTitle}
          </span>
        </div>

        {/* Dropdown Chevron */}
        <ChevronDown
          size={14}
          className={`text-slate-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-indigo-400' : ''}`}
        />
      </button>

      {/* 2. Floating Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute left-0 mt-2 w-[340px] sm:w-[480px] rounded-2xl border border-slate-700/80 bg-[#0c121e]/98 backdrop-blur-xl shadow-2xl shadow-black/80 z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          role="menu"
          aria-label="Incident War Rooms Directory"
        >
          {/* Header */}
          <div className="p-3.5 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ShieldAlert size={14} className="text-indigo-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Select Incident War Room
                </h3>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {rooms.length} registered incident rooms • Live telemetry & history
              </p>
            </div>

            {onOpenDirectory && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenDirectory();
                }}
                className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-800/60 transition-colors"
                title="Open full incidents directory tab"
              >
                <span>Full Directory</span>
                <ExternalLink size={10} />
              </button>
            )}
          </div>

          {/* Search Input Bar */}
          <div className="p-3 border-b border-slate-800/80 bg-slate-950/40">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, channel, service, or issue..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/70 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all font-sans"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-white px-1"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 mt-2.5">
              {(['ALL', 'ACTIVE', 'SEV1', 'RESOLVED'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilterTab(tab)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                    filterTab === tab
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  {tab === 'ALL' && `All (${rooms.length})`}
                  {tab === 'ACTIVE' && `Active (${rooms.filter((r) => r.incident.status === 'investigating').length})`}
                  {tab === 'SEV1' && `Sev-1 (${rooms.filter((r) => r.incident.severity === 'Sev-1').length})`}
                  {tab === 'RESOLVED' && `Resolved (${rooms.filter((r) => r.incident.status === 'resolved').length})`}
                </button>
              ))}
            </div>
          </div>

          {/* Incident List */}
          <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-800/50 p-2 space-y-1">
            {isLoading && rooms.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent mb-2" />
                <p>Loading incident records...</p>
              </div>
            ) : filteredRooms.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No matching incident war rooms found for &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              filteredRooms.map((room) => {
                const isSelected = room.channelName === activeChannel;
                const isLive = room.incident.status === 'investigating';
                const roomSev1 = room.incident.severity === 'Sev-1';

                return (
                  <button
                    key={room.channelName}
                    type="button"
                    onClick={() => handleSelect(room.channelName)}
                    className={`w-full text-left p-2.5 rounded-xl transition-all flex items-start justify-between gap-3 group ${
                      isSelected
                        ? 'bg-indigo-950/50 border border-indigo-600/50 shadow-sm'
                        : 'hover:bg-slate-800/60 border border-transparent'
                    }`}
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      {/* Top Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            roomSev1
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          <Flame size={10} />
                          <span>{room.incident.severity}</span>
                        </span>

                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isLive
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                            }`}
                          />
                          <span>{isLive ? 'LIVE BRIDGE' : room.incident.status?.toUpperCase()}</span>
                        </span>

                        <span className="font-mono text-[10px] text-indigo-300 font-semibold">
                          #{room.channelName}
                        </span>

                        {isSelected && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-indigo-600 text-[9px] font-bold text-white uppercase tracking-wider">
                            Active
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h4 className="text-xs font-bold text-white group-hover:text-indigo-200 transition-colors line-clamp-1">
                        {room.incident.title}
                      </h4>

                      {/* Active Impact or Summary */}
                      <p className="text-[11px] text-slate-400 line-clamp-1">
                        {room.incident.activeImpact || room.incident.summary || 'Operational incident record'}
                      </p>

                      {/* Meta Footer */}
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 pt-0.5">
                        <span className="flex items-center gap-1">
                          <Users size={11} className="text-slate-400" />
                          <span>{room.incident.participants?.length || 3} Responders</span>
                        </span>
                        <span className="flex items-center gap-1 text-indigo-400 font-medium">
                          <MessageSquare size={11} />
                          <span>{room.transcriptsCount} turns</span>
                        </span>
                        {room.incident.service && (
                          <span className="text-slate-400 font-mono">
                            svc: {room.incident.service}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right action indicator */}
                    <div className="shrink-0 pt-1">
                      {isSelected ? (
                        <div className="h-6 w-6 rounded-full bg-indigo-600 flex items-center justify-center text-white shadow">
                          <Check size={13} strokeWidth={3} />
                        </div>
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-400 group-hover:text-white px-2 py-1 rounded bg-slate-800/80 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                          Switch →
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer Quick Launcher */}
          <form
            onSubmit={handleQuickCreate}
            className="p-3 border-t border-slate-800 bg-slate-950/70 flex items-center gap-2"
          >
            <input
              type="text"
              value={newChannelInput}
              onChange={(e) => setNewChannelInput(e.target.value)}
              placeholder="launch-new-war-room..."
              className="flex-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={!newChannelInput.trim() || isCreating}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-bold text-white transition-all shrink-0"
            >
              <Plus size={13} />
              <span>{isCreating ? 'Creating...' : 'New Room'}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
