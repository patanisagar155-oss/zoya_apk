import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Eye,
  Flashlight,
  FlashlightOff,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  ChatMessage,
  Conversation,
  RuntimeCapabilities,
  ZoyaState,
} from '../types/zoya';
import { sendZoyaVision } from '../services/api';
import {
  captureNativeCameraPhoto,
  requestNativeCameraPermission,
  toggleDeviceTorch,
  triggerHaptic,
} from '../native/zoyaAndroidBridge';
import { VoiceVisualizer } from './VoiceVisualizer';

interface LiveVisionViewProps {
  ownerName: string;
  conversation: Conversation | undefined;
  runtime: RuntimeCapabilities;
  isMuted: boolean;
  autoSpeak: boolean;
  voiceState: {
    isListening: boolean;
    isTranscribing: boolean;
    isSpeaking: boolean;
    speakingMessageId: string | null;
    interimTranscript: string;
    audioLevel: number;
  };
  onMicClick: () => void;
  onStopAllVoice: () => void;
  onToggleMute: () => void;
  onSpeakText: (text: string, messageId?: string, fromVoice?: boolean) => void;
  onStopSpeaking: () => void;
  onConversationUpdated: (conversation: Conversation) => void;
  onRegisterVoiceHandler: (
    handler: ((transcript: string) => Promise<void>) | null
  ) => void;
  onClose: () => void;
}

interface CapturedFrame {
  base64: string;
  mimeType: string;
  dataUrl: string;
  capturedAt: string;
}

type CameraStatus = 'requesting' | 'live' | 'paused' | 'stopped' | 'error';

const VISION_QUICK_QUESTIONS = [
  'Zoya, ye kya hai?',
  'Iske baare mein batao.',
  'Ye kaise kaam karta hai?',
  'Iski price kitni ho sakti hai?',
  'Ismein kya problem hai?',
  'Read visible text (OCR)',
];

export function LiveVisionView({
  ownerName,
  conversation,
  runtime,
  isMuted,
  autoSpeak,
  voiceState,
  onMicClick,
  onStopAllVoice,
  onToggleMute,
  onSpeakText,
  onStopSpeaking,
  onConversationUpdated,
  onRegisterVoiceHandler,
  onClose,
}: LiveVisionViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const isAnalyzingRef = useRef(false);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('requesting');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const torchOnRef = useRef(false);
  const [torchNote, setTorchNote] = useState<string | null>(null);

  useEffect(() => {
    torchOnRef.current = torchOn;
  }, [torchOn]);

  const [capturedFrame, setCapturedFrame] = useState<CapturedFrame | null>(null);
  const [promptInput, setPromptInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);
  const [autoWatchEnabled, setAutoWatchEnabled] = useState(false);
  const [lastVisionMessage, setLastVisionMessage] = useState<ChatMessage | null>(null);

  const stopStreamTracks = useCallback(async () => {
    if (torchOnRef.current) {
      const track = streamRef.current?.getVideoTracks()?.[0];
      if (track) {
        try {
          await track.applyConstraints({
            advanced: [{ torch: false } as MediaTrackConstraintSet],
          });
        } catch {
          // Ignore if track already ended
        }
      }
      if (runtime.isNativeAndroid && runtime.hasZoyaPlugin) {
        void toggleDeviceTorch(false);
      }
      torchOnRef.current = false;
      if (mountedRef.current) {
        setTorchOn(false);
      }
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [runtime.hasZoyaPlugin, runtime.isNativeAndroid]);

  const startCamera = useCallback(
    async (targetFacing: 'environment' | 'user') => {
      await stopStreamTracks();
      if (!mountedRef.current) return;

      setCameraStatus('requesting');
      setCameraError(null);
      setTorchNote(null);
      setTorchSupported(false);

      if (runtime.isNativeAndroid && runtime.hasZoyaPlugin) {
        const granted = await requestNativeCameraPermission();
        if (!granted) {
          if (!mountedRef.current) return;
          setCameraStatus('error');
          setCameraError(
            'Camera permission was denied in Android settings. Allow camera access to use Live Vision.'
          );
          return;
        }
      }

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        if (!mountedRef.current) return;
        setCameraStatus('error');
        setCameraError(
          'Live browser camera stream is unavailable here. Use the Native Camera Capture fallback below if on Android.'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!mountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        const videoTrack = stream.getVideoTracks()[0];
        const caps = videoTrack?.getCapabilities?.() as
          | Record<string, unknown>
          | undefined;
        const canTorch =
          targetFacing === 'environment' &&
          Boolean(caps && 'torch' in caps && caps.torch);
        setTorchSupported(
          canTorch || (targetFacing === 'environment' && runtime.isNativeAndroid)
        );

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        setCameraStatus('live');
      } catch (err) {
        if (!mountedRef.current) return;
        setCameraStatus('error');
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
          setCameraError(
            'Camera permission is required for Live Vision. Please allow camera access and tap Start Camera.'
          );
        } else {
          setCameraError(
            `Unable to open live camera preview (${msg || 'no camera device found'}).`
          );
        }
      }
    },
    [runtime.hasZoyaPlugin, runtime.isNativeAndroid, stopStreamTracks]
  );

  // Start camera once Live Vision screen opens (user explicitly tapped LIVE VISION button)
  useEffect(() => {
    mountedRef.current = true;
    void startCamera('environment');

    return () => {
      mountedRef.current = false;
      setAutoWatchEnabled(false);
      onRegisterVoiceHandler(null);
      if (torchOnRef.current && runtime.isNativeAndroid && runtime.hasZoyaPlugin) {
        void toggleDeviceTorch(false);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const captureVideoFrame = useCallback((): CapturedFrame | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      return null;
    }

    const maxDim = 1280;
    const scale = Math.min(
      1,
      maxDim / Math.max(video.videoWidth, video.videoHeight)
    );
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);
    const mimeType = 'image/jpeg';
    const dataUrl = canvas.toDataURL(mimeType, 0.84);
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

    const frame: CapturedFrame = {
      base64,
      mimeType,
      dataUrl,
      capturedAt: new Date().toISOString(),
    };
    setCapturedFrame(frame);
    return frame;
  }, []);

  const analyzeFrameWithQuestion = useCallback(
    async (
      question: string,
      options?: { fromVoice?: boolean; forceFreshCapture?: boolean; silent?: boolean }
    ) => {
      if (isAnalyzingRef.current) return;

      const trimmedPrompt =
        question.trim() || 'Zoya, ye kya hai? Iske baare mein detail mein batao.';

      let frameToSend: CapturedFrame | null = null;
      if (cameraStatus === 'live' && (options?.forceFreshCapture ?? true)) {
        frameToSend = captureVideoFrame();
      }
      if (!frameToSend && capturedFrame) {
        frameToSend = capturedFrame;
      }

      if (!frameToSend) {
        setVisionError(
          'No live frame available yet. Start the camera or capture a photo first.'
        );
        return;
      }

      isAnalyzingRef.current = true;
      setIsAnalyzing(true);
      setVisionError(null);
      if (!options?.silent) {
        onStopSpeaking();
      }

      try {
        const res = await sendZoyaVision({
          conversationId: conversation?.id ?? '',
          imageBase64: frameToSend.base64,
          mimeType: frameToSend.mimeType,
          prompt: trimmedPrompt,
          runtime,
        });

        if (!mountedRef.current) return;
        onConversationUpdated(res.conversation);
        setLastVisionMessage(res.assistantMessage);

        if (!isMuted && (autoSpeak || options?.fromVoice)) {
          onSpeakText(
            res.assistantMessage.content,
            res.assistantMessage.id,
            Boolean(options?.fromVoice)
          );
        }
      } catch (err) {
        if (!mountedRef.current) return;
        setVisionError(
          err instanceof Error ? err.message : 'ZOYA Vision analysis failed.'
        );
      } finally {
        isAnalyzingRef.current = false;
        if (mountedRef.current) {
          setIsAnalyzing(false);
        }
      }
    },
    [
      autoSpeak,
      cameraStatus,
      capturedFrame,
      captureVideoFrame,
      conversation?.id,
      isMuted,
      onConversationUpdated,
      onSpeakText,
      onStopSpeaking,
      runtime,
    ]
  );

  // Route voice questions directly to active Live Vision frame analysis without closing camera
  useEffect(() => {
    onRegisterVoiceHandler(async (transcript: string) => {
      await analyzeFrameWithQuestion(transcript, {
        fromVoice: true,
        forceFreshCapture: true,
      });
    });
    return () => {
      onRegisterVoiceHandler(null);
    };
  }, [analyzeFrameWithQuestion, onRegisterVoiceHandler]);

  // Optional Auto-Watch sampled frames every 8s (only when enabled, live, not paused, not busy)
  useEffect(() => {
    if (!autoWatchEnabled || cameraStatus !== 'live') return;

    const timer = window.setInterval(() => {
      if (
        cameraStatus === 'live' &&
        !isAnalyzingRef.current &&
        !voiceState.isSpeaking &&
        !voiceState.isListening
      ) {
        void analyzeFrameWithQuestion(
          'Briefly describe what you see in front of the camera right now in 1-2 natural Hinglish sentences.',
          { fromVoice: false, forceFreshCapture: true, silent: true }
        );
      }
    }, 8000);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    analyzeFrameWithQuestion,
    autoWatchEnabled,
    cameraStatus,
    voiceState.isListening,
    voiceState.isSpeaking,
  ]);

  const handleSwitchCamera = async () => {
    await triggerHaptic('light');
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    setAutoWatchEnabled(false);
    await startCamera(next);
  };

  const handleToggleTorch = async () => {
    await triggerHaptic('light');
    setTorchNote(null);
    const next = !torchOn;

    const videoTrack = streamRef.current?.getVideoTracks()?.[0];
    const caps = videoTrack?.getCapabilities?.() as
      | Record<string, unknown>
      | undefined;

    if (videoTrack && caps && 'torch' in caps) {
      try {
        await videoTrack.applyConstraints({
          advanced: [{ torch: next } as MediaTrackConstraintSet],
        });
        setTorchOn(next);
        return;
      } catch {
        // Fall through to native Android fallback
      }
    }

    if (runtime.isNativeAndroid && runtime.hasZoyaPlugin && facingMode === 'environment') {
      const res = await toggleDeviceTorch(next);
      if (res.success) {
        setTorchOn(next);
      } else {
        setTorchNote(res.message);
      }
      return;
    }

    setTorchNote(
      facingMode === 'user'
        ? 'Flashlight is only available on the rear camera.'
        : 'Flashlight control is not exposed by this browser/camera sensor.'
    );
  };

  const handleCaptureAndAnalyze = async () => {
    await triggerHaptic('medium');
    if (cameraStatus !== 'live' && cameraStatus !== 'paused') {
      setVisionError('Camera is stopped. Tap Start Camera first.');
      return;
    }
    const frame = captureVideoFrame();
    if (!frame) {
      setVisionError('Camera frame is still initializing. Try again in a moment.');
      return;
    }
    const question =
      promptInput.trim() || 'Zoya, ye kya hai? Iske baare mein detail mein batao.';
    setPromptInput('');
    await analyzeFrameWithQuestion(question, {
      fromVoice: false,
      forceFreshCapture: false,
    });
  };

  const handleNativeCameraFallback = async () => {
    setVisionError(null);
    const nativeRes = await captureNativeCameraPhoto(
      facingMode === 'user' ? 'front' : 'back'
    );
    if (!nativeRes.success || !nativeRes.imageBase64) {
      setVisionError(nativeRes.message);
      return;
    }
    const mimeType = nativeRes.mimeType || 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${nativeRes.imageBase64}`;
    const frame: CapturedFrame = {
      base64: nativeRes.imageBase64,
      mimeType,
      dataUrl,
      capturedAt: new Date().toISOString(),
    };
    setCapturedFrame(frame);

    const question =
      promptInput.trim() || 'Zoya, ye kya hai? Iske baare mein detail mein batao.';
    setPromptInput('');

    isAnalyzingRef.current = true;
    setIsAnalyzing(true);
    try {
      const res = await sendZoyaVision({
        conversationId: conversation?.id ?? '',
        imageBase64: frame.base64,
        mimeType: frame.mimeType,
        prompt: question,
        runtime,
      });
      if (!mountedRef.current) return;
      onConversationUpdated(res.conversation);
      setLastVisionMessage(res.assistantMessage);
      if (!isMuted && autoSpeak) {
        onSpeakText(res.assistantMessage.content, res.assistantMessage.id, false);
      }
    } catch (err) {
      if (mountedRef.current) {
        setVisionError(
          err instanceof Error ? err.message : 'Vision analysis failed.'
        );
      }
    } finally {
      isAnalyzingRef.current = false;
      if (mountedRef.current) setIsAnalyzing(false);
    }
  };

  const handlePauseOrResume = () => {
    if (cameraStatus === 'live') {
      videoRef.current?.pause();
      setAutoWatchEnabled(false);
      setCameraStatus('paused');
    } else if (cameraStatus === 'paused') {
      void videoRef.current?.play().catch(() => {});
      setCameraStatus('live');
    }
  };

  const handleStopCamera = async () => {
    setAutoWatchEnabled(false);
    await stopStreamTracks();
    setCameraStatus('stopped');
  };

  const handleSubmitForm = (e: FormEvent) => {
    e.preventDefault();
    const q = promptInput.trim();
    if (!q || isAnalyzing) return;
    setPromptInput('');
    void analyzeFrameWithQuestion(q, { fromVoice: false, forceFreshCapture: true });
  };

  const handleBack = async () => {
    setAutoWatchEnabled(false);
    await stopStreamTracks();
    onClose();
  };

  const visionZoyaState: ZoyaState = voiceState.isListening
    ? 'listening'
    : isAnalyzing || voiceState.isTranscribing
    ? 'thinking'
    : voiceState.isSpeaking
    ? 'speaking'
    : 'idle';

  const recentVisionMessages = (conversation?.messages ?? [])
    .filter((m) => m.content.startsWith('[Live Vision]') || m.id === lastVisionMessage?.id)
    .slice(-4);

  const displayedAssistantReply =
    lastVisionMessage ??
    recentVisionMessages.filter((m) => m.role === 'assistant').slice(-1)[0] ??
    null;

  return (
    <div className="flex-1 flex flex-col gap-4 pb-4">
      {/* Top Vision Bar + Clear Camera Privacy Indicator */}
      <div className="rounded-2xl bg-[#090304]/95 border border-red-900/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => void handleBack()}
            className="min-h-[38px] px-3 rounded-xl border border-red-950 bg-black hover:border-red-500/70 text-xs font-display font-semibold tracking-wider text-slate-200 inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-red-400" />
            <span>BACK</span>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-red-400 shrink-0" />
              <h1 className="font-display text-sm sm:text-base font-bold tracking-wider text-white truncate">
                ZOYA LIVE CAMERA VISION
              </h1>
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              Single-frame intelligent vision · Talk or ask anything about what ZOYA sees
            </p>
          </div>
        </div>

        {/* Privacy Status Indicator */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-display font-semibold tracking-wider ${
              cameraStatus === 'live'
                ? 'bg-red-600/20 border-red-500 text-red-200'
                : cameraStatus === 'paused'
                ? 'bg-amber-950/50 border-amber-500/60 text-amber-200'
                : 'bg-black border-red-950 text-slate-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                cameraStatus === 'live'
                  ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.9)]'
                  : cameraStatus === 'paused'
                  ? 'bg-amber-400'
                  : 'bg-slate-600'
              }`}
            />
            {cameraStatus === 'live'
              ? `CAMERA LIVE · ${facingMode === 'environment' ? 'REAR' : 'FRONT'}`
              : cameraStatus === 'paused'
              ? 'CAMERA PAUSED'
              : cameraStatus === 'requesting'
              ? 'REQUESTING CAMERA...'
              : 'CAMERA OFF'}
          </span>
        </div>
      </div>

      {/* Main Split Grid: Left Camera Feed + Controls | Right ZOYA Vision Intelligence & Voice */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: Live Camera Preview & Hardware Controls */}
        <section className="lg:col-span-6 rounded-3xl bg-[#060203]/95 border border-red-950/90 p-4 flex flex-col gap-3.5">
          <div className="relative rounded-2xl overflow-hidden bg-black border border-red-900/70 aspect-[4/3] flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${
                facingMode === 'user' ? 'scale-x-[-1]' : ''
              } ${cameraStatus === 'live' || cameraStatus === 'paused' ? 'block' : 'hidden'}`}
            />

            {/* Futuristic JARVIS Targeting Brackets */}
            {(cameraStatus === 'live' || cameraStatus === 'paused') && (
              <div className="pointer-events-none absolute inset-4">
                <div className="absolute top-0 left-0 w-7 h-7 border-t-2 border-l-2 border-red-500/80 rounded-tl-md" />
                <div className="absolute top-0 right-0 w-7 h-7 border-t-2 border-r-2 border-red-500/80 rounded-tr-md" />
                <div className="absolute bottom-0 left-0 w-7 h-7 border-b-2 border-l-2 border-red-500/80 rounded-bl-md" />
                <div className="absolute bottom-0 right-0 w-7 h-7 border-b-2 border-r-2 border-red-500/80 rounded-br-md" />
              </div>
            )}

            {/* Analyzing Overlay */}
            {isAnalyzing && (
              <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 text-center p-4">
                <Loader2 className="w-8 h-8 text-red-400 animate-spin" />
                <span className="font-display text-xs tracking-widest text-red-200">
                  ANALYZING FRAME WITH GEMINI VISION...
                </span>
              </div>
            )}

            {/* Fallback / Stopped / Requesting State */}
            {(cameraStatus === 'requesting' ||
              cameraStatus === 'stopped' ||
              cameraStatus === 'error') && (
              <div className="p-6 text-center space-y-3 max-w-sm">
                {capturedFrame ? (
                  <img
                    src={capturedFrame.dataUrl}
                    alt="Last captured camera frame"
                    className="w-full max-h-48 object-contain rounded-xl border border-red-900/70 mx-auto"
                  />
                ) : (
                  <Camera className="w-10 h-10 text-red-500/80 mx-auto" />
                )}
                <p className="text-xs text-slate-300 leading-relaxed">
                  {cameraStatus === 'requesting'
                    ? 'Requesting camera permission & initializing sensor...'
                    : cameraError ||
                      'Camera is turned off. Privacy indicator is OFF — tap Start Camera whenever you want ZOYA to look.'}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => void startCamera(facingMode)}
                    className="min-h-[42px] px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-xs font-display font-semibold tracking-wider text-white inline-flex items-center gap-1.5"
                  >
                    <Camera className="w-4 h-4" />
                    <span>START CAMERA</span>
                  </button>
                  {runtime.isNativeAndroid && (
                    <button
                      type="button"
                      onClick={() => void handleNativeCameraFallback()}
                      className="min-h-[42px] px-4 rounded-xl border border-red-800 bg-black hover:border-red-500 text-xs font-display font-semibold tracking-wider text-red-200 inline-flex items-center gap-1.5"
                    >
                      <Camera className="w-4 h-4" />
                      <span>ANDROID CAMERA</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {torchNote && (
            <div className="rounded-xl bg-amber-950/40 border border-amber-700/50 px-3 py-2 text-xs text-amber-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{torchNote}</span>
            </div>
          )}

          {/* Camera Control Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => void handleCaptureAndAnalyze()}
              disabled={
                isAnalyzing || (cameraStatus !== 'live' && cameraStatus !== 'paused')
              }
              className="min-h-[44px] px-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 disabled:opacity-45 text-xs font-display font-semibold tracking-wider text-white inline-flex items-center justify-center gap-1.5 col-span-2 sm:col-span-1 shadow-[0_0_20px_rgba(220,38,38,0.4)]"
            >
              <Sparkles className="w-4 h-4" />
              <span>CAPTURE IMAGE</span>
            </button>

            <button
              type="button"
              onClick={() => void handleSwitchCamera()}
              disabled={cameraStatus === 'requesting'}
              className="min-h-[44px] px-3 rounded-xl bg-black border border-red-950 hover:border-red-500/70 text-xs font-display font-semibold tracking-wider text-slate-200 inline-flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-red-400" />
              <span>{facingMode === 'environment' ? 'REAR' : 'FRONT'} CAM</span>
            </button>

            <button
              type="button"
              onClick={() => void handleToggleTorch()}
              disabled={cameraStatus !== 'live'}
              title={
                torchSupported
                  ? 'Toggle camera flashlight'
                  : 'Torch depends on rear hardware support'
              }
              className={`min-h-[44px] px-3 rounded-xl border text-xs font-display font-semibold tracking-wider inline-flex items-center justify-center gap-1.5 disabled:opacity-40 ${
                torchOn
                  ? 'bg-red-600/25 border-red-500 text-red-200'
                  : 'bg-black border-red-950 hover:border-red-500/70 text-slate-200'
              }`}
            >
              {torchOn ? (
                <Flashlight className="w-3.5 h-3.5 text-red-400" />
              ) : (
                <FlashlightOff className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>FLASH {torchOn ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={handlePauseOrResume}
              disabled={cameraStatus !== 'live' && cameraStatus !== 'paused'}
              className="min-h-[44px] px-3 rounded-xl bg-black border border-red-950 hover:border-red-500/70 disabled:opacity-40 text-xs font-display font-semibold tracking-wider text-slate-200 inline-flex items-center justify-center gap-1.5"
            >
              {cameraStatus === 'paused' ? (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>RESUME</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-400" />
                  <span>PAUSE</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => void handleStopCamera()}
              disabled={cameraStatus === 'stopped'}
              className="min-h-[44px] px-3 rounded-xl bg-red-950/40 border border-red-800/80 hover:border-red-500 disabled:opacity-40 text-xs font-display font-semibold tracking-wider text-red-200 inline-flex items-center justify-center gap-1.5"
            >
              <Square className="w-3.5 h-3.5 fill-red-400 text-red-400" />
              <span>STOP CAMERA</span>
            </button>

            <button
              type="button"
              onClick={() => setAutoWatchEnabled((v) => !v)}
              disabled={cameraStatus !== 'live'}
              className={`min-h-[44px] px-3 rounded-xl border text-xs font-display font-semibold tracking-wider inline-flex items-center justify-center gap-1.5 disabled:opacity-40 ${
                autoWatchEnabled
                  ? 'bg-red-600/25 border-red-500 text-red-200'
                  : 'bg-black border-red-950 hover:border-red-500/70 text-slate-300'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-red-400" />
              <span>AUTO 8S: {autoWatchEnabled ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </section>

        {/* Right: Voice + Questions + ZOYA Multimodal Response */}
        <section className="lg:col-span-6 rounded-3xl bg-[#070304]/95 border border-red-950/90 p-4 sm:p-5 flex flex-col justify-between gap-4">
          {/* Voice Control Header for Camera Mode */}
          <div className="rounded-2xl bg-black/80 border border-red-950/90 p-3.5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-display text-xs font-semibold tracking-wider text-red-300">
                  ASK ZOYA ABOUT THIS VIEW ({ownerName})
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {voiceState.isListening
                    ? voiceState.interimTranscript || 'Listening to your question...'
                    : isAnalyzing
                    ? 'Inspecting camera image with Gemini Vision...'
                    : voiceState.isSpeaking
                    ? 'ZOYA is explaining...'
                    : 'Tap Mic & ask in Hindi, Gujarati, or Hinglish without closing camera'}
                </p>
              </div>
              <VoiceVisualizer
                state={visionZoyaState}
                audioLevel={voiceState.audioLevel}
              />
            </div>

            <div className="flex items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={onToggleMute}
                className={`min-h-[42px] px-3 rounded-xl border text-xs font-display font-semibold tracking-wider inline-flex items-center gap-1.5 ${
                  isMuted
                    ? 'bg-red-600/25 border-red-500 text-red-200'
                    : 'bg-[#0B0405] border-red-950 text-slate-300 hover:border-red-500/60'
                }`}
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-red-400" />
                )}
                <span>{isMuted ? 'MUTED' : 'VOICE ON'}</span>
              </button>

              <button
                type="button"
                onClick={onMicClick}
                className={`min-h-[46px] flex-1 px-4 rounded-xl flex items-center justify-center gap-2 font-display text-xs font-semibold tracking-wider text-white transition-all ${
                  voiceState.isListening
                    ? 'bg-gradient-to-r from-red-500 to-rose-600 shadow-[0_0_25px_rgba(239,68,68,0.65)]'
                    : 'bg-gradient-to-r from-red-600 to-rose-800 hover:from-red-500 hover:to-rose-700 border border-red-400/40'
                }`}
              >
                {voiceState.isListening ? (
                  <>
                    <MicOff className="w-4 h-4" />
                    <span>STOP LISTENING</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>ASK WITH VOICE</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onStopAllVoice}
                disabled={!voiceState.isSpeaking && !voiceState.isListening}
                className="min-h-[42px] px-3 rounded-xl border border-red-950 bg-[#0B0405] disabled:opacity-40 text-xs font-display font-semibold tracking-wider text-slate-300 inline-flex items-center gap-1.5"
              >
                <Square className="w-3.5 h-3.5 fill-red-400 text-red-400" />
                <span>STOP</span>
              </button>
            </div>
          </div>

          {/* Last Captured Thumbnail + ZOYA Vision Explanation */}
          <div className="flex-1 rounded-2xl bg-black/80 border border-red-950/90 p-4 flex flex-col gap-3 min-h-[190px] max-h-[300px] overflow-y-auto">
            {visionError && (
              <div className="rounded-xl bg-red-950/60 border border-red-500/60 px-3 py-2.5 text-xs text-red-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{visionError}</span>
              </div>
            )}

            {capturedFrame && (
              <div className="flex items-center gap-3 pb-2.5 border-b border-red-950/70">
                <img
                  src={capturedFrame.dataUrl}
                  alt="Captured frame"
                  className="w-16 h-12 object-cover rounded-lg border border-red-900/70 shrink-0"
                />
                <div className="min-w-0">
                  <div className="font-display text-[11px] font-semibold tracking-wider text-red-300">
                    LAST SAMPLED FRAME
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Captured at {new Date(capturedFrame.capturedAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            )}

            {displayedAssistantReply ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-[11px] font-semibold tracking-wider text-red-400">
                    ZOYA VISION
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      voiceState.isSpeaking
                        ? onStopSpeaking()
                        : onSpeakText(
                            displayedAssistantReply.content,
                            displayedAssistantReply.id,
                            false
                          )
                    }
                    className="text-xs text-red-300 hover:text-white inline-flex items-center gap-1"
                  >
                    {voiceState.isSpeaking ? (
                      <>
                        <Square className="w-3 h-3 fill-red-400 text-red-400" />
                        <span>Stop Voice</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Listen</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap">
                  {displayedAssistantReply.content}
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-6 px-3 text-slate-400 text-xs space-y-1.5">
                <Sparkles className="w-5 h-5 text-red-400/80" />
                <p className="text-slate-200 font-medium">
                  Point your camera at any object, book, food, plant, machine, or text.
                </p>
                <p>
                  Tap <strong className="text-red-300">CAPTURE IMAGE</strong>, tap a question below, or press{' '}
                  <strong className="text-red-300">ASK WITH VOICE</strong>.
                </p>
              </div>
            )}
          </div>

          {/* Hinglish / English Quick Vision Questions */}
          <div>
            <p className="text-[11px] font-display tracking-wider text-slate-400 mb-2">
              QUICK QUESTIONS
            </p>
            <div className="flex flex-wrap gap-1.5">
              {VISION_QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={isAnalyzing}
                  onClick={() =>
                    void analyzeFrameWithQuestion(q, {
                      fromVoice: false,
                      forceFreshCapture: true,
                    })
                  }
                  className="px-2.5 py-1.5 rounded-lg bg-black hover:bg-red-950/45 border border-red-950 hover:border-red-500/60 disabled:opacity-40 text-xs text-slate-200 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Typed Question Form */}
          <form onSubmit={handleSubmitForm} className="flex items-center gap-2">
            <input
              type="text"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="Ask about camera view (e.g. Zoya, ye kya hai?)"
              className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#090405] border border-red-950 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500"
            />
            <button
              type="submit"
              disabled={!promptInput.trim() || isAnalyzing}
              aria-label="Ask ZOYA about camera view"
              className="min-w-[44px] min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 disabled:opacity-40 text-white inline-flex items-center justify-center shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
