import { useState, useEffect, useRef, useId } from 'react';
import { useLanguage } from '../../context/useLanguage';
import { parseAttendanceQrPayload } from '../../services/attendanceService';
import { Camera, Image as ImageIcon, AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * Panel Scanner QR Mahasiswa berbasis dynamic import `html5-qrcode`:
 * - Pindai lewat kamera langsung (`start` -> auto stop/clear saat scan sukses atau unmount)
 * - Cadangan pindai dari berkas gambar QR (`scanFile`)
 */
export default function QrScannerPanel({ onScanSuccess, disabled = false }) {
  const { language } = useLanguage();
  const scannerDomId = `smartsa_qr_${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const scannerRef = useRef(null);
  const runningRef = useRef(false);
  const onScanSuccessRef = useRef(onScanSuccess);

  const [cameraStatus, setCameraStatus] = useState('starting'); // 'starting' | 'active' | 'error' | 'detected'
  const [scannerError, setScannerError] = useState('');
  const [scanningFile, setScanningFile] = useState(false);

  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  const stopAndClearScanner = async (instanceOverride = null) => {
    const instance = instanceOverride || scannerRef.current;
    if (instance === scannerRef.current) {
      scannerRef.current = null;
    }
    if (!instance) return;

    if (runningRef.current && typeof instance.stop === 'function') {
      runningRef.current = false;
      try {
        await instance.stop();
      } catch {
        // Abaikan error saat kamera belum/sudah berhenti
      }
    }
    if (typeof instance.clear === 'function') {
      try {
        await Promise.resolve(instance.clear());
      } catch {
        // Abaikan error cleanup DOM html5-qrcode
      }
    }
  };

  useEffect(() => {
    let active = true;
    let createdInstance = null;

    if (disabled) return undefined;

    const startCamera = async () => {
      try {
        const mod = await import('html5-qrcode');
        if (!active) return;

        const Html5QrcodeCtor = mod?.Html5Qrcode || mod?.default?.Html5Qrcode;
        if (typeof Html5QrcodeCtor !== 'function') {
          throw new Error('Modul scanner Html5Qrcode tidak tersedia.');
        }

        createdInstance = new Html5QrcodeCtor(scannerDomId);
        scannerRef.current = createdInstance;

        await createdInstance.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 210, height: 210 } },
          async (decodedText) => {
            const parsedCode = parseAttendanceQrPayload(decodedText);
            if (!parsedCode || !active) return;
            setCameraStatus('detected');
            setScannerError('');
            await stopAndClearScanner(createdInstance);
            onScanSuccessRef.current?.(parsedCode, decodedText);
          },
          () => {
            // Frame gagal decode adalah perilaku normal setiap tick kamera
          }
        );

        if (!active) {
          runningRef.current = true;
          await stopAndClearScanner(createdInstance);
          return;
        }

        runningRef.current = true;
        setCameraStatus('active');
        setScannerError('');
      } catch (err) {
        if (!active) return;
        runningRef.current = false;
        setCameraStatus('error');
        setScannerError(
          err?.message ||
            (language === 'en'
              ? 'Camera could not be accessed. Allow permission or upload a QR image below.'
              : 'Kamera tidak dapat diakses. Izinkan akses kamera atau unggah foto QR di bawah.')
        );
      }
    };

    void startCamera();

    return () => {
      active = false;
      void stopAndClearScanner(createdInstance);
    };
  }, [disabled, language, scannerDomId]);

  const handleScanQrImageFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || scanningFile || disabled) return;

    setScanningFile(true);
    setScannerError('');
    try {
      const mod = await import('html5-qrcode');
      const Html5QrcodeCtor = mod?.Html5Qrcode || mod?.default?.Html5Qrcode;
      if (typeof Html5QrcodeCtor !== 'function') {
        throw new Error('Modul pembaca gambar QR tidak tersedia.');
      }

      // Gunakan instance terpisah bila kamera tidak berjalan atau instance aktif
      const fileDomId = `${scannerDomId}_file`;
      const readerInstance = scannerRef.current || new Html5QrcodeCtor(fileDomId);
      let decodedText = '';
      try {
        decodedText = await readerInstance.scanFile(file, false);
      } finally {
        if (readerInstance !== scannerRef.current && typeof readerInstance.clear === 'function') {
          await Promise.resolve(readerInstance.clear()).catch(() => {});
        }
      }

      const parsedCode = parseAttendanceQrPayload(decodedText);
      if (!parsedCode) {
        throw new Error(
          language === 'en'
            ? 'QR image does not contain a valid session code.'
            : 'Gambar QR tidak berisi kode sesi presensi yang valid.'
        );
      }

      setCameraStatus('detected');
      await stopAndClearScanner();
      onScanSuccessRef.current?.(parsedCode, decodedText);
    } catch (err) {
      setScannerError(
        err?.message ||
          (language === 'en'
            ? 'Failed to read QR code from uploaded image.'
            : 'Gagal membaca kode QR dari berkas gambar yang dipilih.')
      );
    } finally {
      setScanningFile(false);
    }
  };

  return (
    <div className="space-y-3 text-left">
      <div className="rounded-xl bg-slate-950 border border-slate-700 overflow-hidden relative min-h-[210px] flex flex-col items-center justify-center">
        <div id={scannerDomId} className="w-full" />
        <div id={`${scannerDomId}_file`} className="hidden" />

        {cameraStatus === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300 text-xs font-mono p-4 text-center bg-slate-950/90">
            <Camera className="w-7 h-7 text-[#f59e0b] animate-pulse" />
            <span>
              {language === 'en'
                ? 'Activating camera scanner...'
                : 'Mengaktifkan kamera scanner QR...'}
            </span>
          </div>
        )}

        {cameraStatus === 'detected' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-emerald-300 text-xs font-mono p-4 text-center bg-slate-950/90">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            <span>
              {language === 'en' ? 'QR detected! Verifying session...' : 'QR terbaca! Memverifikasi presensi...'}
            </span>
          </div>
        )}

        {cameraStatus === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-amber-300 text-[11px] font-mono p-4 text-center bg-slate-950/95">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
            <span>{scannerError}</span>
          </div>
        )}
      </div>

      {scannerError && cameraStatus !== 'error' && (
        <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/40 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{scannerError}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
          {language === 'en'
            ? 'Camera blocked? Upload a QR photo instead:'
            : 'Kamera terkendala? Pindai dari gambar QR:'}
        </span>
        <label className="cursor-pointer px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0e1522] hover:bg-slate-100 dark:hover:bg-[#192233] text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 shrink-0">
          <ImageIcon className="w-3.5 h-3.5 text-[#f59e0b]" />
          <span>
            {scanningFile
              ? language === 'en'
                ? 'Reading...'
                : 'Membaca...'
              : language === 'en'
                ? 'Scan QR Image'
                : 'Pindai Gambar QR'}
          </span>
          <input
            type="file"
            accept="image/*"
            aria-label={language === 'en' ? 'Scan QR code from image' : 'Pindai kode QR dari gambar'}
            disabled={scanningFile || disabled}
            onChange={(e) => void handleScanQrImageFile(e)}
            className="sr-only"
          />
        </label>
      </div>
    </div>
  );
}
