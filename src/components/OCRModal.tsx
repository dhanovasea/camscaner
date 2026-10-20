import React, { useState, useEffect } from 'react';
import { runOcrOnBlob, OcrProgress } from '../services/ocrService';
import { shareOrDownloadFile } from '../services/pdfService';
import { X, Copy, Check, Loader2, Download, AlertTriangle, Languages, RefreshCw } from 'lucide-react';

interface Props {
  imageBlob: Blob;
  onClose: () => void;
  documentTitle?: string;
  pageNumber?: number;
}

export const OCRModal: React.FC<Props> = ({
  imageBlob,
  onClose,
  documentTitle = 'Dokumen',
  pageNumber = 1,
}) => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<OcrProgress>({
    progress: 0,
    status: 'Menyiapkan modul OCR...',
  });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [languageMode, setLanguageMode] = useState<'ind+eng' | 'ind' | 'eng'>('ind+eng');

  const startOcr = (langs: string[]) => {
    setLoading(true);
    setError(null);
    setProgress({ progress: 5, status: 'Memulai mesin OCR Tesseract...' });

    runOcrOnBlob(
      imageBlob,
      (p) => {
        setProgress(p);
      },
      langs
    )
      .then((extractedText) => {
        if (!extractedText || extractedText.trim().length === 0) {
          setText('');
          setError('Tidak ada karakter atau teks yang dapat dikenali secara jelas pada halaman ini.');
        } else {
          setText(extractedText);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError('Proses OCR gagal membaca gambar. Pastikan dokumen cukup terang dan teks terbaca jelas.');
        setLoading(false);
      });
  };

  useEffect(() => {
    const langs = languageMode === 'ind+eng' ? ['ind', 'eng'] : [languageMode];
    startOcr(langs);
  }, [imageBlob, languageMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadTxt = async () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const filename = `${documentTitle}_Hal_${pageNumber}_OCR.txt`;
    await shareOrDownloadFile(blob, filename, `Hasil OCR: ${documentTitle}`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col justify-end backdrop-blur-xs select-none">
      <div className="bg-[#1E3E62] border-t border-slate-700 rounded-t-3xl max-h-[90vh] flex flex-col text-slate-100 safe-area-bottom shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600/30 text-blue-300 rounded-xl">
              <Languages className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Ekstraksi Teks (OCR)</h3>
              <p className="text-[11px] text-slate-300">
                Halaman {pageNumber} &bull; Tesseract 100% On-Device
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/50"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Language selector chip bar */}
        <div className="px-5 py-2.5 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400">Pilihan Bahasa:</span>
          <div className="flex items-center gap-1.5">
            {(
              [
                { id: 'ind+eng', label: 'ID + EN' },
                { id: 'ind', label: 'Indonesia' },
                { id: 'eng', label: 'English' },
              ] as const
            ).map((lang) => (
              <button
                key={lang.id}
                onClick={() => setLanguageMode(lang.id)}
                disabled={loading}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  languageMode === lang.id
                    ? 'bg-blue-600 text-white font-medium shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="p-5 flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-10 h-10 animate-spin text-blue-400 mb-4" />
              <p className="font-medium text-sm text-white mb-1.5">{progress.status}</p>
              <div className="w-48 bg-slate-800 rounded-full h-2 mb-2 overflow-hidden border border-slate-700">
                <div
                  className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(8, progress.progress)}%` }}
                />
              </div>
              <span className="text-xs text-slate-400">{progress.progress}%</span>
              <p className="text-[11px] text-slate-400 mt-4 max-w-xs">
                Pemrosesan berjalan 100% di browser HP tanpa mengirim dokumen ke internet.
              </p>
            </div>
          ) : error ? (
            <div className="py-8 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h4 className="font-semibold text-sm text-white mb-2">OCR Tidak Berhasil</h4>
              <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed mb-5">{error}</p>
              <button
                onClick={() => {
                  const langs = languageMode === 'ind+eng' ? ['ind', 'eng'] : [languageMode];
                  startOcr(langs);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-blue-300 rounded-xl text-xs font-medium border border-blue-500/30 inline-flex items-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Coba Pindai Ulang
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Hasil Ekstraksi (Dapat diedit):</span>
                <span>{text.length} karakter</span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Hasil teks akan tampil di sini..."
                className="w-full h-56 p-3.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 font-mono leading-relaxed focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!loading && !error && text.length > 0 && (
          <div className="p-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between gap-3">
            <button
              onClick={handleDownloadTxt}
              className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-medium text-slate-200 border border-slate-700 flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <Download className="w-4 h-4 text-blue-400" />
              <span>Unduh .TXT</span>
            </button>

            <button
              onClick={handleCopy}
              className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-500 active:scale-95 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Tersalin ke Clipboard</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Salin Teks</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
