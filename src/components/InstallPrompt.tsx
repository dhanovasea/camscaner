import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, X, HelpCircle, Smartphone, CheckCircle } from 'lucide-react';

export const InstallPrompt: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (isInstalled || dismissed) return null;

  return (
    <>
      {/* Top Android PWA Banner */}
      <div className="bg-gradient-to-r from-[#1E3E62] to-[#0B192C] border-b border-blue-500/30 px-3 py-2 text-slate-100 flex items-center justify-between text-xs shadow-md">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="p-1.5 bg-blue-600 rounded-lg shrink-0">
            <Smartphone className="w-4 h-4 text-white" />
          </div>
          <div className="truncate">
            <p className="font-semibold text-slate-100 truncate">Pasang DokuScan di HP</p>
            <p className="text-[11px] text-slate-400 truncate">Mode layar penuh, cepat & bisa offline</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {isInstallable ? (
            <button
              onClick={install}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white font-medium rounded-lg text-xs transition-transform"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Pasang</span>
            </button>
          ) : (
            <button
              onClick={() => setShowGuide(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-300 font-medium rounded-lg text-xs border border-blue-500/30"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Cara Pasang</span>
            </button>
          )}

          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-slate-400 hover:text-slate-200"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Guide Modal for Chrome Android and iOS */}
      {showGuide && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#1E3E62] border border-blue-500/30 rounded-2xl max-w-sm w-full p-5 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700 mb-4">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-400" />
                <h3 className="font-semibold text-base">Cara Pasang DokuScan</h3>
              </div>
              <button
                onClick={() => setShowGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-3 text-xs text-slate-300">
                <p className="font-medium text-white">Panduan Safari iOS:</p>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600/40 text-blue-300 flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                  <span>Tekan tombol <strong>Bagikan (Share)</strong> di bar bawah Safari.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600/40 text-blue-300 flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                  <span>Gulir ke bawah dan pilih <strong>Tambahkan ke Layar Utama</strong> (Add to Home Screen).</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-slate-300">
                <p className="font-medium text-white">Panduan Chrome di HP Android:</p>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600/40 text-blue-300 flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                  <span>Tekan menu <strong>titik tiga (⋮)</strong> di sudut kanan atas browser Chrome.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600/40 text-blue-300 flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                  <span>Pilih <strong>Tambahkan ke Layar Utama</strong> atau <strong>Instal aplikasi</strong>.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600/40 text-blue-300 flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
                  <span>DokuScan akan langsung terpasang sebagai aplikasi mandiri di beranda HP Anda!</span>
                </div>
              </div>
            )}

            <div className="mt-5 pt-3 border-t border-slate-700/80 flex justify-end">
              <button
                onClick={() => setShowGuide(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-semibold text-white"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
