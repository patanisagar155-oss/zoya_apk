import {
  AlarmClock,
  Camera,
  Flashlight,
  Grid2x2,
  MessageCircle,
  Music,
  Phone,
  Zap,
} from 'lucide-react';

export type CommandTileId =
  | 'CALL'
  | 'WHATSAPP'
  | 'ALARM'
  | 'TORCH'
  | 'MUSIC'
  | 'CAMERA'
  | 'FLASH'
  | 'APPS';

interface CommandTilesGridProps {
  torchActive: boolean;
  busyTile: CommandTileId | null;
  onTriggerTile: (tile: CommandTileId) => void;
}

const TILES: Array<{
  id: CommandTileId;
  label: string;
  subtitle: string;
  icon: typeof Phone;
}> = [
  { id: 'CALL', label: 'CALL', subtitle: 'Dialer', icon: Phone },
  { id: 'WHATSAPP', label: 'WHATSAPP', subtitle: 'Chats', icon: MessageCircle },
  { id: 'ALARM', label: 'ALARM', subtitle: 'Clocks', icon: AlarmClock },
  { id: 'TORCH', label: 'TORCH', subtitle: 'LED Light', icon: Flashlight },
  { id: 'MUSIC', label: 'MUSIC', subtitle: 'Spotify', icon: Music },
  { id: 'CAMERA', label: 'CAMERA', subtitle: 'Capture', icon: Camera },
  { id: 'FLASH', label: 'FLASH', subtitle: 'Strobe', icon: Zap },
  { id: 'APPS', label: 'APPS', subtitle: 'Launcher', icon: Grid2x2 },
];

export function CommandTilesGrid({
  torchActive,
  busyTile,
  onTriggerTile,
}: CommandTilesGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
      {TILES.map((tile) => {
        const Icon = tile.icon;
        const isActive = tile.id === 'TORCH' && torchActive;
        const isBusy = busyTile === tile.id;

        return (
          <button
            key={tile.id}
            type="button"
            disabled={isBusy}
            onClick={() => onTriggerTile(tile.id)}
            className={`group min-h-[76px] rounded-2xl border px-3.5 py-3 text-left transition-all flex flex-col justify-between relative overflow-hidden ${
              isActive
                ? 'bg-red-950/70 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]'
                : 'bg-[#090405]/95 border-red-950/80 hover:border-red-500/60 hover:bg-[#130608]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${
                  isActive
                    ? 'bg-red-600/30 border-red-400 text-red-200'
                    : 'bg-red-950/50 border-red-900/60 text-red-400 group-hover:text-red-300'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              {isActive && (
                <span className="text-[10px] font-mono text-red-300">ON</span>
              )}
            </div>

            <div className="mt-2.5">
              <div className="font-display text-xs font-semibold tracking-wider text-white">
                {tile.label}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {isBusy ? 'Running...' : tile.subtitle}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
