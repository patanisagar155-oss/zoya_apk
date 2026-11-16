import { useState } from 'react';
import { ZoyaState } from '../types/zoya';
import zoyaPortraitUrl from '../assets/images/zoya_avatar_portrait_1794835305323.jpg';

interface ZoyaAvatarProps {
  state: ZoyaState;
  audioLevel: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const PORTRAIT_URL = zoyaPortraitUrl;

export function ZoyaAvatar({ state, audioLevel, size = 'lg' }: ZoyaAvatarProps) {
  const [imgError, setImgError] = useState(false);

  const dims =
    size === 'sm'
      ? 'w-11 h-11'
      : size === 'md'
      ? 'w-20 h-20'
      : size === 'xl'
      ? 'w-44 h-44 sm:w-52 sm:h-52'
      : 'w-28 h-28 sm:w-32 sm:h-32';

  const dynamicScale =
    state === 'speaking' || state === 'listening'
      ? 1 + Math.min(0.16, audioLevel * 0.18)
      : 1;

  const ringGradient =
    state === 'listening'
      ? 'from-red-500 via-rose-500 to-red-700 opacity-95'
      : state === 'speaking'
      ? 'from-rose-400 via-red-500 to-red-700 opacity-95'
      : state === 'thinking'
      ? 'from-red-600 via-crimson-700 to-red-900 opacity-85'
      : 'from-red-700/65 via-rose-600/45 to-red-950/60 opacity-75';

  return (
    <div className={`relative inline-flex items-center justify-center ${dims} shrink-0`}>
      {/* Ambient neon-red reactive halo */}
      <div
        className={`absolute -inset-3 rounded-full bg-gradient-to-tr ${ringGradient} blur-2xl transition-opacity duration-300 ${
          state === 'idle' ? 'animate-reactor-pulse' : ''
        }`}
        style={{
          transform: `scale(${dynamicScale})`,
        }}
        aria-hidden="true"
      />

      {/* Rotating crimson orbital ring */}
      <div
        className={`absolute -inset-[4px] rounded-full bg-gradient-to-tr from-red-500/85 via-rose-400/50 to-red-900/85 animate-reactor-cw ${
          state === 'idle' ? 'opacity-50' : 'opacity-95'
        }`}
        aria-hidden="true"
      />

      {/* Portrait container */}
      <div className="relative w-full h-full rounded-full overflow-hidden bg-black border border-red-500/40 shadow-[0_0_32px_rgba(220,38,38,0.3)]">
        {!imgError ? (
          <img
            src={PORTRAIT_URL}
            alt="ZOYA AI Companion Portrait"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover object-top select-none"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-950 via-black to-rose-950">
            <span className="font-display text-3xl font-semibold tracking-tight text-red-200">
              Z
            </span>
          </div>
        )}
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-red-950/15 pointer-events-none"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
