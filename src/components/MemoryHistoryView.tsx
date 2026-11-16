import { FormEvent, useState } from 'react';
import {
  Brain,
  MessageSquare,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Conversation, MemoryCategory, MemoryItem } from '../types/zoya';

interface MemoryHistoryViewProps {
  conversations: Conversation[];
  activeConversationId: string;
  memories: MemoryItem[];
  onSelectConversation: (id: string) => void;
  onNewConversation: () => Promise<void>;
  onDeleteConversation: (id: string) => Promise<void>;
  onAddMemory: (fact: string, category: MemoryCategory) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
  onClearMemories: () => Promise<void>;
}

const CATEGORIES: MemoryCategory[] = [
  'personal',
  'identity',
  'preference',
  'project',
  'task',
  'routine',
  'work',
  'note',
];

export function MemoryHistoryView({
  conversations,
  activeConversationId,
  memories,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onAddMemory,
  onDeleteMemory,
  onClearMemories,
}: MemoryHistoryViewProps) {
  const [newFact, setNewFact] = useState('');
  const [category, setCategory] = useState<MemoryCategory>('personal');
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      conv.title.toLowerCase().includes(q) ||
      conv.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  });

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!newFact.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onAddMemory(newFact.trim(), category);
      setNewFact('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-8">
      {/* Left Column: Conversation History */}
      <section className="lg:col-span-5 rounded-2xl bg-[#090405]/95 border border-red-950/90 p-5 flex flex-col">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-5 h-5 text-red-400" />
            <h2 className="font-display text-lg font-semibold text-white">
              Chat History
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void onNewConversation()}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-medium text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
        </div>

        <div className="relative mb-4">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search past conversations..."
            className="w-full min-h-[44px] pl-10 pr-4 rounded-xl bg-black border border-red-950 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-red-500"
          />
        </div>

        <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
          {filteredConversations.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">
              No matching conversations found.
            </p>
          ) : (
            filteredConversations.map((conv) => {
              const active = conv.id === activeConversationId;
              const lastMsg = conv.messages[conv.messages.length - 1];
              return (
                <div
                  key={conv.id}
                  className={`rounded-xl border p-3 transition-colors flex items-start justify-between gap-2 ${
                    active
                      ? 'bg-red-950/45 border-red-500/50'
                      : 'bg-black/80 border-red-950/70 hover:border-red-800/70'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conv.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="text-sm font-medium text-white truncate">
                      {conv.title}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 truncate">
                      {lastMsg?.content || 'Empty session'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
                      {conv.messages.length} messages ·{' '}
                      {new Date(conv.updatedAt).toLocaleDateString()}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeleteConversation(conv.id)}
                    className="min-w-[40px] min-h-[40px] rounded-lg flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-950/60 transition-colors shrink-0"
                    aria-label={`Delete conversation ${conv.title}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Right Column: ZOYA Memory Management */}
      <section className="lg:col-span-7 rounded-2xl bg-[#090405]/95 border border-red-950/90 p-5 flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <Brain className="w-5 h-5 text-red-400" />
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                ZOYA Memory
              </h2>
              <p className="text-xs text-slate-400">
                Persistent personal context ZOYA remembers for Sagar across sessions
              </p>
            </div>
          </div>

          {memories.length > 0 && (
            <div className="flex items-center gap-2">
              {confirmClear ? (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      await onClearMemories();
                      setConfirmClear(false);
                    }}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-medium text-white whitespace-nowrap"
                  >
                    Confirm Clear All
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-red-950/60 text-xs text-slate-300 whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-red-950 hover:border-red-500/50 text-xs font-medium text-slate-300 hover:text-red-300 transition-colors whitespace-nowrap"
                >
                  Clear Memory
                </button>
              )}
            </div>
          )}
        </div>

        {/* Add Memory Form */}
        <form onSubmit={handleAdd} className="mb-5 space-y-2.5">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={newFact}
              onChange={(e) => setNewFact(e.target.value)}
              placeholder="Teach ZOYA something about you..."
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-black border border-red-950 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-red-500"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as MemoryCategory)}
              aria-label="Memory category"
              className="min-h-[44px] px-3 rounded-xl bg-black border border-red-950 text-sm text-slate-200 focus:outline-none focus:border-red-500"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!newFact.trim() || submitting}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 disabled:opacity-45 text-sm font-medium text-white transition-all whitespace-nowrap shrink-0"
            >
              {submitting ? 'Saving...' : 'Remember'}
            </button>
          </div>
        </form>

        {/* Saved Memories List */}
        <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
          {memories.length === 0 ? (
            <div className="rounded-xl bg-black border border-red-950 p-6 text-center text-sm text-slate-400">
              No personal memories stored yet. Tell ZOYA something in chat or add one above.
            </div>
          ) : (
            memories.map((mem) => (
              <div
                key={mem.id}
                className="rounded-xl bg-black/85 border border-red-950/75 px-4 py-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-100 leading-relaxed">
                    {mem.fact}
                  </p>
                  <div className="text-xs text-slate-400 mt-1.5">
                    <span>{mem.category}</span>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span>{mem.source === 'auto' ? 'Learned from chat' : 'Added by Sagar'}</span>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      {new Date(mem.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void onDeleteMemory(mem.id)}
                  className="min-w-[40px] min-h-[40px] rounded-lg flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-950/60 transition-colors shrink-0"
                  aria-label="Delete memory"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
