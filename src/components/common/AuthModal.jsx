import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/LanguageContext';
import { ROLES, ROLE_LABELS } from '../../constants/roles';
import {
  X,
  Mail,
  Lock,
  User,
  Building,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  GraduationCap,
} from 'lucide-react';

export default function AuthModal({ isOpen, onClose }) {
  const {
    login,
    register,
    loginWithGoogle,
    loginWithGithub,
    resetPassword,
    switchDemoRole,
  } = useAuth();
  const { t, getRoleLabel, language } = useLanguage();

  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [selectedRole, setSelectedRole] = useState(ROLES.STUDENT);
  const [institution, setInstitution] = useState('');
  const [nim, setNim] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(null); // 'google' | 'github' | null
  const [feedback, setFeedback] = useState(null);

  if (!isOpen) return null;

  // Handler Submit Form Email & Password
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
        setFeedback({
          type: 'success',
          text: language === 'en' 
            ? 'Authentication successful! Redirecting to dashboard...' 
            : 'Otentikasi berhasil! Mengalihkan ke dashboard...',
        });
        setTimeout(() => onClose(), 800);
      } else if (mode === 'register') {
        await register(email, password, displayName, selectedRole, institution, nim);
        setFeedback({
          type: 'success',
          text: language === 'en'
            ? 'Account registered successfully! Academic data & profile synchronized.'
            : 'Pendaftaran akun berhasil! Data akademik & profil telah tersimpan dan disinkronkan.',
        });
        setTimeout(() => onClose(), 1200);
      } else if (mode === 'forgot') {
        await resetPassword(email);
        setFeedback({
          type: 'success',
          text: language === 'en'
            ? 'Password recovery link has been sent to your email.'
            : 'Tautan pemulihan kata sandi telah dikirim ke kotak masuk email Anda.',
        });
      }
    } catch (err) {
      let msg = err.message;
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        msg = language === 'en'
          ? 'Invalid credentials: Email or password does not match.'
          : 'Kredensial salah: Alamat email atau kata sandi tidak cocok.';
      } else if (err.code === 'auth/user-not-found') {
        msg = language === 'en'
          ? 'Account not found. Please register a new account.'
          : 'Akun belum terdaftar. Silakan pilih tab Daftar Akun Baru.';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = language === 'en'
          ? 'This email address is already in use. Please log in directly.'
          : 'Alamat email ini sudah terdaftar. Silakan langsung masuk.';
      } else if (err.code === 'auth/weak-password') {
        msg = language === 'en'
          ? 'Password is too short (minimum 6 characters).'
          : 'Kata sandi terlalu pendek (minimal 6 karakter).';
      } else if (err.code === 'auth/invalid-email') {
        msg = language === 'en'
          ? 'Invalid email address format.'
          : 'Format alamat email tidak valid.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = language === 'en'
          ? 'Too many failed attempts. Please try again later.'
          : 'Terlalu banyak percobaan gagal. Silakan tunggu beberapa saat atau reset sandi.';
      }
      setFeedback({ type: 'error', text: msg });
    } finally {
      setLoading(false);
    }
  };

  // Handler Login Akun Google
  const handleGoogleLogin = async () => {
    setFeedback(null);
    setSocialLoading('google');
    try {
      await loginWithGoogle();
      setFeedback({
        type: 'success',
        text: 'Berhasil terhubung dengan Akun Google!',
      });
      setTimeout(() => onClose(), 1000);
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') {
        setFeedback({
          type: 'error',
          text: 'Jendela otentikasi Google ditutup sebelum selesai.',
        });
      } else {
        setFeedback({
          type: 'error',
          text: `Gagal login dengan Google: ${err.message}`,
        });
      }
    } finally {
      setSocialLoading(null);
    }
  };

  // Handler Login Akun GitHub
  const handleGithubLogin = async () => {
    setFeedback(null);
    setSocialLoading('github');
    try {
      await loginWithGithub();
      setFeedback({
        type: 'success',
        text: 'Berhasil terhubung dengan Akun GitHub!',
      });
      setTimeout(() => onClose(), 1000);
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') {
        setFeedback({
          type: 'error',
          text: 'Jendela otentikasi GitHub ditutup sebelum proses selesai.',
        });
      } else {
        setFeedback({
          type: 'error',
          text: `Gagal login dengan GitHub: ${err.message}`,
        });
      }
    } finally {
      setSocialLoading(null);
    }
  };

  // Handler Masuk Cepat Akun Demo (Simulasi)
  const handleQuickDemo = (roleKey) => {
    switchDemoRole(roleKey);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-[#12161f] w-full max-w-md rounded-xl shadow-2xl border border-slate-700/80 overflow-hidden relative my-auto animate-in fade-in zoom-in-95 duration-200 font-sans">
        {/* Top Hazard Accent Stripe */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#f59e0b] via-[#fbbf24] to-[#f59e0b]" />

        {/* Modal Header */}
        <div className="bg-[#161c24] text-white p-5 border-b border-slate-700/80 relative">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center absolute top-4 right-4 transition"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#f59e0b] uppercase tracking-wider mb-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>// SMARTSA AUTHENTICATION GATEWAY</span>
          </div>
          <h2 className="text-lg font-black tracking-tight text-slate-100">
            {mode === 'login'
              ? 'Masuk ke Smartsa LMS'
              : mode === 'register'
              ? 'Daftarkan Akun Baru'
              : 'Pemulihan Kata Sandi'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {mode === 'login'
              ? 'Akses modul materi, silabus perkuliahan, dan evaluasi hasil belajar.'
              : mode === 'register'
              ? 'Buat profil akademik baru untuk memulai pengalaman belajar modern.'
              : 'Kirimkan tautan reset kata sandi ke alamat email Anda.'}
          </p>

          {/* Mode Switch Tabs */}
          <div className="flex gap-2 mt-4 pt-1">
            <button
              onClick={() => {
                setMode('login');
                setFeedback(null);
              }}
              className={`flex-1 py-1.5 text-xs font-mono font-bold rounded-sm transition uppercase tracking-wider ${
                mode === 'login'
                  ? 'bg-[#f59e0b] text-black shadow-xs'
                  : 'bg-[#1b2330] text-slate-400 hover:text-white'
              }`}
            >
              {t('tab_login')}
            </button>
            <button
              onClick={() => {
                setMode('register');
                setFeedback(null);
              }}
              className={`flex-1 py-1.5 text-xs font-mono font-bold rounded-sm transition uppercase tracking-wider ${
                mode === 'register'
                  ? 'bg-[#f59e0b] text-black shadow-xs'
                  : 'bg-[#1b2330] text-slate-400 hover:text-white'
              }`}
            >
              {t('tab_register')}
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`m-4 p-3 rounded-md text-xs font-mono flex items-start gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                : 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            )}
            <span className="leading-relaxed">{feedback.text}</span>
          </div>
        )}

        <div className="p-5 space-y-4">
          {/* Social Sign-In (Google & GitHub) */}
          {mode !== 'forgot' && (
            <div className="space-y-2.5">
              {/* Google Sign-In Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={socialLoading !== null}
                className="w-full bg-[#1c2432] hover:bg-[#232e40] text-slate-100 border border-slate-600/80 rounded-md py-2.5 px-4 text-xs font-bold transition flex items-center justify-center gap-3 shadow-xs disabled:opacity-50"
              >
                {/* Official Google SVG Logo */}
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>
                  {socialLoading === 'google'
                    ? (language === 'en' ? 'Connecting to Google...' : 'Menghubungkan ke Google...')
                    : t('google_login_btn')}
                </span>
              </button>

              {/* GitHub Sign-In Button */}
              <button
                type="button"
                onClick={handleGithubLogin}
                disabled={socialLoading !== null}
                className="w-full bg-[#1c2432] hover:bg-[#232e40] text-slate-100 border border-slate-600/80 rounded-md py-2.5 px-4 text-xs font-bold transition flex items-center justify-center gap-3 shadow-xs disabled:opacity-50"
              >
                {/* GitHub Cat Icon SVG */}
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
                <span>
                  {socialLoading === 'github'
                    ? (language === 'en' ? 'Connecting to GitHub...' : 'Menghubungkan ke GitHub...')
                    : t('github_login_btn')}
                </span>
              </button>

              {/* Divider ATAU */}
              <div className="relative flex items-center justify-center my-3">
                <div className="border-t border-slate-700/80 w-full" />
                <span className="bg-[#12161f] px-3 text-[10px] font-mono text-slate-500 uppercase tracking-widest shrink-0">
                  {t('or_with_email')}
                </span>
                <div className="border-t border-slate-700/80 w-full" />
              </div>
            </div>
          )}

          {/* Form Email & Password */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-[11px] font-mono font-bold text-slate-300 mb-1">
                    {t('full_name_label')}
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder={t('full_name_placeholder')}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-[#0b0f17] border border-slate-700 rounded-md text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono font-bold text-slate-300 mb-1">
                    {t('role_label')}
                  </label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#0b0f17] border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-[#f59e0b]"
                  >
                    <option value={ROLES.STUDENT}>{getRoleLabel(ROLES.STUDENT)}</option>
                    <option value={ROLES.TEACHER}>{getRoleLabel(ROLES.TEACHER)}</option>
                    <option value={ROLES.LECTURER}>{getRoleLabel(ROLES.LECTURER)}</option>
                    <option value={ROLES.GENERAL}>{getRoleLabel(ROLES.GENERAL)}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-mono font-bold text-slate-300 mb-1">
                    {t('institution_label')}
                  </label>
                  <div className="relative">
                    <Building className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder={t('institution_placeholder')}
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-[#0b0f17] border border-slate-700 rounded-md text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono font-bold text-slate-300 mb-1">
                    {selectedRole === ROLES.LECTURER
                      ? 'NIDN / NOMOR INDUK DOSEN'
                      : selectedRole === ROLES.TEACHER
                      ? 'NIP / NOMOR INDUK PEGAWAI'
                      : 'NIM / NOMOR INDUK MAHASISWA'}
                  </label>
                  <div className="relative">
                    <GraduationCap className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder={
                        selectedRole === ROLES.LECTURER
                          ? 'Contoh: 0012058402'
                          : selectedRole === ROLES.TEACHER
                          ? 'Contoh: 198504122010012003'
                          : 'Contoh: 25050974001'
                      }
                      value={nim}
                      onChange={(e) => setNim(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-[#0b0f17] border border-slate-700 rounded-md text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-[11px] font-mono font-bold text-slate-300 mb-1">
                {t('email_label')}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="mahasiswa@smartsa.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#0b0f17] border border-slate-700 rounded-md text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div>
                <label className="block text-[11px] font-mono font-bold text-slate-300 mb-1">
                  {t('password_label')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder={t('password_placeholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2 text-xs bg-[#0b0f17] border border-slate-700 rounded-md text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'login' && (
              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setFeedback(null);
                  }}
                  className="text-[11px] text-[#f59e0b] hover:underline font-mono"
                >
                  {t('forgot_password')}
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#f59e0b] hover:bg-[#d97706] text-black font-black py-2.5 rounded-md text-xs transition disabled:opacity-50 uppercase font-mono tracking-wider shadow-md mt-2"
            >
              {loading
                ? (language === 'en' ? 'PROCESSING AUTHENTICATION...' : 'MEMPROSES OTENTIKASI...')
                : mode === 'login'
                ? t('login_submit_btn')
                : mode === 'register'
                ? t('register_submit_btn')
                : t('forgot_submit_btn')}
            </button>
          </form>

          {/* Quick Demo Accounts Pill (Akses Cepat Pengujian) */}
          <div className="pt-3 border-t border-slate-700/80">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-2">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#f59e0b]" />
                {language === 'en' ? 'QUICK AUDIT ACCESS:' : 'AKSES CEPAT MODE AUDIT:'}
              </span>
              <span className="text-slate-500">{language === 'en' ? '1-Click Direct' : '1-Klik Langsung'}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px] font-mono font-bold">
              <button
                type="button"
                onClick={() => handleQuickDemo('student')}
                className="bg-[#1a222e] hover:bg-[#253245] border border-slate-700 py-1.5 px-2 rounded-sm text-slate-300 hover:text-[#f59e0b] transition text-center"
              >
                {getRoleLabel(ROLES.STUDENT)}
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo('lecturer')}
                className="bg-[#1a222e] hover:bg-[#253245] border border-slate-700 py-1.5 px-2 rounded-sm text-slate-300 hover:text-[#f59e0b] transition text-center"
              >
                {getRoleLabel(ROLES.LECTURER)}
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo('admin')}
                className="bg-[#1a222e] hover:bg-[#253245] border border-slate-700 py-1.5 px-2 rounded-sm text-slate-300 hover:text-[#f59e0b] transition text-center"
              >
                {getRoleLabel(ROLES.ADMIN)}
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer / Switch Modes */}
        <div className="p-3.5 bg-[#0e1219] border-t border-slate-800 text-center text-xs text-slate-400 font-sans">
          {mode === 'login' ? (
            <span>
              {language === 'en' ? "Don't have an account yet?" : 'Belum memiliki akun?'}{' '}
              <button
                onClick={() => {
                  setMode('register');
                  setFeedback(null);
                }}
                className="font-bold text-[#f59e0b] hover:underline ml-1"
              >
                {language === 'en' ? 'Register Now' : 'Daftar Sekarang'}
              </button>
            </span>
          ) : (
            <span>
              {language === 'en' ? 'Already have an account?' : 'Sudah memiliki akun?'}{' '}
              <button
                onClick={() => {
                  setMode('login');
                  setFeedback(null);
                }}
                className="font-bold text-[#f59e0b] hover:underline ml-1"
              >
                {language === 'en' ? 'Sign in here' : 'Masuk di Sini'}
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
