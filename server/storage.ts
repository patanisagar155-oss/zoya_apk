import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  ChatMessage,
  Conversation,
  MemoryCategory,
  MemoryItem,
  ZoyaSettings,
  buildWelcomeMessage,
} from '../src/types/zoya.ts';

interface ZoyaStoreData {
  conversations: Conversation[];
  memories: MemoryItem[];
  settings: ZoyaSettings;
}

export interface CrossConversationSnippet {
  conversationId: string;
  title: string;
  updatedAt: string;
  excerpts: Array<{ role: 'user' | 'assistant'; content: string }>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'zoya-store.json');

const DEFAULT_SETTINGS: ZoyaSettings = {
  ownerName: 'Sagar',
  ownerNameConfirmed: false,
  preferredLanguage: 'auto',
  warmthLevel: 'warm',
  voiceEngine: 'gemini',
  voicePersona: 'Sulafat',
  speechRate: 1.0,
  speechVolume: 0.9,
  autoSpeak: true,
  continuousMode: false,
  confirmSensitiveActions: true,
  accessibilityConsentGranted: false,
  webSearchEnabled: true,
};

function createWelcomeConversation(ownerName = 'Sagar'): Conversation {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: 'Welcome Session',
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: buildWelcomeMessage(ownerName),
        timestamp: now,
        language: 'hi',
      },
    ],
  };
}

function getDefaultStore(): ZoyaStoreData {
  return {
    conversations: [createWelcomeConversation(DEFAULT_SETTINGS.ownerName)],
    memories: [
      {
        id: crypto.randomUUID(),
        fact: "User's preferred name is Sagar.",
        category: 'identity',
        createdAt: new Date().toISOString(),
        source: 'manual',
      },
      {
        id: crypto.randomUUID(),
        fact: 'Prefers warm, natural conversation in Hindi, Hinglish, Gujarati, and English.',
        category: 'preference',
        createdAt: new Date().toISOString(),
        source: 'manual',
      },
    ],
    settings: { ...DEFAULT_SETTINGS },
  };
}

function ensureStoreFile(): ZoyaStoreData {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const initial = getDefaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ZoyaStoreData>;
    const rawSettings: ZoyaSettings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) };
    const validPersonas = new Set(['Sulafat', 'Achernar', 'Leda']);
    if (!validPersonas.has(rawSettings.voicePersona)) {
      rawSettings.voicePersona =
        (rawSettings.voicePersona as string) === 'Zephyr' ? 'Achernar' : 'Sulafat';
    }
    if (!rawSettings.ownerName || !rawSettings.ownerName.trim()) {
      rawSettings.ownerName = 'Sagar';
    }
    return {
      conversations:
        Array.isArray(parsed.conversations) && parsed.conversations.length > 0
          ? parsed.conversations
          : [createWelcomeConversation(rawSettings.ownerName)],
      memories: Array.isArray(parsed.memories) ? parsed.memories : [],
      settings: rawSettings,
    };
  } catch {
    const fallback = getDefaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(fallback, null, 2), 'utf-8');
    return fallback;
  }
}

function writeStore(data: ZoyaStoreData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, STORE_PATH);
}

export function listConversations(): Conversation[] {
  const store = ensureStoreFile();
  return [...store.conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getConversation(id: string): Conversation | undefined {
  const store = ensureStoreFile();
  return store.conversations.find((c) => c.id === id);
}

export function createConversation(title?: string): Conversation {
  const store = ensureStoreFile();
  const conv = createWelcomeConversation(store.settings.ownerName);
  if (title && title.trim()) {
    conv.title = title.trim().slice(0, 80);
  }
  store.conversations.unshift(conv);
  writeStore(store);
  return conv;
}

export function appendMessagesToConversation(
  conversationId: string,
  newMessages: ChatMessage[],
  suggestedTitle?: string
): Conversation {
  const store = ensureStoreFile();
  let conv = store.conversations.find((c) => c.id === conversationId);
  if (!conv) {
    conv = createWelcomeConversation(store.settings.ownerName);
    conv.id = conversationId;
    store.conversations.unshift(conv);
  }
  conv.messages.push(...newMessages);
  conv.updatedAt = new Date().toISOString();
  if (
    suggestedTitle &&
    (conv.title === 'Welcome Session' || conv.title === 'New Conversation')
  ) {
    conv.title = suggestedTitle.trim().slice(0, 60);
  }
  writeStore(store);
  return conv;
}

export function updateActionStatusInConversation(
  conversationId: string,
  messageId: string,
  actionId: string,
  status: 'pending' | 'executed' | 'blocked_web' | 'denied' | 'failed',
  statusMessage?: string
): Conversation | null {
  const store = ensureStoreFile();
  const conv = store.conversations.find((c) => c.id === conversationId);
  if (!conv) return null;
  const msg = conv.messages.find((m) => m.id === messageId);
  if (!msg || !msg.actions) return conv;
  msg.actions = msg.actions.map((act) =>
    act.id === actionId
      ? { ...act, status, statusMessage: statusMessage ?? act.statusMessage }
      : act
  );
  conv.updatedAt = new Date().toISOString();
  writeStore(store);
  return conv;
}

export function deleteConversation(id: string): Conversation[] {
  const store = ensureStoreFile();
  store.conversations = store.conversations.filter((c) => c.id !== id);
  if (store.conversations.length === 0) {
    store.conversations.push(createWelcomeConversation(store.settings.ownerName));
  }
  writeStore(store);
  return listConversations();
}

export function listMemories(): MemoryItem[] {
  const store = ensureStoreFile();
  return [...store.memories].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function addMemory(
  fact: string,
  category: MemoryCategory = 'personal',
  source: 'auto' | 'manual' = 'manual'
): MemoryItem {
  const store = ensureStoreFile();
  const cleanFact = fact.trim().slice(0, 400);
  const duplicate = store.memories.find(
    (m) => m.fact.toLowerCase() === cleanFact.toLowerCase()
  );
  if (duplicate) {
    return duplicate;
  }
  const item: MemoryItem = {
    id: crypto.randomUUID(),
    fact: cleanFact,
    category,
    createdAt: new Date().toISOString(),
    source,
  };
  store.memories.unshift(item);
  writeStore(store);
  return item;
}

export function deleteMemory(id: string): MemoryItem[] {
  const store = ensureStoreFile();
  store.memories = store.memories.filter((m) => m.id !== id);
  writeStore(store);
  return listMemories();
}

export function deleteMemoryByQuery(query: string): MemoryItem | null {
  const store = ensureStoreFile();
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const idx = store.memories.findIndex((m) => m.fact.toLowerCase().includes(q));
  if (idx === -1) return null;
  const [removed] = store.memories.splice(idx, 1);
  writeStore(store);
  return removed;
}

export function clearMemories(): MemoryItem[] {
  const store = ensureStoreFile();
  store.memories = [];
  writeStore(store);
  return [];
}

function upsertIdentityNameMemory(store: ZoyaStoreData, name: string, source: 'auto' | 'manual'): MemoryItem {
  const canonicalPrefix = "user's preferred name is ";
  store.memories = store.memories.filter(
    (m) =>
      !(
        m.category === 'identity' &&
        m.fact.toLowerCase().startsWith(canonicalPrefix)
      )
  );
  const item: MemoryItem = {
    id: crypto.randomUUID(),
    fact: `User's preferred name is ${name}.`,
    category: 'identity',
    createdAt: new Date().toISOString(),
    source,
  };
  store.memories.unshift(item);
  return item;
}

export function savePreferredName(params: {
  name: string;
  explicitChangeRequested?: boolean;
}): {
  changed: boolean;
  savedName: string;
  reason: string;
  settings: ZoyaSettings;
  memory?: MemoryItem;
} {
  const store = ensureStoreFile();
  const cleanName = params.name
    .replace(/[^\p{L}\p{N}\s.'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);

  if (!cleanName) {
    return {
      changed: false,
      savedName: store.settings.ownerName,
      reason: 'Provided name was empty.',
      settings: store.settings,
    };
  }

  const currentName = (store.settings.ownerName || 'Sagar').trim();
  const isSameName = currentName.toLowerCase() === cleanName.toLowerCase();
  const isLocked = Boolean(store.settings.ownerNameConfirmed);

  if (isLocked && !isSameName && !params.explicitChangeRequested) {
    return {
      changed: false,
      savedName: currentName,
      reason: `Preferred name is already locked to "${currentName}". Do not overwrite it unless the user explicitly asks to change their saved name.`,
      settings: store.settings,
    };
  }

  store.settings = {
    ...store.settings,
    ownerName: cleanName,
    ownerNameConfirmed: true,
  };
  const memory = upsertIdentityNameMemory(store, cleanName, 'auto');
  writeStore(store);

  return {
    changed: true,
    savedName: cleanName,
    reason: isSameName
      ? `Confirmed and locked preferred name as ${cleanName} in permanent memory.`
      : `Updated preferred name permanently to ${cleanName}.`,
    settings: store.settings,
    memory,
  };
}

export function getCrossConversationContext(
  excludeConversationId: string,
  query: string,
  limit = 4
): CrossConversationSnippet[] {
  const store = ensureStoreFile();
  const pastConvs = store.conversations.filter(
    (c) =>
      c.id !== excludeConversationId &&
      c.messages.some((m) => m.role === 'user')
  );

  if (pastConvs.length === 0) return [];

  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9\u0900-\u097F\u0A80-\u0AFF]+/i)
    .filter((t) => t.length >= 3);

  const scored = pastConvs.map((conv, idx) => {
    const combinedText = `${conv.title} ${conv.messages
      .map((m) => m.content)
      .join(' ')}`.toLowerCase();
    let keywordHits = 0;
    for (const token of tokens) {
      if (combinedText.includes(token)) {
        keywordHits += 1;
      }
    }
    const recencyTs = new Date(conv.updatedAt).getTime();
    return {
      conv,
      score: keywordHits * 1_000_000_000 + recencyTs - idx,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ conv }) => ({
    conversationId: conv.id,
    title: conv.title,
    updatedAt: conv.updatedAt,
    excerpts: conv.messages
      .filter((m) => m.role === 'user' || !m.content.startsWith('Welcome '))
      .slice(-4)
      .map((m) => ({
        role: m.role,
        content: m.content.replace(/\s+/g, ' ').trim().slice(0, 220),
      })),
  }));
}

export function getSettings(): ZoyaSettings {
  const store = ensureStoreFile();
  return store.settings;
}

export function updateSettings(patch: Partial<ZoyaSettings>): ZoyaSettings {
  const store = ensureStoreFile();
  const nextOwnerName =
    typeof patch.ownerName === 'string' && patch.ownerName.trim()
      ? patch.ownerName.trim().slice(0, 40)
      : store.settings.ownerName;

  const ownerChangedOrExplicit =
    typeof patch.ownerName === 'string' && patch.ownerName.trim().length > 0;

  store.settings = {
    ...store.settings,
    ...patch,
    ownerName: nextOwnerName,
    ownerNameConfirmed: ownerChangedOrExplicit
      ? true
      : store.settings.ownerNameConfirmed,
    speechRate:
      typeof patch.speechRate === 'number'
        ? Math.min(1.5, Math.max(0.7, patch.speechRate))
        : store.settings.speechRate,
    speechVolume:
      typeof patch.speechVolume === 'number'
        ? Math.min(1, Math.max(0, patch.speechVolume))
        : store.settings.speechVolume,
  };

  if (ownerChangedOrExplicit) {
    upsertIdentityNameMemory(store, nextOwnerName, 'manual');
  }

  writeStore(store);
  return store.settings;
}
