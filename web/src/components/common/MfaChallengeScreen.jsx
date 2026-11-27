import { useState } from 'react';
import { ShieldCheck, KeyRound, LogOut, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import BrandLogo from './BrandLogo';

/**
 * Layar penguncian Autentikasi Dua Faktor (TOTP) sebelum akses ke seluruh LMS_VIEWS dibuka.
 * Mendukung input kode 6 digit Authenticator maupun toggle ke 1 Backup Code sekali pakai.
 */
export default function MfaChallengeScreen() {
  const { currentUser, userProfile, verifyMfaChallenge, logout } = useAuth();
  const { t, language } = useLanguage();

  const [useBackupMode, setUseBackupMode] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleToggleMode = () => {
    setUseBackupMode((prev) => !prev);
    setInputCode('');
    setErrorMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleaned = inputCode.trim();
    if (!cleaned) {
      setErrorMsg(
        useBackupMode
          ? language === 'en'
            ? 'Please enter one emergency backup code.'
            : 'Masukkan satu Backup Code darurat Anda.'
          : language === 'en'
            ? 'Please enter the 6-digit Authenticator code.'
            : 'Masukkan kode 6 digit dari aplikasi Authenticator.'
      );
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg('');
      await verifyMfaChallenge(
        useBackupMode ? { backupCode: cleaned } : { code: cleaned }
      );
    } catch (err) {
      setErrorMsg(
        err?.message ||
          (language === 'en'
            ? 'Verification failed. Check your code and try again.'
            : 'Verifikasi 2FA gagal. Periksa kembali kode Anda.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const displayEmail = userProfile?.email || currentUser?.email || '';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-slate-50 dark:bg-[#0d1117]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-gate-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-[#232f42] bg-white dark:bg-[#121822] shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-slate-200 dark:border-[#232f42] bg-slate-50 dark:bg-[#161d2a] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandLogo size="sm" alt="Smartsa LMS" glow={false} />
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-amber-600 dark:text-[#f59e0b] block font-bold">
                {'// TWO-FACTOR SECURITY GATE'}
              </span>
              <h1
                id="mfa-gate-title"
                className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100"
              >
                {t('mfa_gate_title', 'Verifikasi 2FA (TOTP)')}
              </h1>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-amber-100 dark:bg-[#f59e0b]/15 text-amber-600 dark:text-[#f59e0b] border border-amber-200 dark:border-[#f59e0b]/30">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {t(
                'mfa_gate_desc',
                'Akun ini dilindungi Autentikasi Dua Faktor. Verifikasi kode dari Google Authenticator / Authy atau gunakan Backup Code untuk melanjutkan.'
              )}
            </p>
            {displayEmail && (
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {displayEmail}
              </p>
            )}
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-lg border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="mfa-gate-code-input"
              className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              {useBackupMode
                ? t('mfa_backup_input_label', 'Masukkan 1 Backup Code Darurat')
                : t('mfa_totp_input_label', 'Masukkan Kode Authenticator (6 Digit)')}
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="mfa-gate-code-input"
                type="text"
                autoFocus
                autoComplete="one-time-code"
                inputMode={useBackupMode ? 'text' : 'numeric'}
                maxLength={useBackupMode ? 16 : 6}
                placeholder={useBackupMode ? 'XXXX-XXXX' : '000000'}
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-sm font-mono tracking-widest bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-mono font-bold py-2.5 px-4 rounded-lg transition shadow-sm disabled:opacity-50"
          >
            {submitting
              ? language === 'en'
                ? 'VERIFYING...'
                : 'MEMVERIFIKASI...'
              : t('mfa_verify_submit', 'VERIFIKASI & MASUK LMS')}
          </button>

          <div className="pt-2 border-t border-slate-200 dark:border-[#232f42] flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleToggleMode}
              className="text-xs font-mono font-semibold text-amber-600 dark:text-[#f59e0b] hover:underline flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {useBackupMode
                ? t('mfa_switch_totp', 'Gunakan Kode Authenticator')
                : t('mfa_switch_backup', 'Gunakan Backup Code')}
            </button>

            <button
              type="button"
              onClick={logout}
              className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              {t('mfa_logout_btn', 'Logout')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
