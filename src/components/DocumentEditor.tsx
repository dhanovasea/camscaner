import React, { useState, useEffect, useRef } from 'react';
import { DocumentRecord, PageItem, FilterType } from '../types';
import { applyDocumentFilters } from '../services/imageFilters';
import { warpPerspective } from '../services/perspective';
import { generatePdfBlob, shareOrDownloadFile } from '../services/pdfService';
import { saveDocument } from '../services/db';
import { OCRModal } from './OCRModal';
import { CropModal } from './CropModal';
import {
  ArrowLeft,
  Share2,
  FileText,
  RotateCw,
  Crop,
  Trash2,
  Plus,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Download,
  Image as ImageIcon,
  Check,
  X,
  Camera,
  ArrowLeftRight,
} from 'lucide-react';

interface Props {
  initialDoc: DocumentRecord;
  onBack: () => void;
  onScanNewPage: () => void;
  onImportNewPage: (file: File) => void;
}

export const DocumentEditor: React.FC<Props> = ({
  initialDoc,
  onBack,
  onScanNewPage,
  onImportNewPage,
}) => {
  const [doc, setDoc] = useState<DocumentRecord>(initialDoc);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'filters' | 'adjust'>('filters');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isOcrOpen, setIsOcrOpen] = useState(false);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [exportFormat, setExportFormat] = useState<'a4' | 'fit'>('a4');
  const [exportFileName, setExportFileName] = useState(initialDoc.title);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentPage: PageItem | undefined = doc.pages[currentPageIndex];

  // Keep preview URL updated and clean up object URLs
  useEffect(() => {
    if (!currentPage) return;
    const url = URL.createObjectURL(currentPage.processedBlob);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [currentPage?.processedBlob]);

  // Apply filters / rotation / brightness / contrast to current page
  const updatePageTransformations = async (
    newFilter?: FilterType,
    rotDelta: number = 0,
    newBrightness?: number,
    newContrast?: number
  ) => {
    if (!currentPage) return;

    const filter = newFilter !== undefined ? newFilter : currentPage.filter;
    const rotation = ((currentPage.rotation + rotDelta) % 360 + 360) % 360;
    const brightness = newBrightness !== undefined ? newBrightness : currentPage.brightness;
    const contrast = newContrast !== undefined ? newContrast : currentPage.contrast;

    // Load original blob to re-warp and filter cleanly without generation loss
    const origUrl = URL.createObjectURL(currentPage.originalBlob);
    const origImg = new Image();
    origImg.src = origUrl;
    await new Promise((resolve) => {
      origImg.onload = resolve;
    });

    // 1. Warp perspective
    const warpedCanvas = await warpPerspective(origImg, currentPage.corners);
    URL.revokeObjectURL(origUrl);

    // 2. Apply filters + rotation + sliders
    const finalCanvas = applyDocumentFilters(warpedCanvas, filter, brightness, contrast, rotation);

    finalCanvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const updatedPages = [...doc.pages];
        updatedPages[currentPageIndex] = {
          ...currentPage,
          processedBlob: blob,
          filter,
          rotation,
          brightness,
          contrast,
          width: finalCanvas.width,
          height: finalCanvas.height,
        };

        const updatedDoc = {
          ...doc,
          pages: updatedPages,
          updatedAt: Date.now(),
        };

        setDoc(updatedDoc);
        await saveDocument(updatedDoc);
      },
      'image/jpeg',
      0.93
    );
  };

  const handleTitleChange = async (newTitle: string) => {
    const updated = { ...doc, title: newTitle, updatedAt: Date.now() };
    setDoc(updated);
    setExportFileName(newTitle);
    await saveDocument(updated);
  };

  const handleReorderPage = async (direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? currentPageIndex - 1 : currentPageIndex + 1;
    if (targetIndex < 0 || targetIndex >= doc.pages.length) return;

    const updatedPages = [...doc.pages];
    const [moved] = updatedPages.splice(currentPageIndex, 1);
    updatedPages.splice(targetIndex, 0, moved);

    const updatedDoc = { ...doc, pages: updatedPages, updatedAt: Date.now() };
    setDoc(updatedDoc);
    setCurrentPageIndex(targetIndex);
    await saveDocument(updatedDoc);
  };

  const handleDeletePage = async () => {
    if (doc.pages.length <= 1) {
      alert('Dokumen minimal harus memiliki 1 halaman.');
      return;
    }

    if (!confirm(`Hapus Halaman ${currentPageIndex + 1}?`)) return;

    const updatedPages = doc.pages.filter((_, idx) => idx !== currentPageIndex);
    const nextIndex = Math.min(currentPageIndex, updatedPages.length - 1);

    const updatedDoc = { ...doc, pages: updatedPages, updatedAt: Date.now() };
    setDoc(updatedDoc);
    setCurrentPageIndex(nextIndex);
    await saveDocument(updatedDoc);
  };

  // Export PDF multi-page
  const handleExportPDF = async () => {
    setIsSaving(true);
    setExportStatus('Membuat berkas PDF...');
    try {
      const pdfBlob = await generatePdfBlob(doc.pages, { format: exportFormat });
      const filename = `${(exportFileName || doc.title).trim()}.pdf`;
      const res = await shareOrDownloadFile(pdfBlob, filename, exportFileName || doc.title);
      setExportStatus(res.shared ? 'Berhasil dibagikan!' : 'PDF berhasil diunduh!');
      setTimeout(() => {
        setIsExportModalOpen(false);
        setExportStatus(null);
      }, 1500);
    } catch (err: unknown) {
      console.error(err);
      alert('Gagal mengekspor PDF. Pastikan memori perangkat mencukupi.');
      setExportStatus(null);
    } finally {
      setIsSaving(false);
    }
  };

  // Export current page as JPG image
  const handleExportSingleImage = async () => {
    if (!currentPage) return;
    setIsSaving(true);
    try {
      const filename = `${(exportFileName || doc.title).trim()}_Hal_${currentPageIndex + 1}.jpg`;
      await shareOrDownloadFile(currentPage.processedBlob, filename, filename);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRecropDone = async (warpedBlob: Blob, newCorners: any) => {
    if (!currentPage) return;
    setIsCropOpen(false);

    // Apply active filter and rotation to newly cropped result
    const imgUrl = URL.createObjectURL(warpedBlob);
    const img = new Image();
    img.src = imgUrl;
    await new Promise((res) => {
      img.onload = res;
    });

    const finalCanvas = applyDocumentFilters(
      img,
      currentPage.filter,
      currentPage.brightness,
      currentPage.contrast,
      currentPage.rotation
    );
    URL.revokeObjectURL(imgUrl);

    finalCanvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const updatedPages = [...doc.pages];
        updatedPages[currentPageIndex] = {
          ...currentPage,
          processedBlob: blob,
          corners: newCorners,
          width: finalCanvas.width,
          height: finalCanvas.height,
        };

        const updatedDoc = { ...doc, pages: updatedPages, updatedAt: Date.now() };
        setDoc(updatedDoc);
        await saveDocument(updatedDoc);
      },
      'image/jpeg',
      0.93
    );
  };

  return (
    <div className="fixed inset-0 z-40 bg-[#0B192C] flex flex-col text-slate-100 select-none overflow-hidden">
      {/* Top Header */}
      <div className="p-3.5 bg-[#1E3E62] border-b border-slate-700/80 flex items-center justify-between safe-area-top shadow-md z-10">
        <button
          onClick={onBack}
          className="p-2 rounded-xl hover:bg-slate-700/60 text-slate-200 active:scale-95 transition-transform"
          aria-label="Kembali ke Daftar Dokumen"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 mx-3 max-w-[200px] text-center">
          <input
            type="text"
            value={doc.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-full bg-slate-900/60 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs font-semibold text-white text-center focus:outline-none focus:border-blue-400 focus:bg-slate-900 truncate"
            title="Klik untuk mengubah nama dokumen"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* OCR Trigger */}
          <button
            onClick={() => setIsOcrOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/40 text-blue-300 border border-blue-400/30 text-xs font-medium active:scale-95 transition-transform"
            title="Ekstraksi teks dengan OCR"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">OCR</span>
          </button>

          {/* Export PDF Button */}
          <button
            onClick={() => {
              setExportFileName(doc.title);
              setIsExportModalOpen(true);
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md active:scale-95 transition-transform"
          >
            <Share2 className="w-4 h-4" />
            <span>Ekspor</span>
          </button>
        </div>
      </div>

      {/* Main Document Viewport */}
      <div className="relative flex-1 flex items-center justify-center p-3 bg-black/50 overflow-hidden">
        {previewUrl && (
          <img
            src={previewUrl}
            alt={`Halaman ${currentPageIndex + 1}`}
            className="max-w-full max-h-[50vh] object-contain shadow-2xl rounded-sm border border-slate-800"
          />
        )}

        {/* Page Nav Arrows */}
        {doc.pages.length > 1 && (
          <>
            <button
              onClick={() => setCurrentPageIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentPageIndex === 0}
              className="absolute left-2 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white disabled:opacity-20 active:scale-95 transition-transform"
              aria-label="Halaman Sebelumnya"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            <button
              onClick={() => setCurrentPageIndex((prev) => Math.min(doc.pages.length - 1, prev + 1))}
              disabled={currentPageIndex === doc.pages.length - 1}
              className="absolute right-2 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white disabled:opacity-20 active:scale-95 transition-transform"
              aria-label="Halaman Selanjutnya"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}

        {/* Floating Page Badge */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-xs px-3.5 py-1 rounded-full text-xs font-medium text-slate-200 border border-white/10 shadow-lg">
          Halaman {currentPageIndex + 1} dari {doc.pages.length}
        </div>
      </div>

      {/* Thumbnail Carousel & Add Page Bar */}
      <div className="h-20 bg-[#1E3E62]/80 border-t border-slate-700/80 flex items-center px-3 gap-2.5 overflow-x-auto">
        {doc.pages.map((p, idx) => {
          const isSelected = idx === currentPageIndex;
          const thumbUrl = URL.createObjectURL(p.processedBlob);
          return (
            <div
              key={p.id}
              onClick={() => setCurrentPageIndex(idx)}
              className={`relative shrink-0 w-12 h-16 rounded border-2 overflow-hidden cursor-pointer transition-transform ${
                isSelected
                  ? 'border-blue-400 scale-105 shadow-md shadow-blue-500/30'
                  : 'border-slate-700 opacity-60 hover:opacity-100'
              }`}
            >
              <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
              <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-center font-bold text-slate-200">
                {idx + 1}
              </div>
            </div>
          );
        })}

        {/* Add Page Buttons */}
        <button
          onClick={onScanNewPage}
          className="shrink-0 w-12 h-16 border-2 border-dashed border-blue-400/60 rounded flex flex-col items-center justify-center text-blue-300 hover:bg-blue-600/10 active:scale-95 transition-all"
          title="Scan halaman baru"
        >
          <Camera className="w-4 h-4 mb-0.5" />
          <span className="text-[9px] font-medium">+Scan</span>
        </button>

        <label
          className="shrink-0 w-12 h-16 border-2 border-dashed border-slate-600 rounded flex flex-col items-center justify-center text-slate-400 hover:bg-slate-700/30 active:scale-95 transition-all cursor-pointer"
          title="Impor halaman dari galeri"
        >
          <ImageIcon className="w-4 h-4 mb-0.5" />
          <span className="text-[9px] font-medium">+Foto</span>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportNewPage(f);
            }}
          />
        </label>
      </div>

      {/* Bottom Filter & Enhancement Controls */}
      <div className="bg-[#1E3E62] border-t border-slate-700/80 p-3.5 pb-6 safe-area-bottom">
        {/* Tab switch */}
        <div className="flex items-center justify-center gap-6 mb-3 text-xs">
          <button
            onClick={() => setActiveTab('filters')}
            className={`font-semibold pb-1 transition-colors border-b-2 ${
              activeTab === 'filters'
                ? 'text-blue-400 border-blue-400'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            Filter Dokumen
          </button>
          <button
            onClick={() => setActiveTab('adjust')}
            className={`font-semibold pb-1 transition-colors border-b-2 flex items-center gap-1 ${
              activeTab === 'adjust'
                ? 'text-blue-400 border-blue-400'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Kecerahan & Kontras
          </button>
        </div>

        {/* Tab 1: Filters presets */}
        {activeTab === 'filters' ? (
          <div className="grid grid-cols-4 gap-2 mb-3">
            {(
              [
                { id: 'magic', label: 'Peningkatan', desc: 'Magic Color' },
                { id: 'bw', label: 'Hitam Putih', desc: 'B&W' },
                { id: 'grayscale', label: 'Skala Abu', desc: 'Gray' },
                { id: 'original', label: 'Asli', desc: 'Original' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => updatePageTransformations(f.id)}
                className={`py-2 px-1 rounded-xl text-center transition-all ${
                  currentPage?.filter === f.id
                    ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <p className="text-xs leading-none">{f.label}</p>
                <p className="text-[10px] text-slate-300 mt-1">{f.desc}</p>
              </button>
            ))}
          </div>
        ) : (
          /* Tab 2: Brightness & Contrast Sliders */
          <div className="space-y-2 mb-3 bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/60 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Kecerahan: {currentPage?.brightness || 0}</span>
              <button
                onClick={() => updatePageTransformations(undefined, 0, 0, 0)}
                className="text-[10px] text-blue-400 hover:underline"
              >
                Reset Slider
              </button>
            </div>
            <input
              type="range"
              min="-40"
              max="40"
              value={currentPage?.brightness || 0}
              onChange={(e) =>
                updatePageTransformations(undefined, 0, Number(e.target.value), undefined)
              }
              className="w-full accent-blue-500 cursor-pointer"
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-300">Kontras: {currentPage?.contrast || 0}</span>
            </div>
            <input
              type="range"
              min="-40"
              max="40"
              value={currentPage?.contrast || 0}
              onChange={(e) =>
                updatePageTransformations(undefined, 0, undefined, Number(e.target.value))
              }
              className="w-full accent-blue-500 cursor-pointer"
            />
          </div>
        )}

        {/* Action icons row */}
        <div className="flex items-center justify-around pt-1 text-slate-300 text-[11px]">
          <button
            onClick={() => updatePageTransformations(undefined, 90)}
            className="flex flex-col items-center hover:text-white active:scale-95 transition-transform"
          >
            <RotateCw className="w-5 h-5 mb-1 text-blue-400" />
            <span>Putar 90°</span>
          </button>

          <button
            onClick={() => setIsCropOpen(true)}
            className="flex flex-col items-center hover:text-white active:scale-95 transition-transform"
          >
            <Crop className="w-5 h-5 mb-1 text-cyan-400" />
            <span>Koreksi Sudut</span>
          </button>

          {/* Reorder Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleReorderPage('left')}
              disabled={currentPageIndex === 0}
              className="flex flex-col items-center hover:text-white disabled:opacity-20 active:scale-95 transition-transform"
              title="Pindah urutan ke kiri"
            >
              <ChevronLeft className="w-5 h-5 mb-1" />
              <span>Geser Kiri</span>
            </button>
            <button
              onClick={() => handleReorderPage('right')}
              disabled={currentPageIndex === doc.pages.length - 1}
              className="flex flex-col items-center hover:text-white disabled:opacity-20 active:scale-95 transition-transform"
              title="Pindah urutan ke kanan"
            >
              <ChevronRight className="w-5 h-5 mb-1" />
              <span>Geser Kanan</span>
            </button>
          </div>

          <button
            onClick={handleDeletePage}
            className="flex flex-col items-center text-rose-400 hover:text-rose-300 active:scale-95 transition-transform"
          >
            <Trash2 className="w-5 h-5 mb-1" />
            <span>Hapus Hal</span>
          </button>
        </div>
      </div>

      {/* Export PDF Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#1E3E62] border border-slate-700 rounded-2xl max-w-sm w-full p-5 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700 mb-4">
              <h3 className="font-semibold text-base">Ekspor Dokumen</h3>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1.5">Nama Berkas</label>
                <input
                  type="text"
                  value={exportFileName}
                  onChange={(e) => setExportFileName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-400"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1.5">Ukuran Kertas PDF</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setExportFormat('a4')}
                    className={`py-2 px-3 rounded-xl border text-center transition-colors ${
                      exportFormat === 'a4'
                        ? 'border-blue-500 bg-blue-600/30 text-white font-semibold'
                        : 'border-slate-700 bg-slate-900 text-slate-300'
                    }`}
                  >
                    Standar A4 (Rapi)
                  </button>
                  <button
                    onClick={() => setExportFormat('fit')}
                    className={`py-2 px-3 rounded-xl border text-center transition-colors ${
                      exportFormat === 'fit'
                        ? 'border-blue-500 bg-blue-600/30 text-white font-semibold'
                        : 'border-slate-700 bg-slate-900 text-slate-300'
                    }`}
                  >
                    Sesuai Dokumen (Fit)
                  </button>
                </div>
              </div>

              {exportStatus && (
                <div className="p-3 bg-blue-900/40 border border-blue-500/30 rounded-xl text-center text-blue-200">
                  {exportStatus}
                </div>
              )}

              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={handleExportPDF}
                  disabled={isSaving}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 active:scale-98 rounded-xl font-semibold text-white shadow-lg flex items-center justify-center gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Ekspor PDF ({doc.pages.length} Halaman)</span>
                </button>

                <button
                  onClick={handleExportSingleImage}
                  disabled={isSaving}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-98 rounded-xl font-medium text-slate-200 border border-slate-700 flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4 text-cyan-400" />
                  <span>Unduh Halaman Ini Saja (JPG)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recrop Modal */}
      {isCropOpen && currentPage && (
        <CropModal
          imageBlob={currentPage.originalBlob}
          initialCorners={currentPage.corners}
          onDone={handleRecropDone}
          onCancel={() => setIsCropOpen(false)}
        />
      )}

      {/* OCR Modal */}
      {isOcrOpen && currentPage && (
        <OCRModal
          imageBlob={currentPage.processedBlob}
          documentTitle={doc.title}
          pageNumber={currentPageIndex + 1}
          onClose={() => setIsOcrOpen(false)}
        />
      )}
    </div>
  );
};
