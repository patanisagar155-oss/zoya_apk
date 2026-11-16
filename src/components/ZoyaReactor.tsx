import { ZoyaState } from '../types/zoya';

interface ZoyaReactorProps {
  state: ZoyaState;
  audioLevel: number;
  size?: 'md' | 'lg';
  onCoreClick?: () => void;
}

const PARTICLES = [
  { top: '8%', left: '22%', delay: '0s', size: 'w-1.5 h-1.5' },
  { top: '16%', left: '82%', delay: '0.7s', size: 'w-1 h-1' },
  { top: '44%', left: '6%', delay: '1.3s', size: 'w-1 h-1' },
  { top: '52%', left: '94%', delay: '0.4s', size: 'w-1.5 h-1.5' },
  { top: '82%', left: '16%', delay: '1.8s', size: 'w-1 h-1' },
  { top: '86%', left: '78%', delay: '1.0s', size: 'w-1.5 h-1.5' },
  { top: '26%', left: '10%', delay: '2.2s', size: 'w-1 h-1' },
  { top: '72%', left: '89%', delay: '2.6s', size: 'w-1 h-1' },
];

export function ZoyaReactor({
  state,
  audioLevel,
  size = 'lg',
  onCoreClick,
}: ZoyaReactorProps) {
  const containerDims =
    size === 'md'
      ? 'w-52 h-52 sm:w-60 sm:h-60'
      : 'w-60 h-60 sm:w-72 sm:h-72';

  const coreScale =
    state === 'speaking' || state === 'listening'
      ? 1 + Math.min(0.24, audioLevel * 0.28)
      : state === 'thinking'
      ? 1.08
      : 1;

  const isListening = state === 'listening';
  const isSpeaking = state === 'speaking';
  const isThinking = state === 'thinking';

  return (
    <div
      className={`relative ${containerDims} flex items-center justify-center select-none mx-auto`}
    >
      {/* Ambient crimson & neon-red backdrop glow */}
      <div
        className={`absolute inset-3 rounded-full blur-3xl transition-opacity duration-300 pointer-events-none ${
          isListening
            ? 'bg-red-500/35 opacity-100'
            : isSpeaking
            ? 'bg-rose-500/40 opacity-100'
            : isThinking
            ? 'bg-red-700/35 opacity-95'
            : 'bg-red-800/20 opacity-75 animate-reactor-pulse'
        }`}
        aria-hidden="true"
      />

      {/* Subtle floating energy particles */}
      {PARTICLES.map((p, idx) => (
        <span
          key={idx}
          style={{
            top: p.top,
            left: p.left,
            animationDelay: p.delay,
          }}
          className={`absolute ${p.size} rounded-full bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.9)] animate-particle-float pointer-events-none`}
          aria-hidden="true"
        />
      ))}

      {/* Main Geometric Reactor SVG */}
      <svg
        viewBox="0 0 320 320"
        className="w-full h-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="zoyaCoreGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFF1F2" />
            <stop offset="28%" stopColor="#FF2E3B" />
            <stop offset="68%" stopColor="#991B1B" />
            <stop offset="100%" stopColor="rgba(69,10,10,0)" />
          </radialGradient>
          <linearGradient id="radarSweepGrad" x1="50%" y1="50%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,30,45,0.65)" />
            <stop offset="100%" stopColor="rgba(255,30,45,0)" />
          </linearGradient>
        </defs>

        {/* Crosshair radar axes */}
        <g stroke="rgba(239,68,68,0.22)" strokeWidth="1">
          <line x1="160" y1="6" x2="160" y2="314" strokeDasharray="3 6" />
          <line x1="6" y1="160" x2="314" y2="160" strokeDasharray="3 6" />
          <circle cx="160" cy="160" r="146" fill="none" stroke="rgba(220,38,38,0.16)" />
          <circle cx="160" cy="160" r="118" fill="none" stroke="rgba(220,38,38,0.14)" />
        </g>

        {/* Outer rotating segmented crimson ring */}
        <g
          className={
            isThinking || isListening ? 'animate-reactor-cw-fast' : 'animate-reactor-cw'
          }
          style={{ transformOrigin: '160px 160px' }}
        >
          <circle
            cx="160"
            cy="160"
            r="138"
            fill="none"
            stroke="#EF4444"
            strokeWidth="2"
            strokeDasharray="34 14 8 14"
            strokeOpacity="0.72"
          />
          <circle
            cx="160"
            cy="160"
            r="128"
            fill="none"
            stroke="#991B1B"
            strokeWidth="1.5"
            strokeDasharray="6 10"
            strokeOpacity="0.85"
          />
        </g>

        {/* Counter-rotating glowing hexagon + arc ring */}
        <g
          className="animate-reactor-ccw"
          style={{ transformOrigin: '160px 160px' }}
        >
          <circle
            cx="160"
            cy="160"
            r="106"
            fill="none"
            stroke="#FF1E2D"
            strokeWidth="2.5"
            strokeDasharray="55 25 18 25"
            strokeOpacity="0.85"
          />
          <polygon
            points="160,62 245,111 245,209 160,258 75,209 75,111"
            fill="none"
            stroke="#EF4444"
            strokeWidth="1.4"
            strokeOpacity="0.55"
          />
        </g>

        {/* Slow counter-rotating inner geometric hexagon */}
        <g
          className="animate-reactor-ccw-slow"
          style={{ transformOrigin: '160px 160px' }}
        >
          <polygon
            points="160,82 227,121 227,199 160,238 93,199 93,121"
            fill="rgba(127,29,29,0.12)"
            stroke="#F87171"
            strokeWidth="1.2"
            strokeDasharray="10 6"
            strokeOpacity="0.65"
          />
        </g>

        {/* Sweeping Radar Line */}
        <g
          className={isListening || isSpeaking ? 'animate-reactor-cw-fast' : 'animate-reactor-cw'}
          style={{ transformOrigin: '160px 160px' }}
        >
          <path
            d="M160,160 L160,22 A138,138 0 0,1 258,63 Z"
            fill="url(#radarSweepGrad)"
            opacity={isListening || isSpeaking || isThinking ? 0.42 : 0.2}
          />
          <line
            x1="160"
            y1="160"
            x2="160"
            y2="22"
            stroke="#FF1E2D"
            strokeWidth="1.5"
            strokeOpacity="0.8"
          />
        </g>

        {/* Central Energy Core */}
        <g
          style={{
            transform: `scale(${coreScale})`,
            transformOrigin: '160px 160px',
            transition: 'transform 120ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <circle cx="160" cy="160" r="56" fill="url(#zoyaCoreGrad)" opacity="0.7" />
          <circle
            cx="160"
            cy="160"
            r="38"
            fill="#0A0203"
            stroke="#FF1E2D"
            strokeWidth="2.5"
          />
          <circle
            cx="160"
            cy="160"
            r="24"
            fill="none"
            stroke="#FCA5A5"
            strokeWidth="1.2"
            strokeDasharray="4 4"
            opacity="0.85"
          />
          <circle
            cx="160"
            cy="160"
            r={isSpeaking || isListening ? 12 : 9}
            fill="#FF1E2D"
          />
        </g>
      </svg>

      {/* Interactive central core trigger */}
      {onCoreClick && (
        <button
          type="button"
          onClick={onCoreClick}
          aria-label="Activate ZOYA voice core"
          className="absolute w-24 h-24 rounded-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 bg-transparent"
        />
      )}
    </div>
  );
}
