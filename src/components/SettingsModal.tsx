import React, { useState, useEffect } from 'react';
import { getStorageQuota, clearAllDocuments } from '../services/db';
import { usePWAInstall } from '../hooks/usePWAInstall';
import {
  ShieldCheck,
  HardDrive,
  Trash2,
  Smartphone,
  Info,
  CheckCircle2,
  X,
  AlertTriangle,
  Download,
  HelpCircle,
} from 'lucide-react';

interface Props {
  onClose: () => void;
  onDataCleared: () => void;
}

export const SettingsModal: React.FC<Props> = ({ onClose, onDataCleared }) => {
  const { isInstalled, isInstallable, install } = usePWAInstall();
  const [quota, setQuota] = useState<{ usedMB: number; quotaMB: number; percent: number }>({
    usedMB: 0,
    quotaMB: 0,
    percent: 0,
  });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    getStorageQuota().then(setQuota);
  }, []);

  const handleClear = async () => {
    setIsClearing(true);
    try {
      await clearAllDocuments();
      onDataCleared();
      setShowClearConfirm(false);
      onClose();
    } catch (e) {
      console.error(e);
      alert('Gagal menghapus data.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs select-none">
      <div className="bg-[#1E3E62] border border-slate-700 rounded-3xl max-w-md w-full max-h-[90vh] flex flex-col text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-base">Pengaturan & Informasi</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* Privacy Card */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
              <ShieldCheck className="w-5 h-5" />
              <span>Privasi 100% On-Device</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              DokuScan bekerja sepenuhnya di dalam memori peramban ponsel Android Anda. Foto, hasil crop, berkas PDF, dan hasil pembacaan teks OCR tidak pernah diunggah ke internet atau server mana pun.
            </p>
          </div>

          {/* Storage Information */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm">
                <HardDrive className="w-4 h-4" />
                <span>Penyimpanan Lokal (IndexedDB)</span>
              </div>
              <span className="text-[11px] text-slate-400">{quota.percent}% Terpakai</span>
            </div>

            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
              <div
                className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full"
                style={{ width: `${Math.max(2, quota.percent)}%` }}
              />
            </div>

            <div className="flex justify-between text-[11px] text-slate-300">
              <span>Digunakan: {quota.usedMB} MB</span>
              <span>Kapasitas Tersedia: ~{quota.quotaMB} MB</span>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-200 text-[11px] leading-relaxed flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <span>
                <strong>Catatan Penting:</strong> Dokumen tersimpan di memori browser perangkat ini. Jika Anda memilih "Hapus Data Situs" (Clear Browsing Data) pada setelan Chrome, dokumen dapat terhapus permanen. Rutin ekspor PDF penting ke folder penyimpanan HP Anda.
              </span>
            </div>
          </div>

          {/* PWA Android Status */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm">
              <Smartphone className="w-4 h-4" />
              <span>Status Aplikasi Android (PWA)</span>
            </div>

            {isInstalled ? (
              <div className="flex items-center gap-2 text-emerald-400 text-xs">
                <CheckCircle2 className="w-4 h-4" />
                <span>DokuScan sudah terpasang dalam mode Standalone.</span>
              </div>
            ) : isInstallable ? (
              <div className="space-y-2">
                <p className="text-slate-300">
                  DokuScan siap dipasang ke beranda ponsel Anda untuk kenyamanan penggunaan satu tangan dan mode layar penuh.
                </p>
                <button
                  onClick={install}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-medium flex items-center justify-center gap-2 shadow-md"
                >
                  <Download className="w-4 h-4" />
                  <span>Pasang Aplikasi Sekarang</span>
                </button>
              </div>
            ) : (
              <div className="space-y-1 text-slate-300">
                <p>
                  Untuk memasang di Chrome Android: Tekan tombol <strong>titik tiga (⋮)</strong> di kanan atas Chrome, lalu pilih <strong>Tambahkan ke Layar Utama</strong> atau <strong>Instal aplikasi</strong>.
                </p>
              </div>
            )}
          </div>

          {/* Danger Zone: Clear all docs */}
          <div className="pt-2">
            {!showClearConfirm ? (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="w-full py-2.5 px-3 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Hapus Seluruh Dokumen Tersimpan</span>
              </button>
            ) : (
              <div className="p-3.5 bg-rose-950/70 border border-rose-600 rounded-xl space-y-2.5">
                <p className="font-semibold text-rose-200 text-xs">
                  Apakah Anda yakin ingin menghapus SEMUA dokumen?
                </p>
                <p className="text-[11px] text-rose-300 leading-relaxed">
                  Tindakan ini tidak dapat dibatalkan. Seluruh foto dan dokumen di IndexedDB akan dihapus permanen.
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 font-medium text-xs"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleClear}
                    disabled={isClearing}
                    className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 rounded-lg text-white font-semibold text-xs shadow-md"
                  >
                    {isClearing ? 'Menghapus...' : 'Ya, Hapus Semua'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900/90 border-t border-slate-800 text-center text-[11px] text-slate-400">
          DokuScan v1.0.0 &bull; Progressive Web App Pemindai Dokumen
        </div>
      </div>
    </div>
  );
};
