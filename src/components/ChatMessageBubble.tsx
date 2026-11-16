import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Globe,
  Smartphone,
  Square,
  Volume2,
  XCircle,
} from 'lucide-react';
import { AndroidActionRequest, ChatMessage } from '../types/zoya';
import { ANDROID_APP_SHORTCUTS } from '../native/zoyaAndroidBridge';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isSpeakingThis: boolean;
  onSpeakMessage: (message: ChatMessage) => void;
  onStopSpeaking: () => void;
  onRetryAction: (messageId: string, action: AndroidActionRequest) => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function ChatMessageBubble({
  message,
  isSpeakingThis,
  onSpeakMessage,
  onStopSpeaking,
  onRetryAction,
}: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[92%] sm:max-w-[80%] rounded-2xl px-4 py-3.5 transition-colors ${
          isUser
            ? 'bg-gradient-to-br from-red-700/25 via-rose-900/20 to-red-950/35 border border-red-500/30 text-slate-100'
            : 'bg-[#090405]/95 backdrop-blur-md border border-red-950/80 text-slate-100'
        }`}
      >
        {/* Unboxed header metadata */}
        <div className="flex items-center justify-between gap-4 mb-1.5 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="font-display font-semibold tracking-wide text-red-200">
              {isUser ? 'SAGAR' : 'ZOYA'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums font-mono text-[11px]">
              {formatTime(message.timestamp)}
            </span>
          </div>

          {!isUser && (
            <button
              type="button"
              onClick={() =>
                isSpeakingThis ? onStopSpeaking() : onSpeakMessage(message)
              }
              className="min-h-[36px] px-2 -mr-1.5 rounded-lg inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-red-950/60 transition-colors whitespace-nowrap shrink-0"
              aria-label={isSpeakingThis ? 'Stop speaking' : 'Listen to ZOYA'}
            >
              {isSpeakingThis ? (
                <>
                  <Square className="w-3.5 h-3.5 text-red-400 fill-red-400" />
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-red-400" />
                  <span>Listen</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Message body */}
        <div className="prose prose-invert prose-sm max-w-none leading-relaxed text-[15px] text-slate-100 prose-p:my-1.5 prose-pre:bg-black prose-pre:border prose-pre:border-red-950 prose-pre:rounded-xl prose-code:text-red-300 prose-a:text-red-400">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Native Android / Memory Action Results */}
        {message.actions && message.actions.length > 0 && (
          <div className="mt-3 pt-3 border-t border-red-950/80 space-y-2">
            {message.actions.map((action) => {
              const webFallback = action.appName
                ? ANDROID_APP_SHORTCUTS.find(
                    (a) => a.name.toLowerCase() === action.appName?.toLowerCase()
                  )?.webFallbackUrl
                : undefined;

              return (
                <div
                  key={action.id}
                  className="rounded-xl bg-black/80 border border-red-950/70 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    {action.status === 'executed' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : action.status === 'denied' || action.status === 'failed' ? (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    ) : action.status === 'blocked_web' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    ) : (
                      <Smartphone className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-100 truncate">
                        {action.label}
                      </div>
                      {action.statusMessage && (
                        <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                          {action.statusMessage}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {action.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => onRetryAction(message.id, action)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0"
                      >
                        Run on Android
                      </button>
                    )}
                    {action.status === 'blocked_web' && webFallback && (
                      <a
                        href={webFallback}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-red-950/60 border border-red-800/50 hover:bg-red-900/60 text-xs font-medium text-red-100 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                      >
                        <span>Open Web</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Grounded Internet Search Sources */}
        {message.searchSources && message.searchSources.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-red-950/80">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
              <Globe className="w-3.5 h-3.5 text-red-400" />
              <span>Sources</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {message.searchSources.slice(0, 5).map((source) => (
                <a
                  key={source.uri}
                  href={source.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-red-300 hover:text-red-200 underline underline-offset-2 inline-flex items-center gap-1 max-w-[220px] truncate"
                >
                  <span className="truncate">{source.title}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
