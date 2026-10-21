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

// Helper: Calculate median of numbers
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Helper: Linear slope dy/dx
function linearSlope(pts: Point[]): number {
  if (pts.length < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  const n = pts.length;
  for (const p of pts) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-5) return 0;
  const slope = (n * sumXY - sumX * sumY) / denom;
  return Math.max(-0.35, Math.min(0.35, slope));
}

// Helper: Linear slope dx/dy
function linearSlopeYX(pts: Point[]): number {
  if (pts.length < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumYY = 0;
  const n = pts.length;
  for (const p of pts) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumYY += p.y * p.y;
  }
  const denom = n * sumYY - sumY * sumY;
  if (Math.abs(denom) < 1e-5) return 0;
  const slope = (n * sumXY - sumY * sumX) / denom;
  return Math.max(-0.35, Math.min(0.35, slope));
}

/**
 * Detects initial 4 document corners with real edge and gradient analysis.
 * Finds the actual paper boundary against the desk/background.
 * If contrast is too weak, falls back to a tight 14% x / 12% y document frame (matching camera viewfinder).
 */
export function detectDocumentCorners(
  source: HTMLImageElement | HTMLCanvasElement | { width: number; height: number },
  customWidth?: number,
  customHeight?: number
): DocumentCorners {
  const origW = customWidth || source.width;
  const origH = customHeight || source.height;

  // Safe default: tight document frame matching camera guides (14% x, 12% y)
  const fallbackCorners: DocumentCorners = {
    tl: { x: Math.round(origW * 0.14), y: Math.round(origH * 0.12) },
    tr: { x: Math.round(origW * 0.86), y: Math.round(origH * 0.12) },
    br: { x: Math.round(origW * 0.86), y: Math.round(origH * 0.88) },
    bl: { x: Math.round(origW * 0.14), y: Math.round(origH * 0.88) },
  };

  if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) {
    return fallbackCorners;
  }

  try {
    // 1. Fast downsampled canvas (max 280px)
    const maxDim = 280;
    const scale = Math.min(maxDim / origW, maxDim / origH, 1);
    const sw = Math.round(origW * scale);
    const sh = Math.round(origH * scale);

    if (sw < 40 || sh < 40) return fallbackCorners;

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallbackCorners;

    ctx.drawImage(source, 0, 0, sw, sh);
    const imgData = ctx.getImageData(0, 0, sw, sh);
    const data = imgData.data;

    // 2. Grayscale & Luminance
    const lum = new Float32Array(sw * sh);
    const hist = new Int32Array(256);

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const yVal = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      lum[p] = yVal;
      hist[Math.min(255, Math.max(0, Math.round(yVal)))]++;
    }

    // 3. Otsu Thresholding
    const totalPixels = sw * sh;
    let sumB = 0;
    let wB = 0;
    let maximum = 0;
    let threshold = 128;
    let sum1 = 0;
    for (let i = 0; i < 256; i++) sum1 += i * hist[i];

    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      if (wB === 0) continue;
      const wF = totalPixels - wB;
      if (wF === 0) break;
      sumB += i * hist[i];
      const mB = sumB / wB;
      const mF = (sum1 - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maximum) {
        maximum = between;
        threshold = i;
      }
    }

    // Determine if document paper is brighter or darker than the background surface
    let centerLum = 0;
    let centerCount = 0;
    let borderLum = 0;
    let borderCount = 0;

    const minX = Math.floor(sw * 0.25);
    const maxX = Math.floor(sw * 0.75);
    const minY = Math.floor(sh * 0.25);
    const maxY = Math.floor(sh * 0.75);

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const val = lum[y * sw + x];
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
          centerLum += val;
          centerCount++;
        } else if (x < sw * 0.12 || x > sw * 0.88 || y < sh * 0.12 || y > sh * 0.88) {
          borderLum += val;
          borderCount++;
        }
      }
    }

    centerLum /= Math.max(1, centerCount);
    borderLum /= Math.max(1, borderCount);
    const isDocBrighter = centerLum >= borderLum;

    // 4. Sobel Gradient Magnitude
    const grad = new Float32Array(sw * sh);
    for (let y = 1; y < sh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        const gx =
          lum[(y - 1) * sw + (x + 1)] +
          2 * lum[y * sw + (x + 1)] +
          lum[(y + 1) * sw + (x + 1)] -
          (lum[(y - 1) * sw + (x - 1)] +
            2 * lum[y * sw + (x - 1)] +
            lum[(y + 1) * sw + (x - 1)]);

        const gy =
          lum[(y + 1) * sw + (x - 1)] +
          2 * lum[(y + 1) * sw + x] +
          lum[(y + 1) * sw + (x + 1)] -
          (lum[(y - 1) * sw + (x - 1)] +
            2 * lum[(y - 1) * sw + x] +
            lum[(y - 1) * sw + (x + 1)]);

        grad[y * sw + x] = Math.abs(gx) + Math.abs(gy);
      }
    }

    // 5. Detect Paper Boundaries by Inward Scans
    const topPoints: Point[] = [];
    const botPoints: Point[] = [];
    const leftPoints: Point[] = [];
    const rightPoints: Point[] = [];

    // Horizontal scan for top and bottom paper edges
    const xStep = Math.max(2, Math.floor(sw / 45));
    for (let x = Math.floor(sw * 0.15); x < Math.floor(sw * 0.85); x += xStep) {
      // Top edge inward
      let bestTopY = -1;
      let maxGradTop = 24;
      for (let y = 4; y < Math.floor(sh * 0.55); y++) {
        const g = grad[y * sw + x];
        const isDoc = isDocBrighter ? lum[y * sw + x] >= threshold : lum[y * sw + x] <= threshold;
        if (g > maxGradTop && isDoc) {
          maxGradTop = g;
          bestTopY = y;
        }
      }
      if (bestTopY > 0) topPoints.push({ x, y: bestTopY });

      // Bottom edge inward
      let bestBotY = -1;
      let maxGradBot = 24;
      for (let y = sh - 5; y > Math.floor(sh * 0.45); y--) {
        const g = grad[y * sw + x];
        const isDoc = isDocBrighter ? lum[y * sw + x] >= threshold : lum[y * sw + x] <= threshold;
        if (g > maxGradBot && isDoc) {
          maxGradBot = g;
          bestBotY = y;
        }
      }
      if (bestBotY > 0) botPoints.push({ x, y: bestBotY });
    }

    // Vertical scan for left and right paper edges
    const yStep = Math.max(2, Math.floor(sh / 45));
    for (let y = Math.floor(sh * 0.15); y < Math.floor(sh * 0.85); y += yStep) {
      // Left edge inward
      let bestLeftX = -1;
      let maxGradLeft = 24;
      for (let x = 4; x < Math.floor(sw * 0.55); x++) {
        const g = grad[y * sw + x];
        const isDoc = isDocBrighter ? lum[y * sw + x] >= threshold : lum[y * sw + x] <= threshold;
        if (g > maxGradLeft && isDoc) {
          maxGradLeft = g;
          bestLeftX = x;
        }
      }
      if (bestLeftX > 0) leftPoints.push({ x: bestLeftX, y });

      // Right edge inward
      let bestRightX = -1;
      let maxGradRight = 24;
      for (let x = sw - 5; x > Math.floor(sw * 0.45); x--) {
        const g = grad[y * sw + x];
        const isDoc = isDocBrighter ? lum[y * sw + x] >= threshold : lum[y * sw + x] <= threshold;
        if (g > maxGradRight && isDoc) {
          maxGradRight = g;
          bestRightX = x;
        }
      }
      if (bestRightX > 0) rightPoints.push({ x: bestRightX, y });
    }

    // Need sufficient candidate points
    if (
      topPoints.length >= 4 &&
      botPoints.length >= 4 &&
      leftPoints.length >= 4 &&
      rightPoints.length >= 4
    ) {
      const avgTopY = median(topPoints.map((p) => p.y));
      const avgBotY = median(botPoints.map((p) => p.y));
      const avgLeftX = median(leftPoints.map((p) => p.x));
      const avgRightX = median(rightPoints.map((p) => p.x));

      const topSlope = linearSlope(topPoints);
      const botSlope = linearSlope(botPoints);
      const leftSlope = linearSlopeYX(leftPoints);
      const rightSlope = linearSlopeYX(rightPoints);

      const cX = sw / 2;
      const cY = sh / 2;

      const tlX = avgLeftX + leftSlope * (avgTopY - cY);
      const tlY = avgTopY + topSlope * (avgLeftX - cX);

      const trX = avgRightX + rightSlope * (avgTopY - cY);
      const trY = avgTopY + topSlope * (avgRightX - cX);

      const brX = avgRightX + rightSlope * (avgBotY - cY);
      const brY = avgBotY + botSlope * (avgRightX - cX);

      const blX = avgLeftX + leftSlope * (avgBotY - cY);
      const blY = avgBotY + botSlope * (avgLeftX - cX);

      const detectedW = Math.max(trX - tlX, brX - blX);
      const detectedH = Math.max(blY - tlY, brY - trY);

      // Check if detected shape forms a plausible document quadrilateral
      if (
        detectedW >= sw * 0.35 &&
        detectedW <= sw * 0.95 &&
        detectedH >= sh * 0.35 &&
        detectedH <= sh * 0.95 &&
        tlX < trX &&
        blX < brX &&
        tlY < blY &&
        trY < brY
      ) {
        const invScale = 1 / scale;
        return {
          tl: {
            x: Math.max(0, Math.min(origW, Math.round(tlX * invScale))),
            y: Math.max(0, Math.min(origH, Math.round(tlY * invScale))),
          },
          tr: {
            x: Math.max(0, Math.min(origW, Math.round(trX * invScale))),
            y: Math.max(0, Math.min(origH, Math.round(trY * invScale))),
          },
          br: {
            x: Math.max(0, Math.min(origW, Math.round(brX * invScale))),
            y: Math.max(0, Math.min(origH, Math.round(brY * invScale))),
          },
          bl: {
            x: Math.max(0, Math.min(origW, Math.round(blX * invScale))),
            y: Math.max(0, Math.min(origH, Math.round(blY * invScale))),
          },
        };
      }
    }
  } catch (err) {
    console.warn('Corner detection error, using standard document inset:', err);
  }

  return fallbackCorners;
}
