import { Component } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

function isStaleChunkError(error) {
  if (!error) return false;
  const name = error.name || '';
  const message = error.message || '';
  return (
    name === 'ChunkLoadError' ||
    /loading chunk [\w-]+ failed/i.test(message) ||
    /failed to fetch dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      isChunkError: false,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
      isChunkError: isStaleChunkError(error),
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[Smartsa ErrorBoundary] Uncaught render/chunk error:', error, errorInfo);
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.hash = '#landing';
    }
    this.setState({
      hasError: false,
      error: null,
      isChunkError: false,
    });
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { isChunkError, error } = this.state;

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0d1117] text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 font-sans">
        <div
          role="alert"
          className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-[#232f42] bg-white dark:bg-[#121822] shadow-2xl overflow-hidden"
        >
          <div className="px-6 py-5 border-b border-slate-200 dark:border-[#232f42] bg-slate-50 dark:bg-[#161d2a] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-[#f59e0b]/15 text-amber-600 dark:text-[#f59e0b] flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {isChunkError
                  ? 'Pembaruan Aplikasi Tersedia'
                  : 'Terjadi Kendala Tampilan'}
              </h1>
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {isChunkError ? 'STALE CHUNK RECOVERY' : 'SMARTSA RUNTIME BOUNDARY'}
              </p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {isChunkError
                ? 'Versi aplikasi terbaru telah dirilis atau koneksi terputus saat memuat modul halaman. Muat ulang halaman untuk mengambil berkas terbaru.'
                : 'Halaman mengalami kesalahan tak terduga saat merender antarmuka. Anda dapat memuat ulang halaman atau kembali ke beranda.'}
            </p>

            {error?.message && (
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#232f42] text-[11px] font-mono text-slate-600 dark:text-slate-400 break-words">
                {error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Muat Ulang Halaman</span>
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-slate-100 dark:bg-[#18212e] hover:bg-slate-200 dark:hover:bg-[#222f42] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#2b3a4f] text-xs font-semibold px-4 py-2.5 rounded-xl transition cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>Kembali ke Beranda</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
