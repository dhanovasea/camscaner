import { PDFDocument } from 'pdf-lib';
import { PageItem } from '../types';

export interface PdfExportOptions {
  format: 'a4' | 'fit';
}

/**
 * Builds a multi-page PDF document client-side using pdf-lib
 */
export async function generatePdfBlob(
  pages: PageItem[],
  options: PdfExportOptions = { format: 'a4' }
): Promise<Blob> {
  if (pages.length === 0) {
    throw new Error('Tidak ada halaman untuk diekspor ke PDF.');
  }

  const pdfDoc = await PDFDocument.create();

  for (const page of pages) {
    const arrayBuffer = await page.processedBlob.arrayBuffer();
    const isPng = page.processedBlob.type === 'image/png';

    const embeddedImage = isPng
      ? await pdfDoc.embedPng(arrayBuffer)
      : await pdfDoc.embedJpg(arrayBuffer);

    const imgWidth = embeddedImage.width;
    const imgHeight = embeddedImage.height;

    if (options.format === 'a4') {
      // Standard ISO A4 @ 72 dpi: 595.28 x 841.89 pt
      // Auto-orient based on portrait vs landscape
      const isLandscape = imgWidth > imgHeight;
      const pageWidth = isLandscape ? 841.89 : 595.28;
      const pageHeight = isLandscape ? 595.28 : 841.89;

      const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);

      // Calculate uniform scale fitting inside page margins (margin = 20pt)
      const margin = 20;
      const usableW = pageWidth - margin * 2;
      const usableH = pageHeight - margin * 2;

      const scale = Math.min(usableW / imgWidth, usableH / imgHeight);
      const drawW = imgWidth * scale;
      const drawH = imgHeight * scale;

      // Center on page
      const posX = (pageWidth - drawW) / 2;
      const posY = (pageHeight - drawH) / 2;

      pdfPage.drawImage(embeddedImage, {
        x: posX,
        y: posY,
        width: drawW,
        height: drawH,
      });
    } else {
      // Exact image dimensions (fit)
      const pdfPage = pdfDoc.addPage([imgWidth, imgHeight]);
      pdfPage.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: imgWidth,
        height: imgHeight,
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  // Cast Uint8Array buffer or slice to ArrayBuffer for standard Blob compatibility
  return new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
}

/**
 * Native share or file download with safe revocation
 */
export async function shareOrDownloadFile(
  blob: Blob,
  filename: string,
  title: string = 'DokuScan Dokumen'
): Promise<{ shared: boolean }> {
  const file = new File([blob], filename, { type: blob.type });

  // 1. Try Web Share API (native Android share sheet)
  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title,
        text: `${title} dipindai dengan DokuScan PWA`,
      });
      return { shared: true };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled share dialog
        return { shared: false };
      }
      // If Web Share failed for another reason, proceed to fallback download
    }
  }

  // 2. Fallback: Browser download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 2500);

  return { shared: false };
}
