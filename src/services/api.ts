import {
  ChatMessage,
  Conversation,
  MemoryCategory,
  MemoryItem,
  RuntimeCapabilities,
  ZoyaSettings,
  ZoyaVoicePersona,
} from '../types/zoya';
import { cacheLocalPreferences } from '../native/zoyaAndroidBridge';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem('zoya_api_base_url');
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
  }
  const envBase = import.meta.env?.VITE_API_BASE_URL;
  return typeof envBase === 'string' && envBase.trim()
    ? envBase.trim().replace(/\/+$/, '')
    : '';
}

export class ApiError extends Error {
  status: number;
  code?: string;
  fallbackToWebSpeech?: boolean;

  constructor(
    message: string,
    status: number,
    code?: string,
    fallbackToWebSpeech?: boolean
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fallbackToWebSpeech = fallbackToWebSpeech;
  }
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const fullUrl = url.startsWith('http') ? url : `${getApiBaseUrl()}${url}`;
  const res = await fetch(fullUrl, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
    fallbackToWebSpeech?: boolean;
  };
  if (!res.ok) {
    throw new ApiError(
      data.error || `Request failed (${res.status})`,
      res.status,
      data.code,
      data.fallbackToWebSpeech
    );
  }
  return data;
}

export async function fetchInitialWorkspace(): Promise<{
  conversations: Conversation[];
  memories: MemoryItem[];
  settings: ZoyaSettings;
}> {
  const [convRes, memRes, setRes] = await Promise.all([
    requestJson<{ conversations: Conversation[] }>('/api/conversations'),
    requestJson<{ memories: MemoryItem[] }>('/api/memories'),
    requestJson<{ settings: ZoyaSettings }>('/api/settings'),
  ]);

  await Promise.all([
    cacheLocalPreferences('zoya_settings', setRes.settings),
    cacheLocalPreferences('zoya_memories', memRes.memories),
  ]);

  return {
    conversations: convRes.conversations,
    memories: memRes.memories,
    settings: setRes.settings,
  };
}

export async function createNewConversation(title?: string): Promise<Conversation> {
  const res = await requestJson<{ conversation: Conversation }>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
  return res.conversation;
}

export async function removeConversation(id: string): Promise<Conversation[]> {
  const res = await requestJson<{ conversations: Conversation[] }>(
    `/api/conversations/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
  return res.conversations;
}

export async function sendZoyaChat(params: {
  conversationId: string;
  message: string;
  runtime: RuntimeCapabilities;
}): Promise<{
  conversation: Conversation;
  assistantMessage: ChatMessage;
  memories?: MemoryItem[];
  settings?: ZoyaSettings;
}> {
  return requestJson('/api/zoya/chat', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function sendZoyaVision(params: {
  conversationId: string;
  imageBase64: string;
  mimeType: string;
  prompt: string;
  runtime: RuntimeCapabilities;
}): Promise<{
  conversation: Conversation;
  assistantMessage: ChatMessage;
}> {
  return requestJson('/api/zoya/vision', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function patchActionStatus(params: {
  conversationId: string;
  messageId: string;
  actionId: string;
  status: 'pending' | 'executed' | 'blocked_web' | 'denied' | 'failed';
  statusMessage?: string;
}): Promise<Conversation> {
  const res = await requestJson<{ conversation: Conversation }>(
    `/api/conversations/${encodeURIComponent(params.conversationId)}/actions/${encodeURIComponent(
      params.actionId
    )}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        messageId: params.messageId,
        status: params.status,
        statusMessage: params.statusMessage,
      }),
    }
  );
  return res.conversation;
}

export async function createMemory(
  fact: string,
  category: MemoryCategory
): Promise<MemoryItem[]> {
  const res = await requestJson<{ memories: MemoryItem[] }>('/api/memories', {
    method: 'POST',
    body: JSON.stringify({ fact, category }),
  });
  await cacheLocalPreferences('zoya_memories', res.memories);
  return res.memories;
}

export async function removeMemory(id: string): Promise<MemoryItem[]> {
  const res = await requestJson<{ memories: MemoryItem[] }>(
    `/api/memories/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
  await cacheLocalPreferences('zoya_memories', res.memories);
  return res.memories;
}

export async function wipeAllMemories(): Promise<MemoryItem[]> {
  const res = await requestJson<{ memories: MemoryItem[] }>('/api/memories', {
    method: 'DELETE',
  });
  await cacheLocalPreferences('zoya_memories', res.memories);
  return res.memories;
}

export async function saveSettings(patch: Partial<ZoyaSettings>): Promise<ZoyaSettings> {
  const res = await requestJson<{ settings: ZoyaSettings }>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  await cacheLocalPreferences('zoya_settings', res.settings);
  return res.settings;
}

export async function fetchGeminiTtsAudio(
  text: string,
  voicePersona: ZoyaVoicePersona,
  preferredLanguage?: string
): Promise<{
  audioBase64: string;
  mimeType: string;
  voiceUsed?: string;
  languageCode?: string;
}> {
  return requestJson('/api/zoya/tts', {
    method: 'POST',
    body: JSON.stringify({ text, voicePersona, preferredLanguage }),
  });
}

export async function transcribeAudioBlob(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const audioBase64 = btoa(binary);
  const res = await requestJson<{ transcript: string }>('/api/zoya/transcribe', {
    method: 'POST',
    body: JSON.stringify({
      audioBase64,
      mimeType: blob.type || 'audio/webm',
    }),
  });
  return res.transcript;
}
