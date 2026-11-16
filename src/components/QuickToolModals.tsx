import { FormEvent, useEffect, useRef, useState } from 'react';
import { Camera, Phone, X } from 'lucide-react';

interface DialerModalProps {
  open: boolean;
  onClose: () => void;
  onDial: (phoneNumber: string) => void;
}

export function DialerModal({ open, onClose, onDial }: DialerModalProps) {
  const [number, setNumber] = useState('');

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!number.trim()) return;
    onDial(number.trim());
    setNumber('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialer-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-[#0B0405] border border-red-900/60 p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Phone className="w-5 h-5 text-red-400" />
            <h3 id="dialer-title" className="font-display text-base font-semibold text-white">
              Quick Call Dialer
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-950/60"
            aria-label="Close dialer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="tel"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Enter phone number (e.g. +91 9876543210)"
            autoFocus
            className="w-full min-h-[46px] px-4 rounded-xl bg-black border border-red-900/60 text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500"
          />
          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-red-950 text-xs font-medium text-slate-300 hover:bg-red-950/30"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!number.trim()}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 disabled:opacity-45 text-xs font-semibold text-white"
            >
              Open Phone Dialer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CameraPreviewModalProps {
  open: boolean;
  onClose: () => void;
}

export function CameraPreviewModal({ open, onClose }: CameraPreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    setErrorMsg(null);
    setCapturedUrl(null);

    async function startCam() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMsg('Camera access is not available in this browser context.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setErrorMsg(
          'Camera permission denied or no camera hardware detected on this device.'
        );
      }
    }
    void startCam();

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [open]);

  if (!open) return null;

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setCapturedUrl(canvas.toDataURL('image/jpeg', 0.9));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-[#0B0405] border border-red-900/60 p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Camera className="w-5 h-5 text-red-400" />
            <h3
              id="camera-modal-title"
              className="font-display text-base font-semibold text-white"
            >
              Camera Viewfinder
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-950/60"
            aria-label="Close camera"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-xl overflow-hidden bg-black border border-red-950 aspect-video flex items-center justify-center">
          {errorMsg ? (
            <p className="p-4 text-xs text-slate-400 text-center">{errorMsg}</p>
          ) : capturedUrl ? (
            <img
              src={capturedUrl}
              alt="Captured snapshot"
              className="w-full h-full object-cover"
            />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          )}
        </div>

        <div className="flex justify-end gap-2.5">
          {capturedUrl ? (
            <a
              href={capturedUrl}
              download={`zoya-capture-${Date.now()}.jpg`}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-semibold text-white inline-flex items-center"
            >
              Save Snapshot
            </a>
          ) : (
            !errorMsg && (
              <button
                type="button"
                onClick={handleCapture}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-xs font-semibold text-white"
              >
                Capture Frame
              </button>
            )
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-red-950 text-xs font-medium text-slate-300 hover:bg-red-950/30"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
