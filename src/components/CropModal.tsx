import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DocumentCorners, Point } from '../types';
import { warpPerspective, detectDocumentCorners } from '../services/perspective';
import { Check, X, RotateCcw, Maximize2, Wand2, RotateCw, Move } from 'lucide-react';

interface Props {
  imageBlob: Blob;
  initialCorners?: DocumentCorners;
  onDone: (warpedBlob: Blob, corners: DocumentCorners, updatedOriginalBlob?: Blob) => void;
  onCancel: () => void;
}

type DragTarget =
  | { type: 'corner'; key: keyof DocumentCorners }
  | { type: 'edge'; key: 'top' | 'bottom' | 'left' | 'right' }
  | null;

export const CropModal: React.FC<Props> = ({
  imageBlob,
  initialCorners,
  onDone,
  onCancel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);

  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [currentOriginalBlob, setCurrentOriginalBlob] = useState<Blob>(imageBlob);
  const [corners, setCorners] = useState<DocumentCorners>({
    tl: { x: 0, y: 0 },
    tr: { x: 0, y: 0 },
    br: { x: 0, y: 0 },
    bl: { x: 0, y: 0 },
  });
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [dragStartPoint, setDragStartPoint] = useState<Point | null>(null);
  const [initialDragCorners, setInitialDragCorners] = useState<DocumentCorners | null>(null);
  const [touchScreenPos, setTouchScreenPos] = useState<Point | null>(null);
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
        // Run real computer vision document corner detection
        const detected = detectDocumentCorners(img);
        setCorners(detected);
      }
    };
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [imageBlob, initialCorners]);

  // Redraw main canvas with quadrilateral, edge pills, and corner handles
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

    ctx.fillStyle = 'rgba(0, 141, 218, 0.25)';
    ctx.fill();

    // High contrast dual-stroke border (dark shadow + bright cyan)
    ctx.lineWidth = Math.max(5, Math.round(imgElement.width / 180));
    ctx.strokeStyle = 'rgba(11, 25, 44, 0.6)';
    ctx.stroke();

    ctx.lineWidth = Math.max(3, Math.round(imgElement.width / 240));
    ctx.strokeStyle = '#38BDF8';
    ctx.stroke();
    ctx.restore();

    // 2. Mid-edge pill handles (allows moving entire edges)
    const midTop = { x: (corners.tl.x + corners.tr.x) / 2, y: (corners.tl.y + corners.tr.y) / 2 };
    const midBot = { x: (corners.bl.x + corners.br.x) / 2, y: (corners.bl.y + corners.br.y) / 2 };
    const midLeft = { x: (corners.tl.x + corners.bl.x) / 2, y: (corners.tl.y + corners.bl.y) / 2 };
    const midRight = { x: (corners.tr.x + corners.br.x) / 2, y: (corners.tr.y + corners.br.y) / 2 };

    const edgePillRadius = Math.max(6, Math.round(imgElement.width / 80));
    [midTop, midBot, midLeft, midRight].forEach((pt) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, edgePillRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#008DDA';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
      ctx.restore();
    });

    // 3. Corner handles
    const handleRadius = Math.max(14, Math.round(imgElement.width / 40));

    cornerKeys.forEach((key) => {
      const pt = corners[key];
      const isCornerActive = dragTarget?.type === 'corner' && dragTarget.key === key;

      ctx.save();
      // Outer glow/shadow
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, handleRadius * (isCornerActive ? 1.3 : 1.05), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(11, 25, 44, 0.5)';
      ctx.fill();

      // Main handle circle
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, handleRadius * (isCornerActive ? 1.2 : 0.95), 0, Math.PI * 2);
      ctx.fillStyle = isCornerActive ? '#38BDF8' : '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = Math.max(3, Math.round(imgElement.width / 220));
      ctx.strokeStyle = '#008DDA';
      ctx.stroke();

      // Center dot
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, handleRadius * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = '#0B192C';
      ctx.fill();
      ctx.restore();
    });
  }, [imgElement, corners, dragTarget]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Update floating canvas magnifying loupe
  useEffect(() => {
    if (!loupeCanvasRef.current || !imgElement || !dragTarget) return;

    let targetX = 0;
    let targetY = 0;

    if (dragTarget.type === 'corner') {
      targetX = corners[dragTarget.key].x;
      targetY = corners[dragTarget.key].y;
    } else if (dragTarget.type === 'edge') {
      if (dragTarget.key === 'top') {
        targetX = (corners.tl.x + corners.tr.x) / 2;
        targetY = (corners.tl.y + corners.tr.y) / 2;
      } else if (dragTarget.key === 'bottom') {
        targetX = (corners.bl.x + corners.br.x) / 2;
        targetY = (corners.bl.y + corners.br.y) / 2;
      } else if (dragTarget.key === 'left') {
        targetX = (corners.tl.x + corners.bl.x) / 2;
        targetY = (corners.tl.y + corners.bl.y) / 2;
      } else if (dragTarget.key === 'right') {
        targetX = (corners.tr.x + corners.br.x) / 2;
        targetY = (corners.tr.y + corners.br.y) / 2;
      }
    }

    const loupe = loupeCanvasRef.current;
    const lCtx = loupe.getContext('2d');
    if (!lCtx) return;

    const lw = loupe.width;
    const lh = loupe.height;
    lCtx.clearRect(0, 0, lw, lh);

    // Zoom factor 2.5x
    const zoom = 2.5;
    const srcBoxW = lw / zoom;
    const srcBoxH = lh / zoom;
    const sx = targetX - srcBoxW / 2;
    const sy = targetY - srcBoxH / 2;

    lCtx.save();
    // Clip to circle
    lCtx.beginPath();
    lCtx.arc(lw / 2, lh / 2, lw / 2 - 2, 0, Math.PI * 2);
    lCtx.clip();

    // Draw magnified image slice
    lCtx.drawImage(imgElement, sx, sy, srcBoxW, srcBoxH, 0, 0, lw, lh);

    // Crosshairs
    lCtx.lineWidth = 1.5;
    lCtx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
    lCtx.beginPath();
    lCtx.moveTo(0, lh / 2);
    lCtx.lineTo(lw, lh / 2);
    lCtx.moveTo(lw / 2, 0);
    lCtx.lineTo(lw / 2, lh);
    lCtx.stroke();

    // Center target ring
    lCtx.beginPath();
    lCtx.arc(lw / 2, lh / 2, 8, 0, Math.PI * 2);
    lCtx.lineWidth = 2;
    lCtx.strokeStyle = '#FFFFFF';
    lCtx.stroke();
    lCtx.restore();
  }, [imgElement, corners, dragTarget, touchScreenPos]);

  // Coordinate conversion from screen viewport to full image resolution
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

    setDragStartPoint(pt);
    setInitialDragCorners({ ...corners });

    // 1. Check corner hits first (highest priority)
    const cornerKeys: (keyof DocumentCorners)[] = ['tl', 'tr', 'br', 'bl'];
    const cornerHitRadius = Math.max(55, imgElement.width / 11);
    let closestCorner: keyof DocumentCorners | null = null;
    let minCornerDist = Infinity;

    cornerKeys.forEach((key) => {
      const dist = Math.hypot(corners[key].x - pt.x, corners[key].y - pt.y);
      if (dist < cornerHitRadius && dist < minCornerDist) {
        minCornerDist = dist;
        closestCorner = key;
      }
    });

    if (closestCorner) {
      setDragTarget({ type: 'corner', key: closestCorner });
      setTouchScreenPos({ x: clientX, y: clientY });
      return;
    }

    // 2. Check edge midpoint hits
    const edgeHitRadius = Math.max(50, imgElement.width / 14);
    const midTop = { x: (corners.tl.x + corners.tr.x) / 2, y: (corners.tl.y + corners.tr.y) / 2 };
    const midBot = { x: (corners.bl.x + corners.br.x) / 2, y: (corners.bl.y + corners.br.y) / 2 };
    const midLeft = { x: (corners.tl.x + corners.bl.x) / 2, y: (corners.tl.y + corners.bl.y) / 2 };
    const midRight = { x: (corners.tr.x + corners.br.x) / 2, y: (corners.tr.y + corners.br.y) / 2 };

    const distTop = Math.hypot(midTop.x - pt.x, midTop.y - pt.y);
    const distBot = Math.hypot(midBot.x - pt.x, midBot.y - pt.y);
    const distLeft = Math.hypot(midLeft.x - pt.x, midLeft.y - pt.y);
    const distRight = Math.hypot(midRight.x - pt.x, midRight.y - pt.y);

    const minDist = Math.min(distTop, distBot, distLeft, distRight);
    if (minDist < edgeHitRadius) {
      if (minDist === distTop) setDragTarget({ type: 'edge', key: 'top' });
      else if (minDist === distBot) setDragTarget({ type: 'edge', key: 'bottom' });
      else if (minDist === distLeft) setDragTarget({ type: 'edge', key: 'left' });
      else setDragTarget({ type: 'edge', key: 'right' });
      setTouchScreenPos({ x: clientX, y: clientY });
    }
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!dragTarget || !imgElement || !dragStartPoint || !initialDragCorners) return;
    const pt = getCanvasCoords(clientX, clientY);
    if (!pt) return;

    setTouchScreenPos({ x: clientX, y: clientY });
    const deltaX = pt.x - dragStartPoint.x;
    const deltaY = pt.y - dragStartPoint.y;

    if (dragTarget.type === 'corner') {
      setCorners((prev) => ({
        ...prev,
        [dragTarget.key]: {
          x: Math.round(pt.x),
          y: Math.round(pt.y),
        },
      }));
    } else if (dragTarget.type === 'edge') {
      const edge = dragTarget.key;
      if (edge === 'top') {
        const newY_tl = Math.max(0, Math.min(initialDragCorners.bl.y - 40, initialDragCorners.tl.y + deltaY));
        const newY_tr = Math.max(0, Math.min(initialDragCorners.br.y - 40, initialDragCorners.tr.y + deltaY));
        setCorners((prev) => ({
          ...prev,
          tl: { ...prev.tl, y: Math.round(newY_tl) },
          tr: { ...prev.tr, y: Math.round(newY_tr) },
        }));
      } else if (edge === 'bottom') {
        const newY_bl = Math.max(initialDragCorners.tl.y + 40, Math.min(imgElement.height, initialDragCorners.bl.y + deltaY));
        const newY_br = Math.max(initialDragCorners.tr.y + 40, Math.min(imgElement.height, initialDragCorners.br.y + deltaY));
        setCorners((prev) => ({
          ...prev,
          bl: { ...prev.bl, y: Math.round(newY_bl) },
          br: { ...prev.br, y: Math.round(newY_br) },
        }));
      } else if (edge === 'left') {
        const newX_tl = Math.max(0, Math.min(initialDragCorners.tr.x - 40, initialDragCorners.tl.x + deltaX));
        const newX_bl = Math.max(0, Math.min(initialDragCorners.br.x - 40, initialDragCorners.bl.x + deltaX));
        setCorners((prev) => ({
          ...prev,
          tl: { ...prev.tl, x: Math.round(newX_tl) },
          bl: { ...prev.bl, x: Math.round(newX_bl) },
        }));
      } else if (edge === 'right') {
        const newX_tr = Math.max(initialDragCorners.tl.x + 40, Math.min(imgElement.width, initialDragCorners.tr.x + deltaX));
        const newX_br = Math.max(initialDragCorners.bl.x + 40, Math.min(imgElement.width, initialDragCorners.br.x + deltaX));
        setCorners((prev) => ({
          ...prev,
          tr: { ...prev.tr, x: Math.round(newX_tr) },
          br: { ...prev.br, x: Math.round(newX_br) },
        }));
      }
    }
  };

  const handlePointerUp = () => {
    setDragTarget(null);
    setDragStartPoint(null);
    setInitialDragCorners(null);
    setTouchScreenPos(null);
  };

  // Quick Action 1: Auto-Detect with real Computer Vision
  const handleAutoDetect = () => {
    if (!imgElement) return;
    const detected = detectDocumentCorners(imgElement);
    setCorners(detected);
  };

  // Quick Action 2: Tight Frame (14% x, 12% y)
  const handleTightFit = () => {
    if (!imgElement) return;
    const w = imgElement.width;
    const h = imgElement.height;
    setCorners({
      tl: { x: Math.round(w * 0.14), y: Math.round(h * 0.12) },
      tr: { x: Math.round(w * 0.86), y: Math.round(h * 0.12) },
      br: { x: Math.round(w * 0.86), y: Math.round(h * 0.88) },
      bl: { x: Math.round(w * 0.14), y: Math.round(h * 0.88) },
    });
  };

  // Quick Action 3: Full Bounds
  const handleFullImage = () => {
    if (!imgElement) return;
    setCorners({
      tl: { x: 0, y: 0 },
      tr: { x: imgElement.width, y: 0 },
      br: { x: imgElement.width, y: imgElement.height },
      bl: { x: 0, y: imgElement.height },
    });
  };

  // Quick Action 4: Rotate Image 90°
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
        setCurrentOriginalBlob(blob);
        const url = URL.createObjectURL(blob);
        const newImg = new Image();
        newImg.src = url;
        newImg.onload = () => {
          setImgElement(newImg);
          // Rotate corner coordinates accurately
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
            onDone(blob, corners, currentOriginalBlob);
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
      <div className="flex items-center justify-between p-3.5 bg-[#1E3E62] border-b border-slate-700/80 safe-area-top text-white">
        <button
          onClick={onCancel}
          className="p-2 rounded-xl hover:bg-slate-700/60 active:scale-95 text-slate-300"
          aria-label="Batal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center">
          <h3 className="font-semibold text-sm">Sesuaikan Sudut Dokumen</h3>
          <p className="text-[11px] text-cyan-300">Geser 4 titik sudut atau tepi garis</p>
        </div>

        <button
          onClick={handleRotateImage}
          className="p-2 rounded-xl hover:bg-slate-700/60 active:scale-95 text-cyan-300"
          title="Putar 90°"
        >
          <RotateCw className="w-5 h-5" />
        </button>
      </div>

      {/* Main Interactive Canvas Viewport */}
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
            className="max-w-full max-h-[66vh] object-contain shadow-2xl rounded-sm border border-slate-700"
          />
        )}

        {/* Real Canvas Magnifying Loupe on Touch */}
        {dragTarget && touchScreenPos && (
          <div
            className="pointer-events-none fixed z-50 w-32 h-32 rounded-full border-3 border-cyan-400 bg-slate-950 shadow-2xl overflow-hidden -translate-x-1/2 -translate-y-full"
            style={{
              left: `${touchScreenPos.x}px`,
              top: `${Math.max(90, touchScreenPos.y - 35)}px`,
            }}
          >
            <canvas
              ref={loupeCanvasRef}
              width={128}
              height={128}
              className="w-full h-full block"
            />
          </div>
        )}
      </div>

      {/* Bottom Tool Bar & Actions */}
      <div className="bg-[#1E3E62] border-t border-slate-700 p-3.5 safe-area-bottom flex flex-col gap-3">
        {/* Quick presets row */}
        <div className="grid grid-cols-4 gap-2 text-xs">
          <button
            onClick={handleAutoDetect}
            className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 text-cyan-300 border border-cyan-400/30 active:scale-95 transition-transform"
            title="Deteksi tepi dokumen otomatis"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span className="font-semibold text-[11px]">Otomatis</span>
          </button>

          <button
            onClick={handleTightFit}
            className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 active:scale-95 transition-transform"
            title="Presisi bingkai dokumen standar"
          >
            <Move className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px]">Ketat</span>
          </button>

          <button
            onClick={handleFullImage}
            className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 active:scale-95 transition-transform"
            title="Pilih seluruh gambar"
          >
            <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px]">Penuh</span>
          </button>

          <button
            onClick={handleAutoDetect}
            className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 active:scale-95 transition-transform"
            title="Reset ke hasil deteksi"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px]">Reset</span>
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
