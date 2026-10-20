import { FilterType } from '../types';

/**
 * Applies document enhancement filters, brightness/contrast adjustments,
 * and 90-degree step rotations to a canvas or image.
 */
export function applyDocumentFilters(
  inputSource: HTMLCanvasElement | HTMLImageElement,
  filter: FilterType,
  brightness: number = 0, // -50 to 50
  contrast: number = 0,   // -50 to 50
  rotationDegrees: number = 0
): HTMLCanvasElement {
  // 1. Handle rotation (0, 90, 180, 270)
  const normRot = ((rotationDegrees % 360) + 360) % 360;
  const isSideways = normRot === 90 || normRot === 270;

  const srcWidth = inputSource.width;
  const srcHeight = inputSource.height;

  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = isSideways ? srcHeight : srcWidth;
  rotCanvas.height = isSideways ? srcWidth : srcHeight;

  const rotCtx = rotCanvas.getContext('2d', { willReadFrequently: true });
  if (!rotCtx) throw new Error('Could not get 2D context for rotation');

  if (normRot === 0) {
    rotCtx.drawImage(inputSource, 0, 0);
  } else {
    rotCtx.save();
    rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
    rotCtx.rotate((normRot * Math.PI) / 180);
    rotCtx.drawImage(inputSource, -srcWidth / 2, -srcHeight / 2);
    rotCtx.restore();
  }

  // If original filter with 0 brightness/contrast, return directly
  if (filter === 'original' && brightness === 0 && contrast === 0) {
    return rotCanvas;
  }

  // 2. Pixel data processing for filters, brightness, and contrast
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = rotCanvas.width;
  finalCanvas.height = rotCanvas.height;
  const ctx = finalCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get 2D context for final canvas');

  ctx.drawImage(rotCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
  const data = imgData.data;
  const len = data.length;

  // Pre-calculate contrast factor: factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Apply brightness & contrast
    if (brightness !== 0 || contrast !== 0) {
      r = factor * (r + brightness - 128) + 128;
      g = factor * (g + brightness - 128) + 128;
      b = factor * (b + brightness - 128) + 128;
    }

    if (filter === 'grayscale') {
      // Standard Rec. 601 Luma
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = gray;
    } else if (filter === 'bw') {
      // Black & White (adaptive document threshold)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const val = lum > 132 ? 255 : 0;
      r = g = b = val;
    } else if (filter === 'magic') {
      // CamScanner Magic Color:
      // Bleaches paper background shadows to clean white
      // Boosts dark ink/text contrast while retaining color stamps/signatures
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > 135) {
        // High-midtones & highlights: push towards crisp white
        const boost = 1.0 + ((lum - 135) / 120) * 0.45;
        r = Math.min(255, r * boost);
        g = Math.min(255, g * boost);
        b = Math.min(255, b * boost);
      } else {
        // Shadows & text: deepen ink for readability
        const drop = 0.82;
        r = Math.max(0, r * drop);
        g = Math.max(0, g * drop);
        b = Math.max(0, b * drop);
      }

      // Extra saturation boost for stamps/charts
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const delta = maxC - minC;
      if (delta > 25 && lum > 40 && lum < 220) {
        // Boost color saturation
        r = Math.min(255, r + (r - lum) * 0.35);
        g = Math.min(255, g + (g - lum) * 0.35);
        b = Math.min(255, b + (b - lum) * 0.35);
      }
    }

    data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }

  ctx.putImageData(imgData, 0, 0);
  return finalCanvas;
}
