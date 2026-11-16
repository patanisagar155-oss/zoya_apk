import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  Grid2x2,
  History,
  Home,
  Mic,
  MicOff,
  Plus,
  Radio,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  AndroidActionRequest,
  ChatMessage,
  Conversation,
  MemoryCategory,
  MemoryItem,
  RuntimeCapabilities,
  ZoyaSettings,
  ZoyaState,
  buildWelcomeMessage,
} from './types/zoya';
import {
  createMemory,
  createNewConversation,
  fetchInitialWorkspace,
  patchActionStatus,
  removeConversation,
  removeMemory,
  saveSettings,
  sendZoyaChat,
  wipeAllMemories,
} from './services/api';
import {
  ZoyaNativeResult,
  cacheLocalPreferences,
  detectRuntimeCapabilities,
  executeNativeSystemAction,
  launchNativeApp,
  openNativeAndroidSettings,
  toggleDeviceTorch,
} from './native/zoyaAndroidBridge';
import { useZoyaVoice } from './hooks/useZoyaVoice';
import { ZoyaReactor } from './components/ZoyaReactor';
import { ZoyaAvatar } from './components/ZoyaAvatar';
import { VoiceVisualizer } from './components/VoiceVisualizer';
import { CommandTileId, CommandTilesGrid } from './components/CommandTilesGrid';
import { ChatMessageBubble } from './components/ChatMessageBubble';
import { AndroidControlView } from './components/AndroidControlView';
import { MemoryHistoryView } from './components/MemoryHistoryView';
import { SettingsView } from './components/SettingsView';
import { LiveVisionView } from './components/LiveVisionView';
import { ActionConfirmModal } from './components/ActionConfirmModal';
import { CameraPreviewModal, DialerModal } from './components/QuickToolModals';

type MainTab = 'home' | 'voice' | 'commands' | 'history' | 'apps';
type SecondaryScreen = 'companion' | 'settings' | 'vision' | null;

const DEFAULT_SETTINGS: ZoyaSettings = {
  ownerName: 'Sagar',
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

const QUICK_STARTERS = [
  'Aaj ka weather aur top tech news batao',
  'Explain quantum computing in simple Hindi',
  'Mene Gujarati ma ek motivational quote lakhine aap',
  'Help me debug a TypeScript async race condition',
];

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [secondaryScreen, setSecondaryScreen] = useState<SecondaryScreen>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [settings, setSettings] = useState<ZoyaSettings>(DEFAULT_SETTINGS);
  const [runtime, setRuntime] = useState<RuntimeCapabilities>({
    isNativeAndroid: false,
    platform: 'web',
    hasZoyaPlugin: false,
    hasWebSpeechRecognition: false,
    hasMediaRecorder: false,
    hasSpeechSynthesis: false,
    micPermission: 'unknown',
    accessibilityEnabled: false,
  });

  const [inputText, setInputText] = useState('');
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isThinking, setIsThinking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [torchActive, setTorchActive] = useState(false);
  const [busyTile, setBusyTile] = useState<CommandTileId | null>(null);
  const [tileFeedback, setTileFeedback] = useState<{
    tile: string;
    result: ZoyaNativeResult;
    webUrl?: string;
  } | null>(null);
  const [dialerOpen, setDialerOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [pendingConfirmAction, setPendingConfirmAction] = useState<{
    conversationId: string;
    messageId: string;
    action: AndroidActionRequest;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const isHoldActiveRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const secondaryScreenRef = useRef<SecondaryScreen>(null);
  const liveVisionVoiceHandlerRef = useRef<((transcript: string) => Promise<void>) | null>(null);

  useEffect(() => {
    secondaryScreenRef.current = secondaryScreen;
  }, [secondaryScreen]);

  const activeConversation = useMemo(
    () =>
      conversations.find((c) => c.id === activeConversationId) ?? conversations[0],
    [activeConversationId, conversations]
  );

  // Effective settings apply live mute without overwriting saved volume preference
  const effectiveVoiceSettings = useMemo<ZoyaSettings>(
    () => ({
      ...settings,
      speechVolume: isMuted ? 0 : settings.speechVolume,
    }),
    [isMuted, settings]
  );

  const refreshRuntime = useCallback(async () => {
    const caps = await detectRuntimeCapabilities();
    setRuntime(caps);
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const [workspace, caps] = await Promise.all([
          fetchInitialWorkspace(),
          detectRuntimeCapabilities(),
        ]);
        if (!active) return;
        setConversations(workspace.conversations);
        setActiveConversationId(workspace.conversations[0]?.id ?? '');
        setMemories(workspace.memories);
        setSettings(workspace.settings);
        setRuntime(caps);
      } catch (err) {
        if (!active) return;
        setErrorBanner(
          err instanceof Error ? err.message : 'Unable to connect to ZOYA backend.'
        );
      } finally {
        if (active) setIsLoadingInitial(false);
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, []);

  const executeDeviceAction = useCallback(
    async (
      conversationId: string,
      messageId: string,
      action: AndroidActionRequest
    ) => {
      let res;
      if (action.type === 'launch_app') {
        res = await launchNativeApp(
          action.packageName || '',
          action.appName || action.label
        );
      } else if (action.type === 'open_settings' && action.settingType) {
        res = await openNativeAndroidSettings(action.settingType);
      } else if (action.type === 'system_action') {
        res = await executeNativeSystemAction({
          actionType: action.actionType || '',
          target: action.target || '',
          details: action.details,
        });
      } else {
        return;
      }

      const nextStatus = res.success
        ? 'executed'
        : res.executedOn === 'web_browser'
        ? 'blocked_web'
        : 'failed';

      try {
        const updatedConv = await patchActionStatus({
          conversationId,
          messageId,
          actionId: action.id,
          status: nextStatus,
          statusMessage: res.message,
        });
        setConversations((prev) =>
          prev.map((c) => (c.id === updatedConv.id ? updatedConv : c))
        );
      } catch {
        // Ignore persistence patch failure
      }
    },
    []
  );

  const processPendingActions = useCallback(
    async (conversationId: string, assistantMsg: ChatMessage) => {
      if (!assistantMsg.actions || assistantMsg.actions.length === 0) return;
      for (const action of assistantMsg.actions) {
        if (action.status !== 'pending') continue;
        if (action.requiresConfirmation || settings.confirmSensitiveActions) {
          if (
            action.type === 'system_action' ||
            action.settingType === 'accessibility'
          ) {
            setPendingConfirmAction({
              conversationId,
              messageId: assistantMsg.id,
              action,
            });
            break;
          }
        }
        await executeDeviceAction(conversationId, assistantMsg.id, action);
      }
    },
    [executeDeviceAction, settings.confirmSensitiveActions]
  );

  const handleSendRef = useRef<(text: string, fromVoice?: boolean) => Promise<void>>(
    async () => {}
  );

  const voice = useZoyaVoice({
    settings: effectiveVoiceSettings,
    onFinalTranscript: (transcript) => {
      if (
        secondaryScreenRef.current === 'vision' &&
        liveVisionVoiceHandlerRef.current
      ) {
        void liveVisionVoiceHandlerRef.current(transcript);
        return;
      }
      void handleSendRef.current(transcript, true);
    },
    onVoiceError: (msg) => setErrorBanner(msg),
  });

  const handleSendMessage = useCallback(
    async (rawText: string, fromVoice = false) => {
      const text = rawText.trim();
      if (!text || isThinking) return;

      voice.stopSpeaking();
      setErrorBanner(null);
      setInputText('');
      setIsThinking(true);

      const currentId = activeConversation?.id ?? activeConversationId;
      const optimisticUserMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentId
            ? { ...c, messages: [...c.messages, optimisticUserMsg] }
            : c
        )
      );

      try {
        const res = await sendZoyaChat({
          conversationId: currentId,
          message: text,
          runtime,
        });

        setConversations((prev) => {
          const exists = prev.some((c) => c.id === res.conversation.id);
          if (!exists) return [res.conversation, ...prev];
          return prev.map((c) =>
            c.id === res.conversation.id ? res.conversation : c
          );
        });
        setActiveConversationId(res.conversation.id);

        if (res.memories) {
          setMemories(res.memories);
        }

        if (res.settings) {
          setSettings(res.settings);
          void cacheLocalPreferences('zoya_settings', res.settings);
        }

        await processPendingActions(res.conversation.id, res.assistantMessage);

        if (!isMuted && (settings.autoSpeak || fromVoice)) {
          void voice.speak(
            res.assistantMessage.content,
            res.assistantMessage.id,
            true
          );
        }
      } catch (err) {
        setErrorBanner(
          err instanceof Error ? err.message : 'Failed to get response from ZOYA.'
        );
        setConversations((prev) =>
          prev.map((c) =>
            c.id === currentId
              ? {
                  ...c,
                  messages: c.messages.filter((m) => m.id !== optimisticUserMsg.id),
                }
              : c
          )
        );
      } finally {
        setIsThinking(false);
      }
    },
    [
      activeConversation?.id,
      activeConversationId,
      isMuted,
      isThinking,
      processPendingActions,
      runtime,
      settings.autoSpeak,
      voice,
    ]
  );

  useEffect(() => {
    handleSendRef.current = handleSendMessage;
  }, [handleSendMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages.length, isThinking]);

  const zoyaState: ZoyaState = voice.isListening
    ? 'listening'
    : isThinking || voice.isTranscribing
    ? 'thinking'
    : voice.isSpeaking
    ? 'speaking'
    : 'idle';

  const handleSubmitForm = (e: FormEvent) => {
    e.preventDefault();
    void handleSendMessage(inputText, false);
  };

  const handleNewChat = async () => {
    voice.stopSpeaking();
    try {
      const conv = await createNewConversation();
      setConversations((prev) => [conv, ...prev]);
      setActiveConversationId(conv.id);
      setSecondaryScreen(null);
      setActiveTab('home');
      if (!isMuted && settings.autoSpeak && conv.messages[0]) {
        void voice.speak(conv.messages[0].content, conv.messages[0].id, false);
      }
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Unable to start new conversation.'
      );
    }
  };

  const handleDeleteConversation = async (id: string) => {
    const updated = await removeConversation(id);
    setConversations(updated);
    if (activeConversationId === id) {
      setActiveConversationId(updated[0]?.id ?? '');
    }
  };

  const handleUpdateSettings = async (patch: Partial<ZoyaSettings>) => {
    const updated = await saveSettings(patch);
    setSettings(updated);
  };

  const handleAddMemory = async (fact: string, category: MemoryCategory) => {
    const updated = await createMemory(fact, category);
    setMemories(updated);
  };

  const handleDeleteMemory = async (id: string) => {
    const updated = await removeMemory(id);
    setMemories(updated);
  };

  const handleClearMemories = async () => {
    const updated = await wipeAllMemories();
    setMemories(updated);
  };

  // Push-to-talk + Tap-to-toggle handlers for central red mic button
  const handleMicPointerDown = () => {
    suppressNextClickRef.current = false;
    if (voice.isSpeaking) {
      suppressNextClickRef.current = true;
      voice.stopSpeaking();
      return;
    }
    if (voice.isListening) return;
    isHoldActiveRef.current = false;
    holdTimerRef.current = window.setTimeout(() => {
      isHoldActiveRef.current = true;
      void voice.startListening();
    }, 260);
  };

  const handleMicPointerUp = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (isHoldActiveRef.current) {
      isHoldActiveRef.current = false;
      suppressNextClickRef.current = true;
      voice.stopListening();
    }
  };

  const handleMicClick = () => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (voice.isSpeaking) {
      voice.stopSpeaking();
      return;
    }
    if (voice.isListening) {
      voice.stopListening();
    } else {
      void voice.startListening();
    }
  };

  const handleSpeakExplicit = (text: string, messageId?: string) => {
    if (isMuted) {
      setIsMuted(false);
    }
    void voice.speak(text, messageId, false, true);
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (nextMuted) {
      voice.stopSpeaking();
    }
  };

  const handleStopAll = () => {
    voice.stopSpeaking();
    voice.stopListening();
  };

  // Execute real actions for the 8 futuristic command tiles
  const handleTriggerTile = async (tile: CommandTileId) => {
    setTileFeedback(null);
    setBusyTile(tile);
    try {
      if (tile === 'APPS') {
        setSecondaryScreen(null);
        setActiveTab('apps');
        return;
      }

      if (tile === 'CALL') {
        setDialerOpen(true);
        return;
      }

      if (tile === 'WHATSAPP') {
        const res = await launchNativeApp('com.whatsapp', 'WhatsApp');
        setTileFeedback({
          tile: 'WHATSAPP',
          result: res,
          webUrl: 'https://web.whatsapp.com',
        });
        return;
      }

      if (tile === 'MUSIC') {
        const res = await launchNativeApp('com.spotify.music', 'Spotify');
        setTileFeedback({
          tile: 'MUSIC',
          result: res,
          webUrl: 'https://open.spotify.com',
        });
        return;
      }

      if (tile === 'ALARM') {
        const res = await executeNativeSystemAction({
          actionType: 'alarm',
          target: 'alarms',
        });
        setTileFeedback({ tile: 'ALARM', result: res });
        return;
      }

      if (tile === 'CAMERA') {
        if (runtime.isNativeAndroid && runtime.hasZoyaPlugin) {
          const res = await executeNativeSystemAction({
            actionType: 'camera',
            target: 'still_image',
          });
          setTileFeedback({ tile: 'CAMERA', result: res });
        } else {
          setCameraOpen(true);
        }
        return;
      }

      if (tile === 'TORCH') {
        const nextState = !torchActive;
        const res = await toggleDeviceTorch(nextState);
        if (res.success) {
          setTorchActive(nextState);
        }
        setTileFeedback({ tile: 'TORCH', result: res });
        return;
      }

      if (tile === 'FLASH') {
        const onRes = await toggleDeviceTorch(true);
        if (onRes.success) {
          window.setTimeout(() => {
            void toggleDeviceTorch(false);
          }, 420);
          setTileFeedback({
            tile: 'FLASH',
            result: {
              success: true,
              executedOn: onRes.executedOn,
              message: 'Flash signal pulsed once.',
            },
          });
        } else {
          setTileFeedback({ tile: 'FLASH', result: onRes });
        }
      }
    } finally {
      setBusyTile(null);
    }
  };

  const handleDialNumber = async (phoneNumber: string) => {
    if (runtime.isNativeAndroid && runtime.hasZoyaPlugin) {
      const res = await executeNativeSystemAction({
        actionType: 'dial',
        target: phoneNumber,
      });
      setTileFeedback({ tile: 'CALL', result: res });
    } else {
      window.location.href = `tel:${encodeURIComponent(phoneNumber)}`;
      setTileFeedback({
        tile: 'CALL',
        result: {
          success: true,
          executedOn: 'web_browser',
          message: `Handed ${phoneNumber} to device tel: handler.`,
        },
      });
    }
  };

  const stateLabel =
    zoyaState === 'listening'
      ? voice.interimTranscript || 'Listening to Sagar...'
      : zoyaState === 'thinking'
      ? voice.isTranscribing
        ? 'Transcribing voice...'
        : 'Processing response...'
      : zoyaState === 'speaking'
      ? 'Speaking · Tap Stop or Mic to interrupt'
      : 'Standing by · Tap mic to speak';

  const bottomNavItems: Array<{
    id: MainTab;
    label: string;
    icon: typeof Home;
  }> = [
    { id: 'home', label: 'HOME', icon: Home },
    { id: 'voice', label: 'VOICE', icon: Mic },
    { id: 'commands', label: 'COMMANDS', icon: SlidersHorizontal },
    { id: 'history', label: 'HISTORY', icon: History },
    { id: 'apps', label: 'APPS', icon: Grid2x2 },
  ];

  const selectMainTab = (tab: MainTab) => {
    setSecondaryScreen(null);
    setActiveTab(tab);
  };

  const renderTileFeedbackStrip = () => {
    if (!tileFeedback) return null;
    return (
      <div className="rounded-2xl bg-[#0B0405] border border-red-900/70 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          {tileFeedback.result.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <div className="font-display text-xs font-semibold text-white">
              {tileFeedback.tile} ·{' '}
              <span className="font-mono text-slate-400 font-normal">
                {tileFeedback.result.executedOn}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              {tileFeedback.result.message}
            </p>
          </div>
        </div>
        {!tileFeedback.result.success && tileFeedback.webUrl && (
          <a
            href={tileFeedback.webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-red-600/25 border border-red-500/40 hover:bg-red-600/40 text-xs font-medium text-red-100 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span>Open Web</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    );
  };

  const renderVoiceActionBar = (compact = false) => (
    <div className="flex items-center justify-center gap-4 sm:gap-5">
      {/* Mute Button */}
      <button
        type="button"
        onClick={handleToggleMute}
        aria-label={isMuted ? 'Unmute ZOYA voice' : 'Mute ZOYA voice'}
        className={`min-h-[48px] min-w-[48px] px-4 rounded-2xl border flex items-center justify-center gap-2 text-xs font-display font-semibold tracking-wider transition-all ${
          isMuted
            ? 'bg-red-600/25 border-red-500 text-red-200'
            : 'bg-[#0B0405] border-red-950/90 hover:border-red-500/60 text-slate-300 hover:text-white'
        }`}
      >
        {isMuted ? (
          <VolumeX className="w-4 h-4 text-red-400" />
        ) : (
          <Volume2 className="w-4 h-4 text-red-400" />
        )}
        <span className={compact ? 'hidden sm:inline' : ''}>
          {isMuted ? 'MUTED' : 'MUTE'}
        </span>
      </button>

      {/* Large Glowing Red Microphone Button */}
      <button
        type="button"
        onPointerDown={handleMicPointerDown}
        onPointerUp={handleMicPointerUp}
        onPointerCancel={handleMicPointerUp}
        onClick={handleMicClick}
        aria-label={
          voice.isListening
            ? 'Stop listening'
            : voice.isSpeaking
            ? 'Interrupt ZOYA'
            : 'Tap or hold microphone to talk to ZOYA'
        }
        className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${
          voice.isListening
            ? 'bg-gradient-to-br from-red-500 via-rose-600 to-red-700 text-white shadow-[0_0_40px_rgba(255,30,45,0.8)]'
            : voice.isSpeaking
            ? 'bg-gradient-to-br from-rose-600 to-red-800 text-white shadow-[0_0_32px_rgba(244,63,94,0.65)]'
            : 'bg-gradient-to-br from-red-600 via-red-700 to-rose-900 hover:from-red-500 hover:to-red-700 text-white shadow-[0_0_28px_rgba(220,38,38,0.55)] border border-red-400/40'
        }`}
      >
        {voice.isListening ? (
          <MicOff className="w-8 h-8" />
        ) : (
          <Mic className="w-8 h-8" />
        )}
      </button>

      {/* Stop Button */}
      <button
        type="button"
        onClick={handleStopAll}
        disabled={!voice.isSpeaking && !voice.isListening}
        aria-label="Stop speaking or listening"
        className="min-h-[48px] min-w-[48px] px-4 rounded-2xl border border-red-950/90 bg-[#0B0405] hover:border-red-500/60 disabled:opacity-40 flex items-center justify-center gap-2 text-xs font-display font-semibold tracking-wider text-slate-300 hover:text-white transition-all"
      >
        <Square className="w-4 h-4 text-red-400 fill-red-400" />
        <span className={compact ? 'hidden sm:inline' : ''}>STOP</span>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-slate-100 flex flex-col relative overflow-x-hidden">
      {/* Subtle Neon-Red & Dark Crimson Ambient Lighting */}
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute -top-44 left-1/2 -translate-x-1/2 w-[560px] h-[560px] rounded-full bg-red-700/15 blur-[150px]" />
        <div className="absolute top-1/2 -left-40 w-[380px] h-[380px] rounded-full bg-rose-900/12 blur-[140px]" />
        <div className="absolute -bottom-44 right-1/4 w-[440px] h-[440px] rounded-full bg-red-800/14 blur-[150px]" />
      </div>

      {/* Top Bar */}
      <header className="sticky top-0 z-30 h-14 pt-safe bg-black/85 backdrop-blur-xl border-b border-red-950/80">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4 sm:gap-8">
          <button
            type="button"
            onClick={() => selectMainTab('home')}
            className="font-display text-lg sm:text-xl font-bold tracking-[0.18em] text-white whitespace-nowrap shrink-0"
          >
            ZOYA
          </button>

          {/* Desktop 5-item Navigation */}
          <nav
            className="hidden md:flex items-center gap-6 text-xs font-display font-semibold tracking-[0.14em]"
            aria-label="Primary navigation"
          >
            {bottomNavItems.map((item) => {
              const active = !secondaryScreen && activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectMainTab(item.id)}
                  className={`py-1.5 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                    active
                      ? 'text-red-400 border-red-500'
                      : 'text-slate-400 border-transparent hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right Controls: Live Vision, Companion Mode Toggle, Settings, New Chat */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                setSecondaryScreen((prev) =>
                  prev === 'vision' ? null : 'vision'
                )
              }
              className={`min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-display font-semibold tracking-wider inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                secondaryScreen === 'vision'
                  ? 'bg-red-600 border-red-500 text-white shadow-[0_0_16px_rgba(220,38,38,0.5)]'
                  : 'bg-[#0B0405] border-red-900/90 text-red-200 hover:border-red-500/70 hover:text-white'
              }`}
              title="Open ZOYA Live Camera Vision"
            >
              <Eye className="w-3.5 h-3.5 text-red-400" />
              <span className="sm:hidden">VISION</span>
              <span className="hidden sm:inline">LIVE VISION</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setSecondaryScreen((prev) =>
                  prev === 'companion' ? null : 'companion'
                )
              }
              className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-display font-semibold tracking-wider inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                secondaryScreen === 'companion'
                  ? 'bg-red-600 border-red-500 text-white'
                  : 'bg-[#0B0405] border-red-950 text-slate-300 hover:border-red-500/60 hover:text-white'
              }`}
              title="Animated Female AI Companion Mode"
            >
              <Sparkles className="w-3.5 h-3.5 text-red-400" />
              <span className="hidden sm:inline">COMPANION</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setSecondaryScreen((prev) =>
                  prev === 'settings' ? null : 'settings'
                )
              }
              aria-label="Open Settings"
              className={`min-h-[38px] min-w-[38px] rounded-xl border flex items-center justify-center transition-colors shrink-0 ${
                secondaryScreen === 'settings'
                  ? 'bg-red-600 border-red-500 text-white'
                  : 'bg-[#0B0405] border-red-950 text-slate-300 hover:border-red-500/60 hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => void handleNewChat()}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-xs font-display font-semibold tracking-wider text-white inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">NEW</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4 pb-24 md:pb-6 flex flex-col">
        {errorBanner && (
          <div
            role="alert"
            className="mb-4 rounded-xl bg-red-950/70 border border-red-500/50 px-4 py-3 flex items-center justify-between gap-3 text-sm text-red-100"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="truncate">{errorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-xs font-medium text-red-200 hover:text-white underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {isLoadingInitial ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-5">
            <ZoyaReactor state="thinking" audioLevel={0} size="md" />
            <p className="font-display text-sm tracking-widest text-red-300">
              INITIALIZING ZOYA CORE...
            </p>
          </div>
        ) : secondaryScreen === 'settings' ? (
          <SettingsView
            settings={settings}
            isSpeaking={voice.isSpeaking}
            onUpdateSettings={handleUpdateSettings}
            onTestVoice={() =>
              handleSpeakExplicit(
                `Arey ${settings.ownerName}! Kaise ho? Batao na, aaj kya kar rahe ho? Main yahin hoon, bolo kya help chahiye?`
              )
            }
            onStopVoice={voice.stopSpeaking}
          />
        ) : secondaryScreen === 'vision' ? (
          <LiveVisionView
            ownerName={settings.ownerName}
            conversation={activeConversation}
            runtime={runtime}
            isMuted={isMuted}
            autoSpeak={settings.autoSpeak}
            voiceState={{
              isListening: voice.isListening,
              isTranscribing: voice.isTranscribing,
              isSpeaking: voice.isSpeaking,
              speakingMessageId: voice.speakingMessageId,
              interimTranscript: voice.interimTranscript,
              audioLevel: voice.audioLevel,
            }}
            onMicClick={handleMicClick}
            onStopAllVoice={handleStopAll}
            onToggleMute={handleToggleMute}
            onSpeakText={(text, messageId, fromVoice) => {
              if (isMuted) setIsMuted(false);
              void voice.speak(text, messageId, Boolean(fromVoice), !fromVoice);
            }}
            onStopSpeaking={voice.stopSpeaking}
            onConversationUpdated={(updatedConv) => {
              setConversations((prev) => {
                const exists = prev.some((c) => c.id === updatedConv.id);
                if (!exists) return [updatedConv, ...prev];
                return prev.map((c) =>
                  c.id === updatedConv.id ? updatedConv : c
                );
              });
              setActiveConversationId(updatedConv.id);
            }}
            onRegisterVoiceHandler={(handler) => {
              liveVisionVoiceHandlerRef.current = handler;
            }}
            onClose={() => setSecondaryScreen(null)}
          />
        ) : secondaryScreen === 'companion' ? (
          /* Optional Animated Female AI Companion Mode */
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <section className="lg:col-span-5 rounded-3xl bg-[#080304]/95 border border-red-950/90 p-6 flex flex-col items-center justify-between gap-6 text-center">
              <div>
                <h1 className="font-display text-2xl font-bold tracking-wider text-white">
                  Good Evening, {settings.ownerName} ❤️
                </h1>
                <p className="text-sm text-red-300/90 mt-1">
                  Boliye, kya kaam hai?
                </p>
              </div>

              <div className="flex flex-col items-center gap-4">
                <ZoyaAvatar
                  state={zoyaState}
                  audioLevel={voice.audioLevel}
                  size="xl"
                />
                <VoiceVisualizer state={zoyaState} audioLevel={voice.audioLevel} />
                <p className="text-xs text-red-300 min-h-[18px]">{stateLabel}</p>
              </div>

              <div className="w-full space-y-3 pt-2 border-t border-red-950/80">
                {renderVoiceActionBar(false)}
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() =>
                      void handleUpdateSettings({
                        continuousMode: !settings.continuousMode,
                      })
                    }
                    className={`min-h-[38px] px-4 py-1.5 rounded-xl border text-xs font-display font-semibold tracking-wider inline-flex items-center gap-1.5 transition-colors ${
                      settings.continuousMode
                        ? 'bg-red-600/25 border-red-500 text-red-200'
                        : 'bg-black border-red-950 text-slate-300 hover:border-red-700'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>
                      CONTINUOUS: {settings.continuousMode ? 'ON' : 'OFF'}
                    </span>
                  </button>
                </div>
              </div>
            </section>

            <section className="lg:col-span-7 rounded-3xl bg-[#080304]/90 border border-red-950/90 flex flex-col min-h-[440px] lg:h-[calc(100vh-120px)]">
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                {(activeConversation?.messages ?? [
                  {
                    id: 'welcome',
                    role: 'assistant' as const,
                    content: buildWelcomeMessage(settings.ownerName),
                    timestamp: new Date().toISOString(),
                  },
                ]).map((msg) => (
                  <ChatMessageBubble
                    key={msg.id}
                    message={msg}
                    isSpeakingThis={
                      voice.isSpeaking && voice.speakingMessageId === msg.id
                    }
                    onSpeakMessage={(m) => handleSpeakExplicit(m.content, m.id)}
                    onStopSpeaking={voice.stopSpeaking}
                    onRetryAction={(messageId, action) => {
                      if (!activeConversation) return;
                      if (
                        action.requiresConfirmation ||
                        action.type === 'system_action'
                      ) {
                        setPendingConfirmAction({
                          conversationId: activeConversation.id,
                          messageId,
                          action,
                        });
                      } else {
                        void executeDeviceAction(
                          activeConversation.id,
                          messageId,
                          action
                        );
                      }
                    }}
                  />
                ))}
                {isThinking && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl bg-[#090405] border border-red-950 px-4 py-3 text-sm text-red-200">
                      ZOYA is thinking...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <form
                onSubmit={handleSubmitForm}
                className="p-3 sm:p-4 border-t border-red-950/80 bg-black/80 rounded-b-3xl"
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Ask ZOYA in Hindi, Gujarati, or English..."
                    className="flex-1 min-h-[46px] px-4 rounded-xl bg-[#090405] border border-red-950 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500"
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim() || isThinking}
                    aria-label="Send message"
                    className="min-w-[46px] min-h-[46px] px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 disabled:opacity-40 text-white inline-flex items-center justify-center transition-all shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : activeTab === 'home' ? (
          /* HOME: Pure Black JARVIS Reactor + Welcome + 8 Command Tiles + Chat Stream */
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left / Top Primary Reactor Console */}
            <section className="lg:col-span-5 rounded-3xl bg-[#060203]/95 border border-red-950/90 p-5 sm:p-6 flex flex-col justify-between gap-5">
              <div className="text-center space-y-1">
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  Good Evening, {settings.ownerName} ❤️
                </h1>
                <p className="text-sm sm:text-base text-red-300/90">
                  Boliye, kya kaam hai?
                </p>
              </div>

              <div className="flex flex-col items-center gap-2">
                <ZoyaReactor
                  state={zoyaState}
                  audioLevel={voice.audioLevel}
                  size="lg"
                  onCoreClick={handleMicClick}
                />
                <VoiceVisualizer state={zoyaState} audioLevel={voice.audioLevel} />
                <p className="text-xs font-medium text-red-300 min-h-[18px] text-center truncate max-w-full">
                  {stateLabel}
                </p>
              </div>

              {/* Large Red Mic + Mute & Stop Controls */}
              <div className="pt-2 border-t border-red-950/80 space-y-3">
                {renderVoiceActionBar(false)}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void handleUpdateSettings({
                        continuousMode: !settings.continuousMode,
                      })
                    }
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-xl border text-[11px] font-display font-semibold tracking-wider inline-flex items-center gap-1.5 transition-colors ${
                      settings.continuousMode
                        ? 'bg-red-600/25 border-red-500 text-red-200'
                        : 'bg-black border-red-950 text-slate-300 hover:border-red-700'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>
                      CONTINUOUS: {settings.continuousMode ? 'ON' : 'OFF'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSecondaryScreen('vision')}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-red-700/80 bg-red-950/30 hover:bg-red-900/40 hover:border-red-500 text-[11px] font-display font-semibold tracking-wider text-red-200 hover:text-white inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 text-red-400" />
                    <span>LIVE VISION</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSecondaryScreen('companion')}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-red-950 bg-black hover:border-red-600/70 text-[11px] font-display font-semibold tracking-wider text-slate-300 hover:text-white transition-colors"
                  >
                    AVATAR MODE
                  </button>
                </div>
              </div>
            </section>

            {/* Right Column: 8 Futuristic Command Tiles + Live AI Chat Console */}
            <section className="lg:col-span-7 flex flex-col gap-4 lg:h-[calc(100vh-116px)]">
              <div className="space-y-2.5">
                <CommandTilesGrid
                  torchActive={torchActive}
                  busyTile={busyTile}
                  onTriggerTile={(tile) => void handleTriggerTile(tile)}
                />
                {renderTileFeedbackStrip()}
              </div>

              {/* Conversational AI Stream */}
              <div className="flex-1 rounded-3xl bg-[#070304]/95 border border-red-950/90 flex flex-col min-h-[360px] overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                  {(activeConversation?.messages ?? [
                    {
                      id: 'welcome',
                      role: 'assistant' as const,
                      content: buildWelcomeMessage(settings.ownerName),
                      timestamp: new Date().toISOString(),
                    },
                  ]).map((msg) => (
                    <ChatMessageBubble
                      key={msg.id}
                      message={msg}
                      isSpeakingThis={
                        voice.isSpeaking && voice.speakingMessageId === msg.id
                      }
                      onSpeakMessage={(m) => handleSpeakExplicit(m.content, m.id)}
                      onStopSpeaking={voice.stopSpeaking}
                      onRetryAction={(messageId, action) => {
                        if (!activeConversation) return;
                        if (
                          action.requiresConfirmation ||
                          action.type === 'system_action'
                        ) {
                          setPendingConfirmAction({
                            conversationId: activeConversation.id,
                            messageId,
                            action,
                          });
                        } else {
                          void executeDeviceAction(
                            activeConversation.id,
                            messageId,
                            action
                          );
                        }
                      }}
                    />
                  ))}

                  {activeConversation && activeConversation.messages.length <= 1 && (
                    <div className="pt-1">
                      <p className="text-xs text-slate-400 mb-2">
                        Quick starters:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {QUICK_STARTERS.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => void handleSendMessage(prompt, false)}
                            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-black hover:bg-red-950/35 border border-red-950/90 hover:border-red-600/50 text-left text-xs text-slate-200 transition-colors"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {isThinking && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl bg-[#0B0405] border border-red-950 px-4 py-3 text-sm text-red-200">
                        ZOYA is thinking...
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                <form
                  onSubmit={handleSubmitForm}
                  className="p-3 sm:p-4 border-t border-red-950/80 bg-black/90"
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Boliye Sagar... (Hindi, Gujarati, or English)"
                      className="flex-1 min-h-[46px] px-4 rounded-xl bg-[#090405] border border-red-950 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500"
                    />
                    <button
                      type="submit"
                      disabled={!inputText.trim() || isThinking}
                      aria-label="Send message"
                      className="min-w-[46px] min-h-[46px] px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 disabled:opacity-40 text-white inline-flex items-center justify-center transition-all shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </div>
            </section>
          </div>
        ) : activeTab === 'voice' ? (
          /* VOICE: Dedicated Fullscreen Voice Reactor & Live Transcript Console */
          <div className="flex-1 flex flex-col items-center justify-between rounded-3xl bg-[#060203]/95 border border-red-950/90 p-6 sm:p-8 gap-6">
            <div className="text-center space-y-1">
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
                Good Evening, {settings.ownerName} ❤️
              </h1>
              <p className="text-sm text-red-300/90">
                Boliye, kya kaam hai?
              </p>
            </div>

            <div className="flex flex-col items-center gap-4 w-full max-w-2xl">
              <ZoyaReactor
                state={zoyaState}
                audioLevel={voice.audioLevel}
                size="lg"
                onCoreClick={handleMicClick}
              />
              <VoiceVisualizer state={zoyaState} audioLevel={voice.audioLevel} />
              <p className="text-sm font-medium text-red-300 text-center">
                {stateLabel}
              </p>

              {/* Latest ZOYA reply preview */}
              {activeConversation && activeConversation.messages.length > 0 && (
                <div className="w-full rounded-2xl bg-black/85 border border-red-950/90 p-4 text-sm text-slate-200 max-h-40 overflow-y-auto">
                  <div className="text-[11px] font-display tracking-wider text-red-400 mb-1">
                    LATEST RESPONSE
                  </div>
                  <p className="leading-relaxed whitespace-pre-wrap">
                    {
                      activeConversation.messages[
                        activeConversation.messages.length - 1
                      ].content
                    }
                  </p>
                </div>
              )}
            </div>

            <div className="w-full max-w-md space-y-4">
              {renderVoiceActionBar(false)}
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    void handleUpdateSettings({
                      continuousMode: !settings.continuousMode,
                    })
                  }
                  className={`min-h-[40px] px-4 py-1.5 rounded-xl border text-xs font-display font-semibold tracking-wider inline-flex items-center gap-1.5 transition-colors ${
                    settings.continuousMode
                      ? 'bg-red-600/25 border-red-500 text-red-200'
                      : 'bg-black border-red-950 text-slate-300'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>
                    CONTINUOUS: {settings.continuousMode ? 'ON' : 'OFF'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSecondaryScreen('vision')}
                  className="min-h-[40px] px-4 py-1.5 rounded-xl border border-red-700/80 bg-red-950/30 hover:border-red-500 text-xs font-display font-semibold tracking-wider text-red-200 inline-flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5 text-red-400" />
                  <span>LIVE VISION</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSecondaryScreen('companion')}
                  className="min-h-[40px] px-4 py-1.5 rounded-xl border border-red-950 bg-black hover:border-red-500 text-xs font-display font-semibold tracking-wider text-slate-200"
                >
                  FEMALE AVATAR MODE
                </button>
              </div>
            </div>
          </div>
        ) : activeTab === 'commands' ? (
          /* COMMANDS: Futuristic Command Matrix + Direct Prompt Shortcuts */
          <div className="space-y-6 pb-8">
            <section className="rounded-2xl bg-[#090405]/95 border border-red-950/90 p-5">
              <h1 className="font-display text-xl font-bold text-white">
                Command Matrix
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Execute quick device actions or ask ZOYA directly via Gemini tools.
              </p>
              <div className="mt-4">
                <CommandTilesGrid
                  torchActive={torchActive}
                  busyTile={busyTile}
                  onTriggerTile={(tile) => void handleTriggerTile(tile)}
                />
              </div>
              {tileFeedback && <div className="mt-4">{renderTileFeedbackStrip()}</div>}
            </section>

            <section className="rounded-2xl bg-[#090405]/95 border border-red-950/90 p-5">
              <h2 className="font-display text-base font-semibold text-white mb-3">
                Voice & AI Quick Prompts
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  'Open Wi-Fi settings on my phone',
                  'Open Bluetooth settings',
                  'Search latest AI breakthroughs on the internet',
                  'Remember that I prefer concise answers in Hinglish',
                ].map((cmd) => (
                  <button
                    key={cmd}
                    type="button"
                    onClick={() => {
                      setActiveTab('home');
                      void handleSendMessage(cmd, false);
                    }}
                    className="min-h-[48px] px-4 py-3 rounded-xl bg-black hover:bg-red-950/40 border border-red-950 hover:border-red-500/60 text-left text-sm text-slate-200 transition-colors"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : activeTab === 'history' ? (
          <MemoryHistoryView
            conversations={conversations}
            activeConversationId={activeConversation?.id ?? ''}
            memories={memories}
            onSelectConversation={(id) => {
              setActiveConversationId(id);
              setActiveTab('home');
            }}
            onNewConversation={handleNewChat}
            onDeleteConversation={handleDeleteConversation}
            onAddMemory={handleAddMemory}
            onDeleteMemory={handleDeleteMemory}
            onClearMemories={handleClearMemories}
          />
        ) : (
          <AndroidControlView
            runtime={runtime}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onRefreshRuntime={refreshRuntime}
          />
        )}
      </main>

      {/* Bottom 5-Item Mobile Navigation: HOME, VOICE, COMMANDS, HISTORY, APPS */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 pb-safe bg-black/95 backdrop-blur-xl border-t border-red-950/90 grid grid-cols-5 items-center"
        aria-label="Mobile navigation"
      >
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const active = !secondaryScreen && activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectMainTab(item.id)}
              className={`h-full flex flex-col items-center justify-center gap-1 transition-colors ${
                active ? 'text-red-400' : 'text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-display text-[10px] font-semibold tracking-wider">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Quick Action Modals */}
      <DialerModal
        open={dialerOpen}
        onClose={() => setDialerOpen(false)}
        onDial={(num) => void handleDialNumber(num)}
      />

      <CameraPreviewModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
      />

      <ActionConfirmModal
        action={pendingConfirmAction?.action ?? null}
        onConfirm={async () => {
          if (!pendingConfirmAction) return;
          const target = pendingConfirmAction;
          setPendingConfirmAction(null);
          await executeDeviceAction(
            target.conversationId,
            target.messageId,
            target.action
          );
        }}
        onCancel={async () => {
          if (!pendingConfirmAction) return;
          const target = pendingConfirmAction;
          setPendingConfirmAction(null);
          try {
            const updatedConv = await patchActionStatus({
              conversationId: target.conversationId,
              messageId: target.messageId,
              actionId: target.action.id,
              status: 'denied',
              statusMessage: 'Denied by Sagar.',
            });
            setConversations((prev) =>
              prev.map((c) => (c.id === updatedConv.id ? updatedConv : c))
            );
          } catch {
            // Ignore
          }
        }}
      />
    </div>
  );
}
