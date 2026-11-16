export type ZoyaLanguage = 'auto' | 'en' | 'hi' | 'gu';

export type ZoyaVoiceEngine = 'gemini' | 'webspeech';

export type ZoyaVoicePersona = 'Sulafat' | 'Achernar' | 'Leda';

export type ZoyaState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type AndroidSettingKey =
  | 'wifi'
  | 'bluetooth'
  | 'display'
  | 'location'
  | 'sound'
  | 'battery'
  | 'application'
  | 'accessibility';

export type AndroidActionType =
  | 'launch_app'
  | 'open_settings'
  | 'system_action'
  | 'memory_saved'
  | 'memory_deleted';

export interface SearchSource {
  title: string;
  uri: string;
}

export interface AndroidActionRequest {
  id: string;
  type: AndroidActionType;
  label: string;
  appName?: string;
  packageName?: string;
  settingType?: AndroidSettingKey;
  actionType?: string;
  target?: string;
  details?: string;
  requiresConfirmation?: boolean;
  status: 'pending' | 'executed' | 'blocked_web' | 'denied' | 'failed';
  statusMessage?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  language?: string;
  searchSources?: SearchSource[];
  actions?: AndroidActionRequest[];
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export type MemoryCategory =
  | 'identity'
  | 'preference'
  | 'personal'
  | 'project'
  | 'task'
  | 'routine'
  | 'work'
  | 'note';

export interface MemoryItem {
  id: string;
  fact: string;
  category: MemoryCategory;
  createdAt: string;
  source: 'auto' | 'manual';
}

export interface ZoyaSettings {
  ownerName: string;
  ownerNameConfirmed?: boolean;
  preferredLanguage: ZoyaLanguage;
  warmthLevel: 'warm' | 'balanced' | 'concise';
  voiceEngine: ZoyaVoiceEngine;
  voicePersona: ZoyaVoicePersona;
  speechRate: number; // 0.7 to 1.5
  speechVolume: number; // 0.0 to 1.0
  autoSpeak: boolean;
  continuousMode: boolean;
  confirmSensitiveActions: boolean;
  accessibilityConsentGranted: boolean;
  webSearchEnabled: boolean;
}

export interface RuntimeCapabilities {
  isNativeAndroid: boolean;
  platform: 'android' | 'web';
  hasZoyaPlugin: boolean;
  hasWebSpeechRecognition: boolean;
  hasMediaRecorder: boolean;
  hasSpeechSynthesis: boolean;
  micPermission: 'granted' | 'denied' | 'prompt' | 'unknown';
  cameraPermission?: 'granted' | 'denied' | 'prompt' | 'unknown';
  accessibilityEnabled: boolean;
}

export interface AndroidAppShortcut {
  id: string;
  name: string;
  packageName: string;
  webFallbackUrl?: string;
  category: 'social' | 'media' | 'utility' | 'system';
  description: string;
}

export function buildWelcomeMessage(ownerName = 'Sagar'): string {
  const safeName = ownerName.trim() || 'Sagar';
  return `Welcome ${safeName} ❤️\nMain ZOYA hoon.\nBatao, aaj kya chal raha hai? Koi kaam ho ya bas baat karni ho, main yahin hoon.`;
}

export const ZOYA_WELCOME_MESSAGE = buildWelcomeMessage('Sagar');
