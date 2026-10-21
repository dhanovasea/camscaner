import React, { useState, useEffect, useRef } from 'react';
import { DocumentRecord, PageItem, SortOrder, DocumentCorners } from './types';
import { getAllDocuments, saveDocument, deleteDocument } from './services/db';
import { applyDocumentFilters } from './services/imageFilters';
import { InstallPrompt } from './components/InstallPrompt';
import { CameraModal } from './components/CameraModal';
import { CropModal } from './components/CropModal';
import { DocumentEditor } from './components/DocumentEditor';
import { DocumentCard } from './components/DocumentCard';
import { SettingsModal } from './components/SettingsModal';
import {
  Camera,
  FolderOpen,
  Search,
  SlidersHorizontal,
  Settings,
  FileText,
  Plus,
  WifiOff,
  Sparkles,
  ArrowUpDown,
} from 'lucide-react';

export default function App() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [activeDoc, setActiveDoc] = useState<DocumentRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  // Modals & Navigation
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [pendingCropBlob, setPendingCropBlob] = useState<Blob | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'documents' | 'settings'>('documents');
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load documents from IndexedDB
  const refreshDocuments = async () => {
    try {
      const list = await getAllDocuments();
      setDocuments(list);
    } catch (e) {
      console.error('Failed to load documents from IndexedDB:', e);
    }
  };

  useEffect(() => {
    refreshDocuments();

    // Check PWA shortcut: ?action=scan
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'scan') {
      setIsCameraOpen(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // When photo is captured via camera or selected from gallery
  const handlePhotoCaptured = (blob: Blob) => {
    setIsCameraOpen(false);
    setPendingCropBlob(blob);
  };

  // When crop / perspective adjustment is confirmed in CropModal
  const handleCropComplete = async (
    warpedBlob: Blob,
    corners: DocumentCorners,
    updatedOriginalBlob?: Blob
  ) => {
    // Apply default "magic" enhancement filter to newly captured page
    const imgUrl = URL.createObjectURL(warpedBlob);
    const img = new Image();
    img.src = imgUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Gagal memproses gambar'));
    });

    const enhancedCanvas = applyDocumentFilters(img, 'magic', 0, 0, 0);
    URL.revokeObjectURL(imgUrl);

    enhancedCanvas.toBlob(
      async (processedBlob) => {
        if (!processedBlob) return;

        const effectiveOriginal = updatedOriginalBlob || pendingCropBlob!;

        const newPage: PageItem = {
          id: crypto.randomUUID(),
          originalBlob: effectiveOriginal,
          processedBlob,
          corners,
          rotation: 0,
          filter: 'magic',
          brightness: 0,
          contrast: 0,
          width: enhancedCanvas.width,
          height: enhancedCanvas.height,
        };

        setPendingCropBlob(null);

        if (activeDoc) {
          // Appending to an existing open document (multi-page session)
          const updatedDoc: DocumentRecord = {
            ...activeDoc,
            pages: [...activeDoc.pages, newPage],
            updatedAt: Date.now(),
          };
          await saveDocument(updatedDoc);
          setActiveDoc(updatedDoc);
          await refreshDocuments();
        } else {
          // Creating a brand new document
          const now = new Date();
          const dateStr = new Intl.DateTimeFormat('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }).format(now);

          const newDoc: DocumentRecord = {
            id: crypto.randomUUID(),
            title: `Dokumen ${dateStr}`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            pages: [newPage],
          };

          await saveDocument(newDoc);
          setActiveDoc(newDoc);
          await refreshDocuments();
        }
      },
      'image/jpeg',
      0.93
    );
  };

  // Filter & sort documents
  const filteredAndSortedDocs = documents
    .filter((doc) => doc.title.toLowerCase().includes(searchQuery.toLowerCase().trim()))
    .sort((a, b) => {
      if (sortOrder === 'newest') return b.updatedAt - a.updatedAt;
      if (sortOrder === 'oldest') return a.updatedAt - b.updatedAt;
      if (sortOrder === 'name') return a.title.localeCompare(b.title);
      return 0;
    });

  const handleRenameDoc = async (id: string, newTitle: string) => {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;
    const updated = { ...doc, title: newTitle, updatedAt: Date.now() };
    await saveDocument(updated);
    await refreshDocuments();
  };

  const handleDeleteDoc = async (id: string) => {
    await deleteDocument(id);
    await refreshDocuments();
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#0B192C] text-slate-100 select-none antialiased">
      {/* PWA Install Banner */}
      <InstallPrompt />

      {/* Offline Toast */}
      {!isOnline && (
        <div className="bg-amber-600/90 text-white text-xs px-3 py-1.5 flex items-center justify-center gap-2 border-b border-amber-500 shadow-sm">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Mode Offline aktif &bull; Semua fitur scan & PDF tetap dapat digunakan secara lokal</span>
        </div>
      )}

      {/* Main Top Header */}
      <header className="sticky top-0 z-30 bg-[#1E3E62] border-b border-slate-700/80 px-4 py-3 shadow-md safe-area-top">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center shadow-md">
              <Camera className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight text-white flex items-center gap-1">
                <span>Doku</span>
                <span className="text-cyan-400">Scan</span>
              </h1>
              <p className="text-[10px] text-slate-300 -mt-0.5">Pemindai Dokumen PWA</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700/60 active:scale-95 transition-transform"
              aria-label="Pengaturan"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 pb-28 max-w-2xl w-full mx-auto overflow-y-auto">
        {/* Quick Action Hero Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {/* Scan Camera Button */}
          <button
            onClick={() => setIsCameraOpen(true)}
            className="relative overflow-hidden group flex flex-col items-center justify-center p-5 rounded-2xl bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700 text-white shadow-xl shadow-blue-600/25 border border-blue-400/30 active:scale-[0.98] transition-transform"
          >
            <div className="absolute top-2 right-2 p-1 bg-white/10 rounded-full">
              <Sparkles className="w-3 h-3 text-cyan-200" />
            </div>
            <div className="p-3 bg-white/15 rounded-2xl mb-2 group-hover:scale-110 transition-transform">
              <Camera className="w-7 h-7 text-white" />
            </div>
            <span className="font-bold text-sm tracking-wide">Scan Dokumen</span>
            <span className="text-[11px] text-blue-100 opacity-90 mt-0.5">Kamera Belakang</span>
          </button>

          {/* Import Gallery Button */}
          <button
            onClick={() => galleryInputRef.current?.click()}
            className="flex flex-col items-center justify-center p-5 rounded-2xl bg-[#1E3E62]/70 hover:bg-[#1E3E62] text-slate-200 border border-slate-700 shadow-lg active:scale-[0.98] transition-all"
          >
            <input
              type="file"
              ref={galleryInputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePhotoCaptured(file);
              }}
            />
            <div className="p-3 bg-slate-800 rounded-2xl mb-2 border border-slate-700">
              <FolderOpen className="w-7 h-7 text-cyan-400" />
            </div>
            <span className="font-bold text-sm tracking-wide text-white">Impor Galeri</span>
            <span className="text-[11px] text-slate-400 mt-0.5">Dari Foto HP</span>
          </button>
        </div>

        {/* Search & Sort Bar */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama dokumen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#1E3E62]/50 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-xs text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:bg-[#1E3E62]/80 transition-all"
            />
          </div>

          <div className="relative shrink-0">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              className="bg-[#1E3E62]/70 border border-slate-700 text-slate-200 text-xs rounded-xl py-2.5 px-3 focus:outline-none focus:border-blue-400 appearance-none pr-8 cursor-pointer"
            >
              <option value="newest">Terbaru</option>
              <option value="oldest">Terlama</option>
              <option value="name">Nama (A-Z)</option>
            </select>
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3.5 pointer-events-none" />
          </div>
        </div>

        {/* Document Grid / Empty State */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Dokumen Anda ({filteredAndSortedDocs.length})
          </h2>
        </div>

        {filteredAndSortedDocs.length === 0 ? (
          <div className="py-16 px-4 text-center bg-[#1E3E62]/20 border border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-3">
              <FileText className="w-8 h-8 stroke-1" />
            </div>
            <h3 className="font-semibold text-sm text-white mb-1">
              {searchQuery ? 'Tidak Ada Dokumen Cocok' : 'Belum Ada Dokumen'}
            </h3>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-5">
              {searchQuery
                ? `Tidak ditemukan dokumen dengan kata kunci "${searchQuery}".`
                : 'Pindai dokumen fisik atau kartu ID pertama Anda dengan kamera belakang HP.'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setIsCameraOpen(true)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/30 flex items-center gap-2 active:scale-95 transition-transform"
              >
                <Camera className="w-4 h-4" />
                <span>Mulai Pindai Sekarang</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredAndSortedDocs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onClick={() => setActiveDoc(doc)}
                onRename={(newTitle) => handleRenameDoc(doc.id, newTitle)}
                onDelete={() => handleDeleteDoc(doc.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 inset-x-0 bg-[#1E3E62] border-t border-slate-700/80 px-6 py-2 flex items-center justify-around z-30 safe-area-bottom shadow-2xl">
        <button
          onClick={() => {
            setActiveTab('documents');
          }}
          className={`flex flex-col items-center transition-colors ${
            activeTab === 'documents' ? 'text-cyan-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Dokumen</span>
        </button>

        {/* Center Prominent Scan FAB */}
        <button
          onClick={() => setIsCameraOpen(true)}
          className="-mt-7 w-14 h-14 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-400 text-white shadow-xl shadow-blue-600/40 flex items-center justify-center border-4 border-[#0B192C] active:scale-95 transition-transform"
          aria-label="Scan Dokumen Baru"
        >
          <Camera className="w-6 h-6" />
        </button>

        <button
          onClick={() => setIsSettingsOpen(true)}
          className="flex flex-col items-center text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Settings className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Pengaturan</span>
        </button>
      </nav>

      {/* Camera Viewfinder Modal */}
      {isCameraOpen && (
        <CameraModal
          onCapture={handlePhotoCaptured}
          onClose={() => setIsCameraOpen(false)}
        />
      )}

      {/* Perspective / Angle Crop Modal */}
      {pendingCropBlob && (
        <CropModal
          imageBlob={pendingCropBlob}
          onDone={handleCropComplete}
          onCancel={() => setPendingCropBlob(null)}
        />
      )}

      {/* Full Document Editor Modal */}
      {activeDoc && (
        <DocumentEditor
          initialDoc={activeDoc}
          onBack={() => {
            setActiveDoc(null);
            refreshDocuments();
          }}
          onScanNewPage={() => setIsCameraOpen(true)}
          onImportNewPage={(file) => handlePhotoCaptured(file)}
        />
      )}

      {/* Settings & Privacy Modal */}
      {isSettingsOpen && (
        <SettingsModal
          onClose={() => setIsSettingsOpen(false)}
          onDataCleared={() => refreshDocuments()}
        />
      )}
    </div>
  );
}
