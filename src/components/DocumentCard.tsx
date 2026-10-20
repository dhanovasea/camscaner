import React, { useState, useEffect } from 'react';
import { DocumentRecord } from '../types';
import { generatePdfBlob, shareOrDownloadFile } from '../services/pdfService';
import { FileText, MoreVertical, Trash2, Edit2, Share2, Calendar, Layers } from 'lucide-react';

interface Props {
  doc: DocumentRecord;
  onClick: () => void;
  onRename: (newTitle: string) => void;
  onDelete: () => void;
}

export const DocumentCard: React.FC<Props> = ({ doc, onClick, onRename, onDelete }) => {
  const [thumbUrl, setThumbUrl] = useState<string>('');
  const [showMenu, setShowMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const firstPage = doc.pages[0];

  useEffect(() => {
    if (!firstPage?.processedBlob) return;
    const url = URL.createObjectURL(firstPage.processedBlob);
    setThumbUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [firstPage?.processedBlob]);

  const formattedDate = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(doc.updatedAt));

  const handleQuickExport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExporting(true);
    setShowMenu(false);
    try {
      const pdfBlob = await generatePdfBlob(doc.pages, { format: 'a4' });
      await shareOrDownloadFile(pdfBlob, `${doc.title.trim()}.pdf`, doc.title);
    } catch {
      alert('Gagal mengekspor PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleRenameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    const newName = prompt('Ubah nama dokumen:', doc.title);
    if (newName && newName.trim()) {
      onRename(newName.trim());
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    if (confirm(`Hapus dokumen "${doc.title}"?`)) {
      onDelete();
    }
  };

  return (
    <div
      onClick={onClick}
      className="group relative bg-[#1E3E62]/40 hover:bg-[#1E3E62]/70 border border-slate-800 hover:border-blue-500/40 rounded-2xl overflow-hidden flex flex-col shadow-lg transition-all active:scale-[0.98] cursor-pointer"
    >
      {/* Thumbnail Aspect Box */}
      <div className="relative aspect-[3/4] bg-slate-950 flex items-center justify-center overflow-hidden">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={doc.title}
            className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
            loading="lazy"
          />
        ) : (
          <FileText className="w-12 h-12 text-slate-700" />
        )}

        {/* Page Count Badge */}
        <div className="absolute top-2.5 right-2.5 bg-black/75 backdrop-blur-xs text-white text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 border border-white/10 shadow-sm">
          <Layers className="w-3 h-3 text-cyan-400" />
          <span>{doc.pages.length} Hal</span>
        </div>
      </div>

      {/* Info Bar */}
      <div className="p-3 flex items-center justify-between gap-2">
        <div className="overflow-hidden">
          <h4 className="font-semibold text-xs text-white truncate" title={doc.title}>
            {doc.title}
          </h4>
          <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
            <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
            <span className="truncate">{formattedDate}</span>
          </div>
        </div>

        {/* Quick Menu Button */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/60"
            aria-label="Menu dokumen"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                }}
              />
              <div className="absolute right-0 bottom-full mb-1 z-30 w-36 bg-[#1E3E62] border border-slate-700 rounded-xl shadow-xl py-1 text-xs text-slate-200">
                <button
                  onClick={handleQuickExport}
                  disabled={isExporting}
                  className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center gap-2"
                >
                  <Share2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Ekspor PDF</span>
                </button>
                <button
                  onClick={handleRenameClick}
                  className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center gap-2"
                >
                  <Edit2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Ganti Nama</span>
                </button>
                <button
                  onClick={handleDeleteClick}
                  className="w-full px-3 py-2 text-left hover:bg-rose-900/40 text-rose-300 flex items-center gap-2 border-t border-slate-700/60"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Hapus</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
