import { Capacitor, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import {
  AndroidAppShortcut,
  AndroidSettingKey,
  RuntimeCapabilities,
} from '../types/zoya';

export interface ZoyaNativeResult {
  success: boolean;
  executedOn: 'android_native' | 'web_browser';
  message: string;
  requiresPermission?: string;
}

export interface ZoyaAndroidPlugin {
  launchApp(options: { packageName: string; appName: string }): Promise<ZoyaNativeResult>;
  openSettings(options: { settingType: AndroidSettingKey }): Promise<ZoyaNativeResult>;
  executeSystemAction(options: {
    actionType: string;
    target: string;
    details?: string;
  }): Promise<ZoyaNativeResult>;
  checkPermissions(): Promise<{
    microphone: 'granted' | 'denied' | 'prompt';
    camera?: 'granted' | 'denied' | 'prompt';
    accessibilityEnabled: boolean;
  }>;
  requestMicrophonePermission(): Promise<{ granted: boolean }>;
  requestCameraPermission(): Promise<{ granted: boolean }>;
  captureNativeCameraPhoto(options: { facing: 'front' | 'back' }): Promise<{
    success: boolean;
    executedOn: 'android_native' | 'web_browser';
    imageBase64?: string;
    mimeType?: string;
    message: string;
  }>;
  setAccessibilityConsent(options: { granted: boolean }): Promise<{ saved: boolean }>;
  openAccessibilitySettings(): Promise<ZoyaNativeResult>;
  toggleTorch(options: { enabled: boolean }): Promise<ZoyaNativeResult>;
}

const ZoyaAndroid = registerPlugin<ZoyaAndroidPlugin>('ZoyaAndroid');

export const ANDROID_APP_SHORTCUTS: AndroidAppShortcut[] = [
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    packageName: 'com.whatsapp',
    webFallbackUrl: 'https://web.whatsapp.com',
    category: 'social',
    description: 'Messaging & calls',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    packageName: 'com.instagram.android',
    webFallbackUrl: 'https://www.instagram.com',
    category: 'social',
    description: 'Photos, reels & DMs',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    packageName: 'com.google.android.youtube',
    webFallbackUrl: 'https://www.youtube.com',
    category: 'media',
    description: 'Videos & music',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    packageName: 'com.facebook.katana',
    webFallbackUrl: 'https://www.facebook.com',
    category: 'social',
    description: 'Feed & community',
  },
  {
    id: 'chrome',
    name: 'Chrome',
    packageName: 'com.android.chrome',
    category: 'utility',
    description: 'Web browser',
  },
  {
    id: 'maps',
    name: 'Google Maps',
    packageName: 'com.google.android.apps.maps',
    webFallbackUrl: 'https://maps.google.com',
    category: 'utility',
    description: 'Navigation & places',
  },
  {
    id: 'spotify',
    name: 'Spotify',
    packageName: 'com.spotify.music',
    webFallbackUrl: 'https://open.spotify.com',
    category: 'media',
    description: 'Music & podcasts',
  },
  {
    id: 'camera',
    name: 'Camera',
    packageName: 'com.android.camera',
    category: 'system',
    description: 'Photo & video capture',
  },
  {
    id: 'phone',
    name: 'Phone',
    packageName: 'com.android.dialer',
    category: 'system',
    description: 'Voice calls & dialer',
  },
  {
    id: 'messages',
    name: 'Messages',
    packageName: 'com.google.android.apps.messaging',
    category: 'system',
    description: 'SMS & RCS messages',
  },
];

export const ANDROID_SETTINGS_SHORTCUTS: Array<{
  key: AndroidSettingKey;
  label: string;
  intentConstant: string;
  description: string;
}> = [
  {
    key: 'wifi',
    label: 'Wi-Fi Settings',
    intentConstant: 'android.settings.WIFI_SETTINGS',
    description: 'Manage wireless networks & saved Wi-Fi',
  },
  {
    key: 'bluetooth',
    label: 'Bluetooth Settings',
    intentConstant: 'android.settings.BLUETOOTH_SETTINGS',
    description: 'Pair audio devices & accessories',
  },
  {
    key: 'display',
    label: 'Display Settings',
    intentConstant: 'android.settings.DISPLAY_SETTINGS',
    description: 'Brightness, dark theme & screen timeout',
  },
  {
    key: 'location',
    label: 'Location Settings',
    intentConstant: 'android.settings.LOCATION_SOURCE_SETTINGS',
    description: 'GPS & app location permissions',
  },
  {
    key: 'sound',
    label: 'Sound & Vibration',
    intentConstant: 'android.settings.SOUND_SETTINGS',
    description: 'Media volume, ringtone & DND controls',
  },
  {
    key: 'battery',
    label: 'Battery Settings',
    intentConstant: 'android.settings.BATTERY_SAVER_SETTINGS',
    description: 'Battery usage & power optimization',
  },
  {
    key: 'application',
    label: 'App Settings',
    intentConstant: 'android.settings.APPLICATION_SETTINGS',
    description: 'Installed apps, defaults & permissions',
  },
  {
    key: 'accessibility',
    label: 'Accessibility Settings',
    intentConstant: 'android.settings.ACCESSIBILITY_SETTINGS',
    description: 'Explicit consent required for ZOYA accessibility service',
  },
];

export async function triggerHaptic(style: 'light' | 'medium' = 'light'): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({
        style: style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light,
      });
    }
  } catch {
    // Ignore haptic unavailability
  }
}

export async function detectRuntimeCapabilities(): Promise<RuntimeCapabilities> {
  const isNative = Capacitor.isNativePlatform();
  const platform = isNative && Capacitor.getPlatform() === 'android' ? 'android' : 'web';
  const hasZoyaPlugin = isNative && Capacitor.isPluginAvailable('ZoyaAndroid');

  const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : {};
  const hasWebSpeechRecognition = Boolean(
    win.SpeechRecognition || win.webkitSpeechRecognition
  );
  const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
  const hasSpeechSynthesis =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  let micPermission: RuntimeCapabilities['micPermission'] = 'unknown';
  let cameraPermission: RuntimeCapabilities['cameraPermission'] = 'unknown';
  let accessibilityEnabled = false;

  if (hasZoyaPlugin) {
    try {
      const perms = await ZoyaAndroid.checkPermissions();
      micPermission = perms.microphone;
      if (perms.camera) cameraPermission = perms.camera;
      accessibilityEnabled = perms.accessibilityEnabled;
    } catch {
      // Plugin fallback
    }
  } else if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
        micPermission = status.state;
      }
    } catch {
      micPermission = 'unknown';
    }
    try {
      const camStatus = await navigator.permissions.query({
        name: 'camera' as PermissionName,
      });
      if (
        camStatus.state === 'granted' ||
        camStatus.state === 'denied' ||
        camStatus.state === 'prompt'
      ) {
        cameraPermission = camStatus.state;
      }
    } catch {
      cameraPermission = 'unknown';
    }
  }

  return {
    isNativeAndroid: isNative && platform === 'android',
    platform,
    hasZoyaPlugin,
    hasWebSpeechRecognition,
    hasMediaRecorder,
    hasSpeechSynthesis,
    micPermission,
    cameraPermission,
    accessibilityEnabled,
  };
}

export async function launchNativeApp(
  packageName: string,
  appName: string
): Promise<ZoyaNativeResult> {
  const isNative = Capacitor.isNativePlatform();
  if (isNative && Capacitor.isPluginAvailable('ZoyaAndroid')) {
    try {
      await triggerHaptic('medium');
      return await ZoyaAndroid.launchApp({ packageName, appName });
    } catch (err) {
      return {
        success: false,
        executedOn: 'android_native',
        message:
          err instanceof Error
            ? err.message
            : `Could not launch ${appName} (${packageName}) on this device.`,
      };
    }
  }

  return {
    success: false,
    executedOn: 'web_browser',
    message: `Browser JavaScript cannot launch native Android packages (${packageName}). Install the compiled ZOYA Android APK via Capacitor to open ${appName} directly on your phone.`,
  };
}

export async function openNativeAndroidSettings(
  settingType: AndroidSettingKey
): Promise<ZoyaNativeResult> {
  const isNative = Capacitor.isNativePlatform();
  if (isNative && Capacitor.isPluginAvailable('ZoyaAndroid')) {
    try {
      await triggerHaptic('light');
      if (settingType === 'accessibility') {
        return await ZoyaAndroid.openAccessibilitySettings();
      }
      return await ZoyaAndroid.openSettings({ settingType });
    } catch (err) {
      return {
        success: false,
        executedOn: 'android_native',
        message:
          err instanceof Error
            ? err.message
            : `Unable to open Android ${settingType} settings.`,
      };
    }
  }

  return {
    success: false,
    executedOn: 'web_browser',
    message: `Browser JavaScript cannot directly open Android ${settingType} settings. Run the compiled Capacitor Android APK to execute native Android Settings intents.`,
  };
}

export async function executeNativeSystemAction(options: {
  actionType: string;
  target: string;
  details?: string;
}): Promise<ZoyaNativeResult> {
  const isNative = Capacitor.isNativePlatform();
  if (isNative && Capacitor.isPluginAvailable('ZoyaAndroid')) {
    try {
      await triggerHaptic('medium');
      return await ZoyaAndroid.executeSystemAction(options);
    } catch (err) {
      return {
        success: false,
        executedOn: 'android_native',
        message:
          err instanceof Error
            ? err.message
            : `Failed to run Android system action (${options.actionType}).`,
      };
    }
  }

  return {
    success: false,
    executedOn: 'web_browser',
    message: `Android system intent "${options.actionType}" requires the native Capacitor Android APK and explicit device permissions.`,
  };
}

export async function requestNativeMicrophonePermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('ZoyaAndroid')) {
    try {
      const res = await ZoyaAndroid.requestMicrophonePermission();
      return res.granted;
    } catch {
      return false;
    }
  }
  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function requestNativeCameraPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('ZoyaAndroid')) {
    try {
      const res = await ZoyaAndroid.requestCameraPermission();
      return res.granted;
    } catch {
      return false;
    }
  }
  return true;
}

export async function captureNativeCameraPhoto(facing: 'front' | 'back' = 'back'): Promise<{
  success: boolean;
  executedOn: 'android_native' | 'web_browser';
  imageBase64?: string;
  mimeType?: string;
  message: string;
}> {
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('ZoyaAndroid')) {
    try {
      await triggerHaptic('medium');
      return await ZoyaAndroid.captureNativeCameraPhoto({ facing });
    } catch (err) {
      return {
        success: false,
        executedOn: 'android_native',
        message:
          err instanceof Error ? err.message : 'Native Android camera capture failed.',
      };
    }
  }
  return {
    success: false,
    executedOn: 'web_browser',
    message: 'Native Android camera intent is only available inside the compiled APK.',
  };
}

export async function syncAccessibilityConsent(granted: boolean): Promise<void> {
  await Preferences.set({
    key: 'zoya_accessibility_consent',
    value: granted ? 'true' : 'false',
  });
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('ZoyaAndroid')) {
    try {
      await ZoyaAndroid.setAccessibilityConsent({ granted });
    } catch {
      // Ignore if native plugin unavailable
    }
  }
}

export async function cacheLocalPreferences(key: string, value: unknown): Promise<void> {
  try {
    await Preferences.set({ key, value: JSON.stringify(value) });
  } catch {
    // Fallback ignored
  }
}

let activeWebTorchStream: MediaStream | null = null;

export async function toggleDeviceTorch(enabled: boolean): Promise<ZoyaNativeResult> {
  const isNative = Capacitor.isNativePlatform();
  if (isNative && Capacitor.isPluginAvailable('ZoyaAndroid')) {
    try {
      await triggerHaptic('medium');
      return await ZoyaAndroid.toggleTorch({ enabled });
    } catch (err) {
      return {
        success: false,
        executedOn: 'android_native',
        message:
          err instanceof Error ? err.message : 'Unable to toggle Android flashlight.',
      };
    }
  }

  // Honest browser hardware attempt (works on supported Android Chrome devices; fails cleanly elsewhere)
  if (!enabled && activeWebTorchStream) {
    activeWebTorchStream.getTracks().forEach((t) => t.stop());
    activeWebTorchStream = null;
    return {
      success: true,
      executedOn: 'web_browser',
      message: 'Browser torch track released.',
    };
  }

  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as Record<string, unknown> | undefined;
      if (track && caps && 'torch' in caps) {
        await track.applyConstraints({
          advanced: [{ torch: enabled } as MediaTrackConstraintSet],
        });
        if (enabled) {
          activeWebTorchStream = stream;
        } else {
          stream.getTracks().forEach((t) => t.stop());
          activeWebTorchStream = null;
        }
        return {
          success: true,
          executedOn: 'web_browser',
          message: enabled ? 'Device flashlight turned ON.' : 'Device flashlight turned OFF.',
        };
      }
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // Fall through to honest capability message
    }
  }

  return {
    success: false,
    executedOn: 'web_browser',
    message:
      'Camera flashlight hardware is unavailable in this browser session. Install the ZOYA Android APK to control the phone LED torch directly.',
  };
}

