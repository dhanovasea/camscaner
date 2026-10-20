import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DocumentCorners, Point } from '../types';
import { warpPerspective, detectDocumentCorners } from '../services/perspective';
import { Check, X, RotateCcw, Maximize2, Wand2, RotateCw } from 'lucide-react';

interface Props {
  imageBlob: Blob;
  initialCorners?: DocumentCorners;
  onDone: (warpedBlob: Blob, corners: DocumentCorners) => void;
  onCancel: () => void;
}

export const CropModal: React.FC<Props> = ({
  imageBlob,
  initialCorners,
  onDone,
  onCancel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [rotation, setRotation] = useState(0);
  const [corners, setCorners] = useState<DocumentCorners>({
    tl: { x: 0, y: 0 },
    tr: { x: 0, y: 0 },
    br: { x: 0, y: 0 },
    bl: { x: 0, y: 0 },
  });
  const [activeCorner, setActiveCorner] = useState<keyof DocumentCorners | null>(null);
  const [touchPos, setTouchPos] = useState<Point | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load image
  useEffect(() => {
    const url = URL.createObjectURL(imageBlob);
    const img = new Image();
    img.src = url;
    img.onload = () => {
      setImgElement(img);

      if (initialCorners) {
        setCorners(initialCorners);
      } else {
        // Automatic initial detection
        const detected = detectDocumentCorners(img.width, img.height);
        setCorners(detected);
      }
    };
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [imageBlob, initialCorners]);

  // Redraw canvas with quadrilateral and handles
  const renderCanvas = useCallback(() => {
    if (!canvasRef.current || !imgElement) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgElement, 0, 0);

    const cornerKeys: (keyof DocumentCorners)[] = ['tl', 'tr', 'br', 'bl'];

    // 1. Shaded polygon overlay
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(corners.tl.x, corners.tl.y);
    ctx.lineTo(corners.tr.x, corners.tr.y);
    ctx.lineTo(corners.br.x, corners.br.y);
    ctx.lineTo(corners.bl.x, corners.bl.y);
    ctx.closePath();

    ctx.fillStyle = 'rgba(0, 141, 218, 0.22)';
    ctx.fill();

    // Border lines
    ctx.lineWidth = Math.max(3, Math.round(imgElement.width / 240));
    ctx.strokeStyle = '#008DDA';
    ctx.stroke();
    ctx.restore();

    // 2. Corner handles
    const handleRadius = Math.max(12, Math.round(imgElement.width / 45));

    cornerKeys.forEach((key) => {
      const pt = corners[key];
      const isActive = activeCorner === key;

      ctx.save();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, handleRadius * (isActive ? 1.25 : 1), 0, Math.PI * 2);
      ctx.fillStyle = isActive ? '#38BDF8' : '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = Math.max(3, Math.round(imgElement.width / 260));
      ctx.strokeStyle = '#008DDA';
      ctx.stroke();

      // Inner dot
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, handleRadius * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = '#0B192C';
      ctx.fill();
      ctx.restore();
    });
  }, [imgElement, corners, activeCorner]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Unified pointer / touch coordinates mapping
  const getCanvasCoords = (clientX: number, clientY: number): Point | null => {
    if (!canvasRef.current || !imgElement) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * imgElement.width;
    const y = ((clientY - rect.top) / rect.height) * imgElement.height;
    return {
      x: Math.max(0, Math.min(imgElement.width, x)),
      y: Math.max(0, Math.min(imgElement.height, y)),
    };
  };

  const handlePointerDown = (clientX: number, clientY: number) => {
    const pt = getCanvasCoords(clientX, clientY);
    if (!pt || !imgElement) return;

    const cornerKeys: (keyof DocumentCorners)[] = ['tl', 'tr', 'br', 'bl'];
    // Hit radius
    const hitRadius = Math.max(50, imgElement.width / 12);
    let closestKey: keyof DocumentCorners | null = null;
    let minDistance = Infinity;

    cornerKeys.forEach((key) => {
      const dist = Math.hypot(corners[key].x - pt.x, corners[key].y - pt.y);
      if (dist < hitRadius && dist < minDistance) {
        minDistance = dist;
        closestKey = key;
      }
    });

    if (closestKey) {
      setActiveCorner(closestKey);
      setTouchPos({ x: clientX, y: clientY });
    }
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!activeCorner || !imgElement) return;
    const pt = getCanvasCoords(clientX, clientY);
    if (!pt) return;

    setTouchPos({ x: clientX, y: clientY });
    setCorners((prev) => ({
      ...prev,
      [activeCorner]: {
        x: Math.round(pt.x),
        y: Math.round(pt.y),
      },
    }));
  };

  const handlePointerUp = () => {
    setActiveCorner(null);
    setTouchPos(null);
  };

  // Quick Action: Reset to Full Canvas
  const handleFullImage = () => {
    if (!imgElement) return;
    setCorners({
      tl: { x: 0, y: 0 },
      tr: { x: imgElement.width, y: 0 },
      br: { x: imgElement.width, y: imgElement.height },
      bl: { x: 0, y: imgElement.height },
    });
  };

  // Quick Action: Auto-Detect
  const handleAutoDetect = () => {
    if (!imgElement) return;
    const detected = detectDocumentCorners(imgElement.width, imgElement.height);
    setCorners(detected);
  };

  // Quick Action: Rotate Image
  const handleRotateImage = () => {
    if (!imgElement) return;
    const canvas = document.createElement('canvas');
    canvas.width = imgElement.height;
    canvas.height = imgElement.width;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(imgElement, -imgElement.width / 2, -imgElement.height / 2);

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const newImg = new Image();
        newImg.src = url;
        newImg.onload = () => {
          setImgElement(newImg);
          // Rotate corner coordinates as well
          setCorners({
            tl: { x: newImg.width - corners.bl.y, y: corners.bl.x },
            tr: { x: newImg.width - corners.tl.y, y: corners.tl.x },
            br: { x: newImg.width - corners.tr.y, y: corners.tr.x },
            bl: { x: newImg.width - corners.br.y, y: corners.br.x },
          });
        };
      }
    }, 'image/jpeg', 0.95);
  };

  const handleApply = async () => {
    if (!imgElement || isProcessing) return;
    setIsProcessing(true);
    try {
      const warpedCanvas = await warpPerspective(imgElement, corners);
      warpedCanvas.toBlob(
        (blob) => {
          if (blob) {
            onDone(blob, corners);
          }
          setIsProcessing(false);
        },
        'image/jpeg',
        0.95
      );
    } catch (e) {
      console.error(e);
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B192C] flex flex-col justify-between select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between p-4 bg-[#1E3E62] border-b border-slate-700/80 safe-area-top text-white">
        <button
          onClick={onCancel}
          className="p-2 rounded-lg hover:bg-slate-700/60 active:scale-95 text-slate-300"
          aria-label="Batal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center">
          <h3 className="font-semibold text-sm">Sesuaikan Sudut Dokumen</h3>
          <p className="text-[11px] text-slate-300">Geser 4 titik ke sudut dokumen</p>
        </div>

        <button
          onClick={handleRotateImage}
          className="p-2 rounded-lg hover:bg-slate-700/60 active:scale-95 text-blue-300"
          title="Putar 90°"
        >
          <RotateCw className="w-5 h-5" />
        </button>
      </div>

      {/* Main Interactive Canvas Area */}
      <div
        ref={containerRef}
        className="relative flex-1 flex items-center justify-center p-3 bg-black/60 overflow-hidden touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          handlePointerDown(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          handlePointerMove(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {}
          handlePointerUp();
        }}
        onPointerCancel={() => handlePointerUp()}
      >
        {imgElement && (
          <canvas
            ref={canvasRef}
            width={imgElement.width}
            height={imgElement.height}
            className="max-w-full max-h-[68vh] object-contain shadow-2xl rounded-sm border border-slate-700"
          />
        )}

        {/* Floating Magnifying Loupe on Touch */}
        {activeCorner && touchPos && imgElement && (
          <div
            className="pointer-events-none fixed z-50 w-28 h-28 rounded-full border-3 border-blue-400 bg-slate-900 shadow-2xl overflow-hidden -translate-x-1/2 -translate-y-full"
            style={{
              left: `${touchPos.x}px`,
              top: `${Math.max(80, touchPos.y - 40)}px`,
            }}
          >
            {/* Magnifier Canvas Preview */}
            <div
              className="w-full h-full"
              style={{
                backgroundImage: `url(${imgElement.src})`,
                backgroundSize: `${(imgElement.width / (imgElement.width / 3)) * 100}%`,
                backgroundPosition: `${(corners[activeCorner].x / imgElement.width) * 100}% ${(corners[activeCorner].y / imgElement.height) * 100}%`,
              }}
            />
            {/* Crosshair */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-full h-0.5 bg-cyan-400/70" />
              <div className="absolute h-full w-0.5 bg-cyan-400/70" />
              <div className="w-3 h-3 rounded-full border-2 border-white" />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Tool Bar & Actions */}
      <div className="bg-[#1E3E62] border-t border-slate-700 p-4 safe-area-bottom flex flex-col gap-3">
        {/* Quick presets */}
        <div className="flex items-center justify-center gap-4 text-xs">
          <button
            onClick={handleAutoDetect}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-blue-300 border border-blue-500/30 active:scale-95 transition-transform"
          >
            <Wand2 className="w-4 h-4" />
            <span>Otomatis</span>
          </button>

          <button
            onClick={handleFullImage}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 active:scale-95 transition-transform"
          >
            <Maximize2 className="w-4 h-4" />
            <span>Penuh</span>
          </button>

          <button
            onClick={handleAutoDetect}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 active:scale-95 transition-transform"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset</span>
          </button>
        </div>

        {/* Apply Button */}
        <button
          onClick={handleApply}
          disabled={isProcessing}
          className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 active:scale-98 transition-all disabled:opacity-50"
        >
          {isProcessing ? (
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
          ) : (
            <>
              <Check className="w-5 h-5" />
              <span>Terapkan Koreksi & Lanjutkan</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
