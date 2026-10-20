import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, RefreshCw, X, Image as ImageIcon, Zap, AlertCircle, SwitchCamera } from 'lucide-react';

interface Props {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}

export const CameraModal: React.FC<Props> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isStarting, setIsStarting] = useState(true);

  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  const startCamera = useCallback(async (mode: 'environment' | 'user' = facingMode) => {
    setIsStarting(true);
    setErrorMsg(null);
    setTorchOn(false);
    setHasTorch(false);

    // Stop current stream if running
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          'Kamera tidak didukung oleh browser Anda atau halaman tidak dibuka melalui protokol aman (HTTPS/localhost).'
        );
      }

      // Priority constraints: high resolution for clear document scanning
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 2560, min: 1280 },
          height: { ideal: 1440, min: 720 },
        },
        audio: false,
      };

      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        // Fallback to basic constraints if high-res failed
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode },
          audio: false,
        });
      }

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }

      // Check for torch capability
      const track = mediaStream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        const capabilities = track.getCapabilities() as Record<string, unknown>;
        if ('torch' in capabilities) {
          setHasTorch(true);
        }
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setErrorMsg(
          'Izin kamera ditolak. Berikan izin kamera di setelan peramban Anda, atau gunakan opsi Impor Galeri di bawah.'
        );
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setErrorMsg('Tidak ada perangkat kamera yang terdeteksi di perangkat Anda.');
      } else {
        setErrorMsg(error.message || 'Gagal menyalakan kamera.');
      }
    } finally {
      setIsStarting(false);
    }
  }, [facingMode, stream]);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      stopStream();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTorch = async () => {
    if (!stream || !hasTorch) return;
    const track = stream.getVideoTracks()[0];
    try {
      const nextState = !torchOn;
      // @ts-expect-error torch constraint in standard web types
      await track.applyConstraints({ advanced: [{ torch: nextState }] });
      setTorchOn(nextState);
    } catch {
      // Ignored if device doesn't support changing torch
    }
  };

  const switchCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    // Haptic vibration feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(40);
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // If front camera, un-mirror horizontally
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          stopStream();
          onCapture(blob);
        }
      },
      'image/jpeg',
      0.95
    );
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      stopStream();
      onCapture(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between overflow-hidden select-none">
      {/* Top Controls Bar */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/90 to-transparent z-20 safe-area-top">
        <button
          onClick={() => {
            stopStream();
            onClose();
          }}
          className="p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white active:scale-95 transition-transform"
          aria-label="Tutup kamera"
        >
          <X className="w-5 h-5" />
        </button>

        <span className="text-white font-medium text-sm tracking-wide bg-black/40 px-3 py-1 rounded-full border border-white/10">
          Arahkan Dokumen
        </span>

        <div className="flex items-center gap-2">
          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`p-2.5 rounded-full active:scale-95 transition-transform ${
                torchOn ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/30' : 'bg-slate-900/80 text-white'
              }`}
              aria-label="Lampu flash"
            >
              <Zap className="w-5 h-5" />
            </button>
          )}

          <button
            onClick={switchCamera}
            className="p-2.5 rounded-full bg-slate-900/80 text-white active:scale-95 transition-transform"
            aria-label="Ganti kamera"
          >
            <SwitchCamera className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Viewfinder */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
        {errorMsg ? (
          <div className="p-6 text-center max-w-sm bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl mx-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h4 className="font-semibold text-white mb-2">Kamera Tidak Tersedia</h4>
            <p className="text-xs text-slate-300 leading-relaxed mb-5">{errorMsg}</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg"
              >
                <ImageIcon className="w-4 h-4" />
                Pilih Foto dari Galeri
              </button>
              <button
                onClick={() => startCamera(facingMode)}
                className="w-full py-2 text-slate-300 hover:text-white text-xs flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Coba Nyalakan Ulang
              </button>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* Document Guide Frame Overlay */}
            <div className="absolute inset-x-6 inset-y-12 pointer-events-none flex flex-col justify-between">
              {/* Top Corners */}
              <div className="flex justify-between">
                <div className="w-8 h-8 border-t-4 border-l-4 border-cyan-400 rounded-tl-lg" />
                <div className="w-8 h-8 border-t-4 border-r-4 border-cyan-400 rounded-tr-lg" />
              </div>

              {/* Center Guidance Badge */}
              <div className="self-center bg-black/60 backdrop-blur-xs text-cyan-300 text-[11px] font-medium px-3 py-1 rounded-full border border-cyan-400/30">
                Posisikan dokumen sejajar bingkai
              </div>

              {/* Bottom Corners */}
              <div className="flex justify-between">
                <div className="w-8 h-8 border-b-4 border-l-4 border-cyan-400 rounded-bl-lg" />
                <div className="w-8 h-8 border-b-4 border-r-4 border-cyan-400 rounded-br-lg" />
              </div>
            </div>

            {isStarting && (
              <div className="absolute inset-0 bg-black flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-3 border-blue-500 border-t-transparent" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Shutter & Gallery Bar */}
      <div className="p-6 bg-gradient-to-t from-black via-slate-950/95 to-slate-950/60 flex items-center justify-around safe-area-bottom z-20">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          className="hidden"
          onChange={handleFileImport}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center text-slate-300 active:scale-90 transition-transform"
          aria-label="Pilih dari Galeri"
        >
          <div className="p-3 bg-slate-800/80 rounded-full mb-1 border border-slate-700">
            <ImageIcon className="w-5 h-5 text-blue-400" />
          </div>
          <span className="text-[11px]">Galeri</span>
        </button>

        {/* Big Shutter Button */}
        <button
          onClick={capturePhoto}
          disabled={!!errorMsg || isStarting}
          className="relative w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30 disabled:pointer-events-none shadow-xl"
          aria-label="Jepret Foto"
        >
          <div className="w-16 h-16 rounded-full bg-blue-500 shadow-inner hover:bg-blue-400 transition-colors" />
        </button>

        <button
          onClick={() => startCamera(facingMode)}
          className="flex flex-col items-center text-slate-300 active:scale-90 transition-transform"
          aria-label="Ulang Kamera"
        >
          <div className="p-3 bg-slate-800/80 rounded-full mb-1 border border-slate-700">
            <RefreshCw className="w-5 h-5 text-slate-300" />
          </div>
          <span className="text-[11px]">Ulang</span>
        </button>
      </div>
    </div>
  );
};
