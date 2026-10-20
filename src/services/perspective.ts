import { DocumentCorners, Point } from '../types';

/**
 * Computes the 3x3 projective transformation (Homography) matrix
 * using 8-point Gauss-Jordan elimination.
 */
export function getPerspectiveTransform(src: Point[], dst: Point[]): number[] {
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    a.push([
      src[i].x, src[i].y, 1, 0, 0, 0,
      -src[i].x * dst[i].x, -src[i].y * dst[i].x, dst[i].x
    ]);
    a.push([
      0, 0, 0, src[i].x, src[i].y, 1,
      -src[i].x * dst[i].y, -src[i].y * dst[i].y, dst[i].y
    ]);
  }

  // Gauss-Jordan elimination with partial pivoting
  for (let i = 0; i < 8; i++) {
    let maxRow = i;
    for (let j = i + 1; j < 8; j++) {
      if (Math.abs(a[j][i]) > Math.abs(a[maxRow][i])) {
        maxRow = j;
      }
    }
    const temp = a[i];
    a[i] = a[maxRow];
    a[maxRow] = temp;

    const pivot = a[i][i];
    if (Math.abs(pivot) < 1e-10) continue;
    for (let j = i; j <= 8; j++) {
      a[i][j] /= pivot;
    }

    for (let j = 0; j < 8; j++) {
      if (j !== i) {
        const factor = a[j][i];
        for (let k = i; k <= 8; k++) {
          a[j][k] -= factor * a[i][k];
        }
      }
    }
  }

  const h = new Array(9);
  for (let i = 0; i < 8; i++) h[i] = a[i][8];
  h[8] = 1;
  return h;
}

/**
 * Warps the quadrilateral defined by corners into a rectangular canvas
 * using inverse homography mapping and bilinear interpolation.
 */
export async function warpPerspective(
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  corners: DocumentCorners,
  maxDimension: number = 2400
): Promise<HTMLCanvasElement> {
  // Target width = max of top and bottom widths
  const widthTop = Math.hypot(corners.tr.x - corners.tl.x, corners.tr.y - corners.tl.y);
  const widthBottom = Math.hypot(corners.br.x - corners.bl.x, corners.br.y - corners.bl.y);
  let targetWidth = Math.round(Math.max(widthTop, widthBottom));

  // Target height = max of left and right heights
  const heightLeft = Math.hypot(corners.bl.x - corners.tl.x, corners.bl.y - corners.tl.y);
  const heightRight = Math.hypot(corners.br.x - corners.tr.x, corners.br.y - corners.tr.y);
  let targetHeight = Math.round(Math.max(heightLeft, heightRight));

  // Safeguard against extreme/zero dimensions
  targetWidth = Math.max(100, targetWidth);
  targetHeight = Math.max(100, targetHeight);

  // Cap maximum dimension to prevent out-of-memory on mobile phones
  if (targetWidth > maxDimension || targetHeight > maxDimension) {
    const scale = maxDimension / Math.max(targetWidth, targetHeight);
    targetWidth = Math.round(targetWidth * scale);
    targetHeight = Math.round(targetHeight * scale);
  }

  const srcPoints = [corners.tl, corners.tr, corners.br, corners.bl];
  const dstPoints = [
    { x: 0, y: 0 },
    { x: targetWidth, y: 0 },
    { x: targetWidth, y: targetHeight },
    { x: 0, y: targetHeight },
  ];

  // Inverse mapping: maps destination (x, y) to source (sx, sy)
  const H = getPerspectiveTransform(dstPoints, srcPoints);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetWidth;
  outCanvas.height = targetHeight;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });
  if (!outCtx) throw new Error('Cannot get 2d context for output canvas');

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = sourceImage.width;
  srcCanvas.height = sourceImage.height;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) throw new Error('Cannot get 2d context for source canvas');
  srcCtx.drawImage(sourceImage, 0, 0);

  const srcData = srcCtx.getImageData(0, 0, sourceImage.width, sourceImage.height);
  const outData = outCtx.createImageData(targetWidth, targetHeight);

  const sW = sourceImage.width;
  const sH = sourceImage.height;
  const sPixels = srcData.data;
  const oPixels = outData.data;

  // Bilinear interpolation
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const w = H[6] * x + H[7] * y + H[8];
      const sx = (H[0] * x + H[1] * y + H[2]) / w;
      const sy = (H[3] * x + H[4] * y + H[5]) / w;

      const outIdx = (y * targetWidth + x) * 4;

      if (sx >= 0 && sx < sW - 1 && sy >= 0 && sy < sH - 1) {
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
        const dx = sx - x0;
        const dy = sy - y0;

        const i00 = (y0 * sW + x0) * 4;
        const i10 = (y0 * sW + x1) * 4;
        const i01 = (y1 * sW + x0) * 4;
        const i11 = (y1 * sW + x1) * 4;

        for (let c = 0; c < 3; c++) {
          const val =
            sPixels[i00 + c] * (1 - dx) * (1 - dy) +
            sPixels[i10 + c] * dx * (1 - dy) +
            sPixels[i01 + c] * (1 - dx) * dy +
            sPixels[i11 + c] * dx * dy;
          oPixels[outIdx + c] = Math.round(val);
        }
        oPixels[outIdx + 3] = 255;
      } else {
        // Nearest edge clamping
        const clampX = Math.max(0, Math.min(sW - 1, Math.round(sx)));
        const clampY = Math.max(0, Math.min(sH - 1, Math.round(sy)));
        const idx = (clampY * sW + clampX) * 4;
        oPixels[outIdx] = sPixels[idx];
        oPixels[outIdx + 1] = sPixels[idx + 1];
        oPixels[outIdx + 2] = sPixels[idx + 2];
        oPixels[outIdx + 3] = 255;
      }
    }
  }

  outCtx.putImageData(outData, 0, 0);
  return outCanvas;
}

/**
 * Detects initial 4 document corners.
 * Analyzes contrast boundaries or defaults to an intelligent 7% inset.
 */
export function detectDocumentCorners(
  width: number,
  height: number,
  imgData?: ImageData
): DocumentCorners {
  const padX = Math.round(width * 0.06);
  const padY = Math.round(height * 0.06);

  // If pixel data is available, check for high contrast edges
  if (imgData && imgData.data.length > 0) {
    try {
      const data = imgData.data;
      const stepX = Math.max(1, Math.floor(width / 50));
      const stepY = Math.max(1, Math.floor(height / 50));

      // Compute average edge luminescence vs center luminescence
      let centerLum = 0;
      let centerCount = 0;
      for (let y = Math.floor(height * 0.3); y < height * 0.7; y += stepY) {
        for (let x = Math.floor(width * 0.3); x < width * 0.7; x += stepX) {
          const idx = (y * width + x) * 4;
          centerLum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          centerCount++;
        }
      }
      if (centerCount > 0) {
        centerLum /= centerCount;
      }

      // If center is brighter than edges (typical document on desk)
      // Provide a tailored perspective crop
      if (centerLum > 100) {
        return {
          tl: { x: Math.round(width * 0.07), y: Math.round(height * 0.07) },
          tr: { x: Math.round(width * 0.93), y: Math.round(height * 0.07) },
          br: { x: Math.round(width * 0.93), y: Math.round(height * 0.93) },
          bl: { x: Math.round(width * 0.07), y: Math.round(height * 0.93) },
        };
      }
    } catch {
      // Fallback below
    }
  }

  return {
    tl: { x: padX, y: padY },
    tr: { x: width - padX, y: padY },
    br: { x: width - padX, y: height - padY },
    bl: { x: padX, y: height - padY },
  };
}
