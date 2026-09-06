'use client';

import { useMemo } from 'react';

export type BotVisualizerState = 'idle' | 'processing' | 'speaking' | 'interrupted';

type BotAudioVisualizerProps = {
  isSpeaking: boolean;
  isProcessing?: boolean;
  isInterrupted?: boolean;
  botName?: string;
  className?: string;
};

export function BotAudioVisualizer({
  isSpeaking,
  isProcessing = false,
  isInterrupted = false,
  botName = 'EchoOps AI Commander',
  className = '',
}: BotAudioVisualizerProps) {
  const currentState: BotVisualizerState = useMemo(() => {
    if (isInterrupted) return 'interrupted';
    if (isSpeaking) return 'speaking';
    if (isProcessing) return 'processing';
    return 'idle';
  }, [isSpeaking, isProcessing, isInterrupted]);

  const stateConfig = useMemo(() => {
    switch (currentState) {
      case 'speaking':
        return {
          label: 'Speaking',
          tagColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
          ringColor: 'stroke-emerald-500',
          glowClass: 'shadow-[0_0_30px_rgba(16,185,129,0.35)]',
          avatarBg: 'from-emerald-950 via-slate-900 to-slate-950',
          accentColor: '#10b981',
        };
      case 'processing':
        return {
          label: 'Triaging...',
          tagColor: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
          ringColor: 'stroke-cyan-500',
          glowClass: 'shadow-[0_0_30px_rgba(6,182,212,0.35)]',
          avatarBg: 'from-cyan-950 via-slate-900 to-slate-950',
          accentColor: '#06b6d4',
        };
      case 'interrupted':
        return {
          label: 'Interrupted',
          tagColor: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
          ringColor: 'stroke-rose-500',
          glowClass: 'shadow-[0_0_25px_rgba(244,63,94,0.35)]',
          avatarBg: 'from-rose-950 via-slate-900 to-slate-950',
          accentColor: '#f43f5e',
        };
      case 'idle':
      default:
        return {
          label: 'Monitoring Bridge',
          tagColor: 'text-slate-400 bg-slate-800/40 border-slate-700/50',
          ringColor: 'stroke-slate-700',
          glowClass: 'shadow-none',
          avatarBg: 'from-slate-900 via-slate-950 to-black',
          accentColor: '#64748b',
        };
    }
  }, [currentState]);

  // Equalizer bar heights animation factors
  const barDelays = [0, 150, 300, 450, 200, 350, 100, 250, 400];

  return (
    <div
      className={`relative flex flex-col items-center justify-center p-6 ${className}`}
      role="img"
      aria-label={`${botName} status: ${stateConfig.label}`}
    >
      {/* Visualizer Aura Outer Rings (Pure SVG / CSS) */}
      <div className="relative flex items-center justify-center">
        {/* Animated Radial Pulse Ring */}
        {currentState === 'speaking' && (
          <>
            <span className="absolute h-40 w-40 rounded-full border border-emerald-500/30 animate-ping duration-1000" />
            <span className="absolute h-48 w-48 rounded-full border border-emerald-500/15 animate-pulse duration-700" />
          </>
        )}
        {currentState === 'processing' && (
          <span className="absolute h-40 w-40 rounded-full border border-cyan-500/40 animate-spin border-t-transparent duration-700" />
        )}

        {/* Central Glowing Shield / Avatar */}
        <div
          className={`relative z-10 flex h-28 w-28 items-center justify-center rounded-2xl bg-gradient-to-br ${stateConfig.avatarBg} border border-slate-700/80 p-3 transition-all duration-300 ${stateConfig.glowClass}`}
        >
          {/* SVG Vector SRE Commander Avatar (Zero image assets) */}
          <svg
            className="h-16 w-16"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            {/* Hexagonal Outer Chassis */}
            <path
              d="M32 4L56 18V46L32 60L8 46V18L32 4Z"
              stroke={stateConfig.accentColor}
              strokeWidth="2.5"
              strokeLinejoin="round"
              className="transition-colors duration-300"
            />
            {/* Inner HUD Circuit Lines */}
            <path
              d="M32 12V24M20 32H26M38 32H44M32 40V52"
              stroke={stateConfig.accentColor}
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.6"
            />
            {/* Robotic Eye Sensor / Equalizer Core */}
            <circle
              cx="32"
              cy="32"
              r="7"
              fill={stateConfig.accentColor}
              className={`transition-colors duration-300 ${currentState === 'speaking' ? 'animate-pulse' : ''}`}
            />
            <circle
              cx="32"
              cy="32"
              r="11"
              stroke={stateConfig.accentColor}
              strokeWidth="1.5"
              strokeDasharray="4 2"
              className={currentState === 'processing' ? 'animate-spin origin-center' : ''}
            />
          </svg>
        </div>
      </div>

      {/* SVG Multi-Bar Equalizer Display */}
      <div
        className="mt-5 flex h-10 items-end justify-center gap-1.5 px-4"
        aria-hidden="true"
      >
        {barDelays.map((delay, idx) => {
          let heightClass = 'h-1.5';
          let animClass = '';
          if (currentState === 'speaking') {
            animClass = 'animate-equalizer';
            heightClass = idx % 2 === 0 ? 'h-7' : 'h-10';
          } else if (currentState === 'processing') {
            animClass = 'animate-pulse';
            heightClass = 'h-3';
          } else if (currentState === 'interrupted') {
            heightClass = 'h-1.5';
          }

          return (
            <span
              key={idx}
              className={`w-1.5 rounded-full transition-all duration-300 ${heightClass} ${animClass}`}
              style={{
                backgroundColor: stateConfig.accentColor,
                animationDelay: `${delay}ms`,
                opacity: currentState === 'idle' ? 0.35 : 0.95,
              }}
            />
          );
        })}
      </div>

      {/* State & Commander Identity Badge */}
      <div className="mt-4 flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-wide text-foreground">
            {botName}
          </span>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${stateConfig.tagColor}`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: stateConfig.accentColor }}
            />
            {stateConfig.label}
          </span>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground">
          Autonomous Incident SRE Commander • Voice & Bridge AI
        </span>
      </div>

      {/* CSS Keyframes */}
      <style jsx>{`
        @keyframes equalizer {
          0%, 100% {
            transform: scaleY(0.25);
          }
          50% {
            transform: scaleY(1);
          }
        }
        .animate-equalizer {
          animation: equalizer 0.85s ease-in-out infinite alternate;
          transform-origin: bottom;
        }
      `}</style>
    </div>
  );
}

export default BotAudioVisualizer;
