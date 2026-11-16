import { useState } from 'react';
import {
  Accessibility,
  AlertTriangle,
  BatteryCharging,
  Bluetooth,
  Camera,
  CheckCircle2,
  ExternalLink,
  Layers,
  MapPin,
  Mic,
  Monitor,
  ShieldCheck,
  Smartphone,
  Volume2,
  Wifi,
} from 'lucide-react';
import {
  ANDROID_APP_SHORTCUTS,
  ANDROID_SETTINGS_SHORTCUTS,
  ZoyaNativeResult,
  launchNativeApp,
  openNativeAndroidSettings,
  requestNativeCameraPermission,
  requestNativeMicrophonePermission,
  syncAccessibilityConsent,
} from '../native/zoyaAndroidBridge';
import {
  AndroidSettingKey,
  RuntimeCapabilities,
  ZoyaSettings,
} from '../types/zoya';

interface AndroidControlViewProps {
  runtime: RuntimeCapabilities;
  settings: ZoyaSettings;
  onUpdateSettings: (patch: Partial<ZoyaSettings>) => Promise<void>;
  onRefreshRuntime: () => Promise<void>;
}

const SETTING_ICONS: Record<AndroidSettingKey, typeof Wifi> = {
  wifi: Wifi,
  bluetooth: Bluetooth,
  display: Monitor,
  location: MapPin,
  sound: Volume2,
  battery: BatteryCharging,
  application: Layers,
  accessibility: Accessibility,
};

export function AndroidControlView({
  runtime,
  settings,
  onUpdateSettings,
  onRefreshRuntime,
}: AndroidControlViewProps) {
  const [lastResult, setLastResult] = useState<{
    title: string;
    result: ZoyaNativeResult;
    webFallbackUrl?: string;
  } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const handleLaunchApp = async (
    packageName: string,
    appName: string,
    webFallbackUrl?: string
  ) => {
    setBusyKey(packageName);
    const result = await launchNativeApp(packageName, appName);
    setLastResult({ title: `Open ${appName}`, result, webFallbackUrl });
    setBusyKey(null);
  };

  const handleOpenSetting = async (settingKey: AndroidSettingKey, label: string) => {
    if (settingKey === 'accessibility' && !settings.accessibilityConsentGranted) {
      setLastResult({
        title: label,
        result: {
          success: false,
          executedOn: runtime.isNativeAndroid ? 'android_native' : 'web_browser',
          message:
            'Please enable Explicit Accessibility Consent below before opening Android Accessibility Settings.',
        },
      });
      return;
    }
    setBusyKey(settingKey);
    const result = await openNativeAndroidSettings(settingKey);
    setLastResult({ title: label, result });
    setBusyKey(null);
  };

  const handleMicRequest = async () => {
    setBusyKey('mic');
    await requestNativeMicrophonePermission();
    await onRefreshRuntime();
    setBusyKey(null);
  };

  const handleCameraRequest = async () => {
    setBusyKey('camera');
    await requestNativeCameraPermission();
    if (
      !runtime.isNativeAndroid &&
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices?.getUserMedia
    ) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        s.getTracks().forEach((t) => t.stop());
      } catch {
        // Handled via permission status refresh
      }
    }
    await onRefreshRuntime();
    setBusyKey(null);
  };

  const handleToggleAccessibilityConsent = async () => {
    const next = !settings.accessibilityConsentGranted;
    await syncAccessibilityConsent(next);
    await onUpdateSettings({ accessibilityConsentGranted: next });
    await onRefreshRuntime();
  };

  return (
    <div className="space-y-8 pb-8">
      {/* Honest Runtime Bridge Banner */}
      <section className="rounded-2xl bg-[#090405]/95 border border-red-950/90 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                runtime.isNativeAndroid && runtime.hasZoyaPlugin
                  ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                  : 'bg-red-600/15 border-red-500/35 text-red-400'
              }`}
            >
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                {runtime.isNativeAndroid && runtime.hasZoyaPlugin
                  ? 'Native Capacitor Android Bridge Active'
                  : 'Web Preview Mode · Capacitor Android Ready'}
              </h2>
              <p className="text-sm text-slate-400 mt-1 leading-relaxed max-w-2xl">
                {runtime.isNativeAndroid && runtime.hasZoyaPlugin
                  ? 'ZOYA is running inside the native Android APK. App launches and Android Settings intents execute directly through ZoyaAndroidPlugin.kt.'
                  : 'Browser JavaScript cannot directly control Android hardware settings or launch installed phone apps. Every shortcut below is wired to Capacitor ZoyaAndroidPlugin.kt for your compiled Android APK, and reports honestly in browser mode.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onRefreshRuntime()}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-red-900/60 bg-red-950/35 hover:bg-red-950/60 text-xs font-medium text-red-100 transition-colors whitespace-nowrap shrink-0"
          >
            Refresh Device Status
          </button>
        </div>

        {/* Result feedback strip */}
        {lastResult && (
          <div className="mt-4 pt-4 border-t border-red-950/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              {lastResult.result.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="text-xs font-medium text-slate-100">
                  {lastResult.title} ·{' '}
                  <span className="font-mono text-slate-400">
                    {lastResult.result.executedOn}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  {lastResult.result.message}
                </p>
              </div>
            </div>
            {!lastResult.result.success && lastResult.webFallbackUrl && (
              <a
                href={lastResult.webFallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-red-600/25 border border-red-500/40 hover:bg-red-600/40 text-xs font-medium text-red-100 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <span>Open Web App</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}
      </section>

      {/* Installed App Launcher */}
      <section>
        <div className="mb-4">
          <h3 className="font-display text-lg font-semibold text-white">
            Installed App Launcher
          </h3>
          <p className="text-sm text-slate-400 mt-0.5">
            Launches installed Android apps via PackageManager intent on APK.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {ANDROID_APP_SHORTCUTS.map((app) => {
            const isBusy = busyKey === app.packageName;
            return (
              <button
                key={app.id}
                type="button"
                disabled={isBusy}
                onClick={() =>
                  void handleLaunchApp(
                    app.packageName,
                    app.name,
                    app.webFallbackUrl
                  )
                }
                className="group min-h-[88px] rounded-2xl bg-[#090405]/95 border border-red-950/80 hover:border-red-500/60 hover:bg-[#130608] p-3.5 text-left transition-all flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white group-hover:text-red-200 transition-colors truncate">
                    {app.name}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-red-400 shrink-0" />
                </div>
                <div className="mt-2">
                  <div className="text-xs text-slate-400 truncate">
                    {app.description}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 truncate mt-0.5">
                    {app.packageName}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Android Settings Shortcuts */}
      <section>
        <div className="mb-4">
          <h3 className="font-display text-lg font-semibold text-white">
            Android Settings Shortcuts
          </h3>
          <p className="text-sm text-slate-400 mt-0.5">
            Direct Android system intent shortcuts implemented in ZoyaAndroidPlugin.kt.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ANDROID_SETTINGS_SHORTCUTS.map((item) => {
            const Icon = SETTING_ICONS[item.key];
            const isBusy = busyKey === item.key;
            return (
              <button
                key={item.key}
                type="button"
                disabled={isBusy}
                onClick={() => void handleOpenSetting(item.key, item.label)}
                className="min-h-[84px] rounded-2xl bg-[#090405]/95 border border-red-950/80 hover:border-red-500/60 hover:bg-[#130608] p-4 text-left transition-all flex items-start gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-red-600/15 border border-red-500/25 flex items-center justify-center shrink-0 text-red-400">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">
                    {item.label}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                    {item.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Permissions & Accessibility Explicit Consent */}
      <section className="rounded-2xl bg-[#090405]/95 border border-red-950/90 p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-red-400" />
          <h3 className="font-display text-base font-semibold text-white">
            Permissions & Accessibility Consent
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl bg-black border border-red-950/80 p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Mic className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-white">
                  Microphone Access
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Status: <span className="text-slate-200">{runtime.micPermission}</span> · Needed for voice recognition
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleMicRequest()}
              disabled={busyKey === 'mic'}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-red-950/60 hover:bg-red-900/60 border border-red-800/50 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0"
            >
              {runtime.micPermission === 'granted' ? 'Verify' : 'Grant Mic'}
            </button>
          </div>

          <div className="rounded-xl bg-black border border-red-950/80 p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Camera className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-white">
                  Camera Vision Access
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Status:{' '}
                  <span className="text-slate-200">
                    {runtime.cameraPermission ?? 'unknown'}
                  </span>{' '}
                  · Needed for Live Vision mode
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleCameraRequest()}
              disabled={busyKey === 'camera'}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-red-950/60 hover:bg-red-900/60 border border-red-800/50 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0"
            >
              {runtime.cameraPermission === 'granted' ? 'Verify' : 'Grant Cam'}
            </button>
          </div>

          <div className="rounded-xl bg-black border border-red-950/80 p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Accessibility className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-white">
                  Explicit Accessibility Consent
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Android service: {runtime.accessibilityEnabled ? 'Active' : 'Disabled'} · Only for hands-free navigation with your consent
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleToggleAccessibilityConsent()}
              role="switch"
              aria-checked={settings.accessibilityConsentGranted}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                settings.accessibilityConsentGranted
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'bg-red-950/50 border border-red-900/50 text-slate-300 hover:bg-red-950'
              }`}
            >
              {settings.accessibilityConsentGranted ? 'Consented' : 'Enable Consent'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
