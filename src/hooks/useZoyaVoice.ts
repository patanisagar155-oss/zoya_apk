import { useCallback, useEffect, useRef, useState } from 'react';
import { ZoyaLanguage, ZoyaSettings } from '../types/zoya';
import { ApiError, fetchGeminiTtsAudio, transcribeAudioBlob } from '../services/api';
import { triggerHaptic } from '../native/zoyaAndroidBridge';

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [altIndex: number]: { transcript: string };
    };
  };
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as Record<string, unknown>;
  return (win.SpeechRecognition || win.webkitSpeechRecognition || null) as
    | (new () => SpeechRecognitionInstance)
    | null;
}

function mapLanguageToBcp47(lang: ZoyaLanguage, textHint?: string): string {
  if (textHint) {
    if (/[\u0A80-\u0AFF]/.test(textHint)) return 'gu-IN';
    if (/[\u0900-\u097F]/.test(textHint)) return 'hi-IN';
  }
  if (lang === 'hi') return 'hi-IN';
  if (lang === 'gu') return 'gu-IN';
  return 'en-IN';
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.replace(/\s/g, '');
  const binary = atob(clean);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function useZoyaVoice(params: {
  settings: ZoyaSettings;
  onFinalTranscript: (transcript: string) => void;
  onVoiceError?: (message: string) => void;
}) {
  const { settings, onFinalTranscript, onVoiceError } = params;

  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micAudioContextRef = useRef<AudioContext | null>(null);
  const micLevelRafRef = useRef<number | null>(null);

  // Playback Web Audio refs (single active stream guaranteed)
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activeGainRef = useRef<GainNode | null>(null);
  const playbackLevelRafRef = useRef<number | null>(null);
  const speakTokenRef = useRef<number>(0);
  const continuousRef = useRef<boolean>(settings.continuousMode);
  const speechVolumeRef = useRef<number>(settings.speechVolume);
  const ttsCooldownUntilRef = useRef<number>(0);
  const quotaNotifiedRef = useRef<boolean>(false);
  const ttsCacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    continuousRef.current = settings.continuousMode;
  }, [settings.continuousMode]);

  useEffect(() => {
    speechVolumeRef.current = settings.speechVolume;
  }, [settings.speechVolume]);

  // Live volume & speed adjustments while Gemini TTS audio is playing
  useEffect(() => {
    if (activeGainRef.current && playbackCtxRef.current) {
      activeGainRef.current.gain.setTargetAtTime(
        settings.speechVolume,
        playbackCtxRef.current.currentTime,
        0.03
      );
    }
    if (activeSourceRef.current) {
      activeSourceRef.current.playbackRate.value = settings.speechRate;
    }
  }, [settings.speechRate, settings.speechVolume]);

  const stopMicMeter = useCallback(() => {
    if (micLevelRafRef.current !== null) {
      cancelAnimationFrame(micLevelRafRef.current);
      micLevelRafRef.current = null;
    }
    if (micAudioContextRef.current) {
      micAudioContextRef.current.close().catch(() => {});
      micAudioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const stopSpeaking = useCallback(() => {
    speakTokenRef.current += 1;

    if (playbackLevelRafRef.current !== null) {
      cancelAnimationFrame(playbackLevelRafRef.current);
      playbackLevelRafRef.current = null;
    }

    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.onended = null;
        activeSourceRef.current.stop();
        activeSourceRef.current.disconnect();
      } catch {
        // Ignore if already stopped
      }
      activeSourceRef.current = null;
    }

    if (activeGainRef.current) {
      try {
        activeGainRef.current.disconnect();
      } catch {
        // Ignore
      }
      activeGainRef.current = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setIsSpeaking(false);
    setSpeakingMessageId(null);
    setAudioLevel(0);
  }, []);

  const startMicMeter = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      micAudioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i += 1) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length / 255;
        setAudioLevel(Math.min(1, avg * 2.4));
        micLevelRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Ignore AudioContext failure
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore
      }
    }
    stopMicMeter();
    setIsListening(false);
  }, [stopMicMeter]);

  const startListening = useCallback(async () => {
    // Interrupt ZOYA immediately if she is currently speaking
    stopSpeaking();
    await triggerHaptic('light');

    const SpeechCtor = getSpeechRecognitionCtor();
    setInterimTranscript('');

    let micStream: MediaStream | null = null;
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = micStream;
        startMicMeter(micStream);
      } catch {
        onVoiceError?.(
          'Microphone permission was denied. Please allow microphone access to talk with ZOYA.'
        );
        return;
      }
    }

    if (SpeechCtor) {
      try {
        const recognition = new SpeechCtor();
        recognitionRef.current = recognition;
        recognition.lang = mapLanguageToBcp47(settings.preferredLanguage);
        recognition.interimResults = true;
        recognition.continuous = false;
        recognition.maxAlternatives = 1;

        let finalText = '';

        recognition.onresult = (event) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const transcript = event.results[i][0]?.transcript ?? '';
            if (event.results[i].isFinal) {
              finalText += `${transcript} `;
            } else {
              interim += transcript;
            }
          }
          setInterimTranscript((finalText + interim).trim());
        };

        recognition.onerror = (ev) => {
          if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
            onVoiceError?.(
              'Microphone / speech recognition permission denied. Please enable mic access in your browser or Android App Settings.'
            );
          } else if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
            onVoiceError?.(`Voice recognition issue: ${ev.error}`);
          }
        };

        recognition.onend = () => {
          recognitionRef.current = null;
          stopMicMeter();
          setIsListening(false);
          const cleaned = finalText.trim();
          setInterimTranscript('');
          if (cleaned) {
            onFinalTranscript(cleaned);
          }
        };

        setIsListening(true);
        recognition.start();
        return;
      } catch {
        // Fall through to MediaRecorder + Gemini transcription
      }
    }

    if (micStream && typeof MediaRecorder !== 'undefined') {
      try {
        audioChunksRef.current = [];
        const recorder = new MediaRecorder(micStream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = async () => {
          const blob = new Blob(audioChunksRef.current, {
            type: recorder.mimeType || 'audio/webm',
          });
          stopMicMeter();
          setIsListening(false);
          if (blob.size < 600) return;
          setIsTranscribing(true);
          try {
            const transcript = await transcribeAudioBlob(blob);
            if (transcript) {
              onFinalTranscript(transcript);
            }
          } catch (err) {
            onVoiceError?.(
              err instanceof Error ? err.message : 'Unable to transcribe audio.'
            );
          } finally {
            setIsTranscribing(false);
          }
        };

        setIsListening(true);
        recorder.start();
      } catch {
        stopMicMeter();
        setIsListening(false);
        onVoiceError?.('Speech capture is not supported in this browser.');
      }
    } else {
      stopMicMeter();
      onVoiceError?.('Speech recognition is unavailable on this device.');
    }
  }, [
    onFinalTranscript,
    onVoiceError,
    settings.preferredLanguage,
    startMicMeter,
    stopMicMeter,
    stopSpeaking,
  ]);

  const getOrCreatePlaybackContext = useCallback((): AudioContext => {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      throw new Error('Web Audio API is not supported in this browser.');
    }
    if (!playbackCtxRef.current || playbackCtxRef.current.state === 'closed') {
      playbackCtxRef.current = new AudioCtx();
    }
    return playbackCtxRef.current;
  }, []);

  const speak = useCallback(
    async (
      text: string,
      messageId?: string,
      allowContinuousChain = false,
      forceUnmuted = false
    ) => {
      // Cancel any ongoing audio immediately to prevent overlap
      stopSpeaking();
      const currentToken = speakTokenRef.current;

      setIsSpeaking(true);
      setSpeakingMessageId(messageId ?? null);

      const handleFinished = () => {
        if (
          currentToken === speakTokenRef.current &&
          allowContinuousChain &&
          continuousRef.current
        ) {
          window.setTimeout(() => {
            if (currentToken === speakTokenRef.current) {
              void startListening();
            }
          }, 350);
        }
      };

      const targetVolume = forceUnmuted
        ? Math.max(0.75, speechVolumeRef.current)
        : speechVolumeRef.current;

      const speakWithDeviceSpeech = (): boolean => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
          return false;
        }
        const cleaned = text
          .replace(/```[\s\S]*?```/g, ' Code snippet screen par dikhaya hai. ')
          .replace(/https?:\/\/\S+/g, '')
          .replace(/[*_`#>]/g, '')
          .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
          .trim();
        if (!cleaned) return false;

        const targetLang = mapLanguageToBcp47(settings.preferredLanguage, cleaned);
        const voices = window.speechSynthesis.getVoices();
        const langPrefix = targetLang.split('-')[0].toLowerCase();
        const preferredFemaleRe =
          /(neerja|swara|heera|kalpana|lekha|veena|raveena|aditi|kajal|ananya|google हिन्दी|google ગુજરાતી|female)/i;

        const matchingVoice =
          voices.find(
            (v) =>
              v.lang.toLowerCase() === targetLang.toLowerCase() &&
              preferredFemaleRe.test(v.name)
          ) ||
          voices.find(
            (v) =>
              v.lang.toLowerCase().startsWith(langPrefix) &&
              preferredFemaleRe.test(v.name)
          ) ||
          voices.find((v) => v.lang.toLowerCase().includes('-in') && preferredFemaleRe.test(v.name)) ||
          voices.find((v) => v.lang.toLowerCase() === targetLang.toLowerCase()) ||
          voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix)) ||
          voices.find((v) => v.lang.toLowerCase().includes('-in')) ||
          null;

        const utterance = new SpeechSynthesisUtterance(cleaned);
        utterance.lang = targetLang;
        if (matchingVoice) {
          utterance.voice = matchingVoice;
        }
        utterance.rate = settings.speechRate;
        utterance.pitch = 1.08;
        utterance.volume = targetVolume;
        utterance.onend = () => {
          if (currentToken !== speakTokenRef.current) return;
          setIsSpeaking(false);
          setSpeakingMessageId(null);
          setAudioLevel(0);
          handleFinished();
        };
        utterance.onerror = () => {
          if (currentToken !== speakTokenRef.current) return;
          setIsSpeaking(false);
          setSpeakingMessageId(null);
          setAudioLevel(0);
        };
        window.speechSynthesis.speak(utterance);
        return true;
      };

      // Use system speech immediately if chosen in Settings or while Gemini TTS Free Tier is in 429 cooldown
      const inQuotaCooldown = Date.now() < ttsCooldownUntilRef.current;
      if (settings.voiceEngine === 'webspeech' || inQuotaCooldown) {
        const started = speakWithDeviceSpeech();
        if (!started) {
          setIsSpeaking(false);
          setSpeakingMessageId(null);
          if (settings.voiceEngine === 'webspeech') {
            onVoiceError?.('Device system speech synthesis is unavailable.');
          }
        }
        return;
      }

      try {
        const cacheKey = `${settings.voicePersona}:${settings.preferredLanguage}:${text.trim()}`;
        let audioBase64 = ttsCacheRef.current.get(cacheKey);

        if (!audioBase64) {
          const ttsResult = await fetchGeminiTtsAudio(
            text,
            settings.voicePersona,
            settings.preferredLanguage
          );
          audioBase64 = ttsResult.audioBase64;
          if (ttsCacheRef.current.size >= 25) {
            const firstKey = ttsCacheRef.current.keys().next().value;
            if (firstKey) ttsCacheRef.current.delete(firstKey);
          }
          ttsCacheRef.current.set(cacheKey, audioBase64);
        }

        // If user interrupted or started another speech request while waiting, abort cleanly
        if (currentToken !== speakTokenRef.current) return;

        const audioCtx = getOrCreatePlaybackContext();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        const rawBuffer = base64ToArrayBuffer(audioBase64);
        const decodedBuffer = await audioCtx.decodeAudioData(rawBuffer.slice(0));

        if (currentToken !== speakTokenRef.current) return;

        const sourceNode = audioCtx.createBufferSource();
        sourceNode.buffer = decodedBuffer;
        sourceNode.playbackRate.value = settings.speechRate;

        const gainNode = audioCtx.createGain();
        gainNode.gain.value = forceUnmuted
          ? Math.max(0.75, speechVolumeRef.current)
          : speechVolumeRef.current;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;

        sourceNode.connect(analyser);
        analyser.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        activeSourceRef.current = sourceNode;
        activeGainRef.current = gainNode;

        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const tickVisualizer = () => {
          if (currentToken !== speakTokenRef.current) return;
          analyser.getByteFrequencyData(freqData);
          let sum = 0;
          for (let i = 0; i < freqData.length; i += 1) {
            sum += freqData[i];
          }
          const level = Math.min(1, (sum / freqData.length / 255) * 2.2);
          setAudioLevel(level);
          playbackLevelRafRef.current = requestAnimationFrame(tickVisualizer);
        };
        tickVisualizer();

        sourceNode.onended = () => {
          if (playbackLevelRafRef.current !== null) {
            cancelAnimationFrame(playbackLevelRafRef.current);
            playbackLevelRafRef.current = null;
          }
          if (activeSourceRef.current === sourceNode) {
            activeSourceRef.current = null;
            activeGainRef.current = null;
          }
          if (currentToken !== speakTokenRef.current) return;
          setIsSpeaking(false);
          setSpeakingMessageId(null);
          setAudioLevel(0);
          handleFinished();
        };

        sourceNode.start(0);
      } catch (err) {
        if (currentToken !== speakTokenRef.current) return;

        const isQuotaExhausted =
          (err instanceof ApiError &&
            (err.status === 429 ||
              err.code === 'TTS_QUOTA_EXCEEDED' ||
              Boolean(err.fallbackToWebSpeech))) ||
          (err instanceof Error &&
            (err.message.includes('429') ||
              err.message.includes('RESOURCE_EXHAUSTED') ||
              err.message.toLowerCase().includes('quota')));

        if (isQuotaExhausted) {
          ttsCooldownUntilRef.current = Date.now() + 5 * 60_000;
          const startedFallback = speakWithDeviceSpeech();
          if (!quotaNotifiedRef.current) {
            quotaNotifiedRef.current = true;
            onVoiceError?.(
              startedFallback
                ? 'Gemini Free Tier TTS daily quota (10/day) reached — switched to device fallback voice. Select a billing-enabled key in Settings > Secrets for unlimited Gemini neural voice.'
                : 'Gemini Free Tier TTS daily quota (10/day) reached. Select a billing-enabled API key in Settings > Secrets to resume voice playback.'
            );
          }
          if (startedFallback) return;
        }

        setIsSpeaking(false);
        setSpeakingMessageId(null);
        setAudioLevel(0);
        if (!isQuotaExhausted) {
          const message =
            err instanceof Error
              ? err.message
              : 'Failed to generate ZOYA Gemini 3.8 Flash TTS voice.';
          onVoiceError?.(`Voice synthesis failed: ${message}`);
        }
      }
    },
    [
      getOrCreatePlaybackContext,
      onVoiceError,
      settings.preferredLanguage,
      settings.speechRate,
      settings.speechVolume,
      settings.voiceEngine,
      settings.voicePersona,
      startListening,
      stopSpeaking,
    ]
  );

  useEffect(() => {
    return () => {
      stopSpeaking();
      stopListening();
      if (playbackCtxRef.current && playbackCtxRef.current.state !== 'closed') {
        playbackCtxRef.current.close().catch(() => {});
      }
    };
  }, [stopListening, stopSpeaking]);

  return {
    isListening,
    isTranscribing,
    isSpeaking,
    speakingMessageId,
    interimTranscript,
    audioLevel,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
}
