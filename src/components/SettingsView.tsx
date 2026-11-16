import { useEffect, useState } from 'react';
import { Globe, Shield, Sliders, Sparkles, Volume2 } from 'lucide-react';
import { ZoyaLanguage, ZoyaSettings, ZoyaVoicePersona } from '../types/zoya';

interface SettingsViewProps {
  settings: ZoyaSettings;
  isSpeaking: boolean;
  onUpdateSettings: (patch: Partial<ZoyaSettings>) => Promise<void>;
  onTestVoice: () => void;
  onStopVoice: () => void;
}

export function SettingsView({
  settings,
  isSpeaking,
  onUpdateSettings,
  onTestVoice,
  onStopVoice,
}: SettingsViewProps) {
  const [ownerDraft, setOwnerDraft] = useState(settings.ownerName);

  useEffect(() => {
    setOwnerDraft(settings.ownerName);
  }, [settings.ownerName]);

  const commitOwnerName = async () => {
    const clean = ownerDraft.trim() || 'Sagar';
    setOwnerDraft(clean);
    if (clean !== settings.ownerName) {
      await onUpdateSettings({ ownerName: clean });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
      {/* Personalization */}
      <section className="rounded-2xl bg-[#090405]/95 border border-red-950/90 p-5 space-y-5">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-5 h-5 text-red-400" />
          <h2 className="font-display text-lg font-semibold text-white">
            Personalization
          </h2>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="owner-name-input"
              className="block text-sm font-medium text-slate-200 mb-1.5"
            >
              How ZOYA addresses you
            </label>
            <div className="flex gap-2">
              <input
                id="owner-name-input"
                type="text"
                value={ownerDraft}
                onChange={(e) => setOwnerDraft(e.target.value)}
                onBlur={() => void commitOwnerName()}
                className="flex-1 min-h-[44px] px-4 rounded-xl bg-black border border-red-950 text-sm text-white focus:outline-none focus:border-red-500"
              />
              <button
                type="button"
                onClick={() => void commitOwnerName()}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-red-950/60 hover:bg-red-900/60 border border-red-900/60 text-xs font-medium text-white whitespace-nowrap shrink-0"
              >
                Save
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              Language Preference
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { id: 'auto', label: 'Auto Mix' },
                  { id: 'hi', label: 'Hindi' },
                  { id: 'gu', label: 'Gujarati' },
                  { id: 'en', label: 'English' },
                ] as Array<{ id: ZoyaLanguage; label: string }>
              ).map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => void onUpdateSettings({ preferredLanguage: lang.id })}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap ${
                    settings.preferredLanguage === lang.id
                      ? 'bg-red-600/25 border-red-500 text-white'
                      : 'bg-black border-red-950 text-slate-300 hover:border-red-800'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              Companion Style
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'warm', label: 'Warm & Caring' },
                  { id: 'balanced', label: 'Balanced' },
                  { id: 'concise', label: 'Direct' },
                ] as const
              ).map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => void onUpdateSettings({ warmthLevel: style.id })}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap ${
                    settings.warmthLevel === style.id
                      ? 'bg-red-600/25 border-red-500 text-white'
                      : 'bg-black border-red-950 text-slate-300 hover:border-red-800'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-red-950/80 flex items-center justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <Globe className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-slate-100">
                  Live Internet Search Grounding
                </div>
                <div className="text-xs text-slate-400">
                  Allow ZOYA to search the web via secure backend when answering current questions
                </div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.webSearchEnabled}
              onClick={() =>
                void onUpdateSettings({ webSearchEnabled: !settings.webSearchEnabled })
              }
              className={`min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                settings.webSearchEnabled
                  ? 'bg-red-600 text-white'
                  : 'bg-red-950/50 border border-red-900/50 text-slate-300'
              }`}
            >
              {settings.webSearchEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>
      </section>

      {/* Voice Settings */}
      <section className="rounded-2xl bg-[#090405]/95 border border-red-950/90 p-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Volume2 className="w-5 h-5 text-red-400" />
            <h2 className="font-display text-lg font-semibold text-white">
              Voice Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={isSpeaking ? onStopVoice : onTestVoice}
            className="min-h-[40px] px-4 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-xs font-medium text-white whitespace-nowrap shrink-0"
          >
            {isSpeaking ? 'Stop Voice' : 'Test ZOYA Voice'}
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              Voice Synthesis Engine
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void onUpdateSettings({ voiceEngine: 'gemini' })}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  settings.voiceEngine === 'gemini'
                    ? 'bg-red-600/25 border-red-500 text-white'
                    : 'bg-black border-red-950 text-slate-300'
                }`}
              >
                Gemini 3.8 Flash TTS (Natural)
              </button>
              <button
                type="button"
                onClick={() => void onUpdateSettings({ voiceEngine: 'webspeech' })}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  settings.voiceEngine === 'webspeech'
                    ? 'bg-red-600/25 border-red-500 text-white'
                    : 'bg-black border-red-950 text-slate-300'
                }`}
              >
                Device System Voice
              </button>
            </div>
          </div>

          {settings.voiceEngine === 'gemini' && (
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                Indian Female Voice Persona
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(
                  [
                    { id: 'Sulafat', label: 'Sulafat · Warm' },
                    { id: 'Achernar', label: 'Achernar · Soft' },
                    { id: 'Leda', label: 'Leda · Youthful' },
                  ] as Array<{ id: ZoyaVoicePersona; label: string }>
                ).map((persona) => (
                  <button
                    key={persona.id}
                    type="button"
                    onClick={() => void onUpdateSettings({ voicePersona: persona.id })}
                    className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                      settings.voicePersona === persona.id
                        ? 'bg-red-600/25 border-red-500 text-white'
                        : 'bg-black border-red-950 text-slate-300'
                    }`}
                  >
                    {persona.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Supports natural Hindi (hi-IN), Gujarati (gu-IN), and Indian English delivery.
              </p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="font-medium text-slate-200 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-slate-400" />
                Speaking Speed
              </span>
              <span className="font-mono text-xs text-red-300 tabular-nums">
                {settings.speechRate.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min="0.75"
              max="1.4"
              step="0.05"
              value={settings.speechRate}
              onChange={(e) =>
                void onUpdateSettings({ speechRate: Number(e.target.value) })
              }
              className="w-full accent-red-500 h-2 bg-black rounded-lg cursor-pointer"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="font-medium text-slate-200">Voice Volume</span>
              <span className="font-mono text-xs text-red-300 tabular-nums">
                {Math.round(settings.speechVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.speechVolume}
              onChange={(e) =>
                void onUpdateSettings({ speechVolume: Number(e.target.value) })
              }
              className="w-full accent-red-500 h-2 bg-black rounded-lg cursor-pointer"
            />
          </div>

          <div className="pt-2 border-t border-red-950/80 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-100">
                  Auto-Speak Replies
                </div>
                <div className="text-xs text-slate-400">
                  ZOYA automatically reads out her replies aloud
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.autoSpeak}
                onClick={() =>
                  void onUpdateSettings({ autoSpeak: !settings.autoSpeak })
                }
                className={`min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  settings.autoSpeak
                    ? 'bg-red-600 text-white'
                    : 'bg-red-950/50 border border-red-900/50 text-slate-300'
                }`}
              >
                {settings.autoSpeak ? 'On' : 'Off'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-100">
                  Continuous Conversation Mode
                </div>
                <div className="text-xs text-slate-400">
                  Automatically re-open microphone after ZOYA finishes speaking
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.continuousMode}
                onClick={() =>
                  void onUpdateSettings({
                    continuousMode: !settings.continuousMode,
                  })
                }
                className={`min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  settings.continuousMode
                    ? 'bg-red-600 text-white'
                    : 'bg-red-950/50 border border-red-900/50 text-slate-300'
                }`}
              >
                {settings.continuousMode ? 'On' : 'Off'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-slate-100">
                    Confirm Sensitive Actions
                  </div>
                  <div className="text-xs text-slate-400">
                    Ask Sagar before running Android dial, share, or accessibility intents
                  </div>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.confirmSensitiveActions}
                onClick={() =>
                  void onUpdateSettings({
                    confirmSensitiveActions: !settings.confirmSensitiveActions,
                  })
                }
                className={`min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  settings.confirmSensitiveActions
                    ? 'bg-emerald-600 text-white'
                    : 'bg-red-950/50 border border-red-900/50 text-slate-300'
                }`}
              >
                {settings.confirmSensitiveActions ? 'Protected' : 'Direct'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
