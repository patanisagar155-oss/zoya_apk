import { ShieldAlert, X } from 'lucide-react';
import { AndroidActionRequest } from '../types/zoya';

interface ActionConfirmModalProps {
  action: AndroidActionRequest | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ActionConfirmModal({
  action,
  onConfirm,
  onCancel,
}: ActionConfirmModalProps) {
  if (!action) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="zoya-confirm-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-[#0B0405] border border-red-900/70 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/35 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3
                id="zoya-confirm-title"
                className="font-display text-base font-semibold text-white"
              >
                Permission Confirmation
              </h3>
              <p className="text-xs text-slate-400">
                ZOYA never runs sensitive device actions without Sagar&apos;s approval.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-950/60 transition-colors"
            aria-label="Close confirmation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 rounded-xl bg-black border border-red-950 p-3.5 space-y-1">
          <div className="text-sm font-medium text-slate-100">{action.label}</div>
          {action.target && (
            <div className="text-xs font-mono text-red-300 break-all">
              Target: {action.target}
            </div>
          )}
          {action.details && (
            <div className="text-xs text-slate-400">{action.details}</div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-red-950 text-sm font-medium text-slate-300 hover:bg-red-950/30 transition-colors whitespace-nowrap shrink-0"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-sm font-medium text-white transition-all whitespace-nowrap shrink-0"
          >
            Allow & Run
          </button>
        </div>
      </div>
    </div>
  );
}
