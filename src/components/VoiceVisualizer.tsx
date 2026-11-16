import { ZoyaState } from '../types/zoya';

interface VoiceVisualizerProps {
  state: ZoyaState;
  audioLevel: number;
}

const BAR_WEIGHTS = [
  0.32, 0.45, 0.62, 0.78, 0.55, 0.88, 0.96, 0.7, 0.85, 1.0, 0.74, 0.92,
  0.92, 0.74, 1.0, 0.85, 0.7, 0.96, 0.88, 0.55, 0.78, 0.62, 0.45, 0.32,
];

export function VoiceVisualizer({ state, audioLevel }: VoiceVisualizerProps) {
  const isActive = state === 'listening' || state === 'speaking' || state === 'thinking';

  return (
    <div
      className="flex items-center justify-center gap-1 h-9 px-2"
      aria-label={`Voice state: ${state}`}
    >
      {BAR_WEIGHTS.map((weight, idx) => {
        const baseScale =
          state === 'idle'
            ? 0.16
            : state === 'thinking'
            ? 0.25 + ((idx % 3) * 0.15)
            : Math.max(0.2, Math.min(1, weight * (0.35 + audioLevel * 0.95)));

        const colorClass =
          state === 'listening'
            ? 'from-red-600 to-rose-400'
            : state === 'speaking'
            ? 'from-rose-600 via-red-500 to-orange-400'
            : state === 'thinking'
            ? 'from-red-800 to-red-400'
            : 'from-red-950/70 to-red-900/50';

        return (
          <span
            key={idx}
            className={`w-[3px] h-8 rounded-full bg-gradient-to-t ${colorClass} transition-transform duration-100 origin-center`}
            style={{
              transform: `scaleY(${isActive ? baseScale : 0.16})`,
              opacity: isActive ? 0.95 : 0.45,
            }}
          />
        );
      })}
    </div>
  );
}
