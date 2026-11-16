# ZOYA JARVIS AI

A personal AI companion and Android-ready voice assistant built for Sagar using **React + TypeScript + Vite**, an **Express + Gemini AI backend proxy**, **Web Speech & Gemini Natural TTS**, **persistent memory & chat history**, and a **Capacitor + Kotlin native Android integration layer**.

## Core Architecture

- **Frontend (`/src`)**:
  - `src/App.tsx`: Pure black & neon-red JARVIS interface with animated geometric central reactor (`ZoyaReactor`), 8 command tiles (`CALL`, `WHATSAPP`, `ALARM`, `TORCH`, `MUSIC`, `CAMERA`, `FLASH`, `APPS`), mute/stop controls, 5-tab navigation (`HOME`, `VOICE`, `COMMANDS`, `HISTORY`, `APPS`), and optional Animated Female AI Companion mode.
  - `src/hooks/useZoyaVoice.ts`: Web Speech API (`en-IN`, `hi-IN`, `gu-IN`) with `MediaRecorder` + Gemini transcription fallback (`gemini-3.5-transcribe`), Web Audio API (`AudioContext.decodeAudioData`) playback for **Gemini 3.8 Flash TTS** (`gemini-3.8-flash-tts`, voices `Sulafat`, `Achernar`, `Leda` with `hi-IN`/`gu-IN` Indian pronunciation and `speechMetadata.style`), overlap prevention, interruptible speech, and explicit error surfacing.
  - `src/native/zoyaAndroidBridge.ts`: Capacitor bridge (`registerPlugin('ZoyaAndroid')`) with honest runtime capability detection (never pretends browser JS can control Android settings).
- **Backend (`/server.ts`, `/server/gemini.ts`, `/server/storage.ts`)**:
  - Express server on port `3000` keeping `GEMINI_API_KEY` strictly server-side.
  - `gemini-4-hydrogen` with hybrid **Google Search grounding** (`googleSearch`) and **Function Calling** (`launch_app`, `open_android_settings`, `execute_android_action`, `save_memory`, `forget_memory`), plus `gemini-3.8-flash-tts` on `v1beta`.
  - Persistent JSON storage (`data/zoya-store.json`) for conversations, long-term personal memories, and voice/personalization settings.
- **Native Android Layer (`/android`, `/capacitor.config.ts`)**:
  - `ZoyaAndroidPlugin.kt`: Launches installed apps (WhatsApp, Instagram, YouTube, Facebook, Chrome, Maps, Spotify, etc.), opens Android system settings (Wi-Fi, Bluetooth, Display, Location, Sound, Battery, Application, Accessibility), and checks/requests microphone permissions.
  - `ZoyaAccessibilityService.kt`: Consent-gated Android `AccessibilityService` disabled by default until Sagar grants explicit permission.

## Environment Variables

Configure in your environment or `.env`:

- `GEMINI_API_KEY`: Required server-side Gemini API key (never exposed to the browser).
- `PORT`: Server port (defaults to `3000`).

## Local Development

```bash
npm install
npm run dev
```

## Production Build & Server

```bash
npm run build
npm run start
```

## Packaging as an Android APK (Capacitor)

1. Build the web bundle and sync Android native assets:
   ```bash
   npm run cap:sync
   ```
2. Open the `/android` project in Android Studio:
   ```bash
   npm run cap:open
   ```
3. Note on Backend API URL for APK: When building a standalone APK installed on a phone, point API requests to your deployed HTTPS backend URL (or set `server.url` / configure API base URL in `capacitor.config.ts`).
4. Build the signed APK or debug APK from Android Studio (**Build > Build Bundle(s) / APK(s) > Build APK(s)**).
