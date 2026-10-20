import { createWorker } from 'tesseract.js';

export interface OcrProgress {
  progress: number;
  status: string;
}

/**
 * Runs OCR on an image Blob using Tesseract.js (Indonesian + English)
 */
export async function runOcrOnBlob(
  blob: Blob,
  onProgress?: (progress: OcrProgress) => void,
  languages: string[] = ['ind', 'eng']
): Promise<string> {
  const worker = await createWorker(languages, 1, {
    logger: (m) => {
      if (onProgress && typeof m.progress === 'number') {
        const percent = Math.round(m.progress * 100);
        let statusText = 'Mempersiapkan OCR...';
        if (m.status === 'loading tesseract core') statusText = 'Memuat modul OCR...';
        else if (m.status === 'initializing tesseract') statusText = 'Menginisialisasi bahasa...';
        else if (m.status === 'loading language traineddata') statusText = 'Mengunduh model bahasa (ID/EN)...';
        else if (m.status === 'recognizing text') statusText = `Mengenali teks (${percent}%)...`;

        onProgress({
          progress: percent,
          status: statusText,
        });
      }
    },
  });

  const url = URL.createObjectURL(blob);
  try {
    const { data } = await worker.recognize(url);
    await worker.terminate();
    return data.text.trim();
  } finally {
    URL.revokeObjectURL(url);
  }
}
