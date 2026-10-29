import { useState, useRef } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { ROLES, ROLE_LABELS, ROLE_BADGE_COLORS } from '../../constants/roles';
import {
  Shield,
  CheckCircle,
  AlertCircle,
  LogOut,
  Mail,
  User,
  GraduationCap,
  Building,
  Sparkles,
  ShieldCheck,
  KeyRound,
  IdCard,
  Camera,
  Upload,
  X,
  Check,
  Link,
  Globe,
  Languages,
  Edit3,
  Sun,
  Moon,
} from 'lucide-react';

// Preset avatar untuk pilihan cepat
const PRESET_AVATARS = [
  {
    id: 'student_m',
    name: 'Mahasiswa Smartsa',
    url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
  },
  {
    id: 'student_f',
    name: 'Mahasiswi Riset',
    url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
  },
  {
    id: 'lecturer_m',
    name: 'Dosen Informatika',
    url: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=300&q=80',
  },
  {
    id: 'lecturer_f',
    name: 'Dosen Sains',
    url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=300&q=80',
  },
];

// Helper kompresi gambar klien menjadi Data URL ringan (400x400 JPEG)
const compressImage = (file, maxWidth = 400, maxHeight = 400, quality = 0.85) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new window.Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export default function ProfileView({ onOpenAuth }) {
  const { userProfile, currentUser, role, logout, isDemoMode, updateUserPhoto, updateUserProfileData } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();

  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // State Modal Ubah Foto Profil
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // State Modal Ubah Data Akademik
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editNim, setEditNim] = useState('');
  const [editInstitution, setEditInstitution] = useState('');

  // Email akun aktif
  const activeEmail = userProfile?.email || currentUser?.email || 'mahasiswa@smartsa.edu';

  // Foto profil aktif
  const currentPhoto =
    userProfile?.photoURL ||
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80';
  
  // NIM / NIDN / NIP yang didaftarkan
  const activeNim =
    userProfile?.nim ||
    userProfile?.nidn ||
    userProfile?.nip ||
    (isDemoMode ? '25050974001' : t('not_set', 'Belum diisi'));

  // Nama Pengguna
  const activeDisplayName =
    userProfile?.displayName ||
    currentUser?.displayName ||
    (isDemoMode ? t('demo_student_name', 'Mahasiswa Demo') : t('default_user_name', 'Pengguna Smartsa'));

  // Institusi
  const activeInstitution =
    userProfile?.institution || 'Universitas Negeri Surabaya';

  // Label ID Akademik sesuai Role
  const getIdLabel = () => {
    if (role === ROLES.LECTURER) return t('id_lecturer');
    return t('id_student');
  };

  // Handler Ganti Bahasa
  const handleLanguageChange = (lang) => {
    if (lang === language) return;
    setLanguage(lang);
    setFeedback({
      type: 'success',
      text: lang === 'id' 
        ? 'Bahasa antarmuka berhasil diubah ke Bahasa Indonesia 🇮🇩' 
        : 'Interface language successfully changed to English 🇬🇧',
    });
  };

  // Handler Ganti Mode Gelap / Terang
  const handleThemeChange = (newTheme) => {
    if (newTheme === theme) return;
    setTheme(newTheme);
    setFeedback({
      type: 'success',
      text: `${t('theme_changed_toast')} ${newTheme === 'dark' ? t('theme_dark') : t('theme_light')}`,
    });
  };

  // Handler Buka Modal Foto
  const handleOpenPhotoModal = () => {
    setPreviewPhoto(currentPhoto);
    setUrlInput('');
    setIsPhotoModalOpen(true);
  };

  // Handler Unggah File Gambar Lokal
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert(language === 'id' ? 'File harus berupa gambar (JPG, PNG, WEBP).' : 'File must be an image (JPG, PNG, WEBP).');
      return;
    }

    try {
      setIsUploading(true);
      const compressedDataUrl = await compressImage(file);
      setPreviewPhoto(compressedDataUrl);
      setUrlInput('');
    } catch (err) {
      console.error('Gagal memproses gambar:', err);
      alert(language === 'id' ? 'Gagal memproses gambar.' : 'Failed to process image.');
    } finally {
      setIsUploading(false);
    }
  };

  // Handler Simpan Perubahan Foto Profil
  const handleSavePhoto = async () => {
    if (!previewPhoto) return;

    try {
      setIsUploading(true);
      if (updateUserPhoto) {
        await updateUserPhoto(previewPhoto);
      }
      setIsPhotoModalOpen(false);
      setFeedback({
        type: 'success',
        text: t('photo_saved_toast'),
      });
    } catch (err) {
      console.error('Gagal menyimpan foto profil:', err);
      setFeedback({
        type: 'error',
        text: language === 'id' ? 'Terjadi kendala saat memperbarui foto profil.' : 'Failed to update profile picture.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Handler Buka Modal Edit Profil Akademik
  const handleOpenEditModal = () => {
    setEditDisplayName(activeDisplayName);
    setEditNim(activeNim === t('not_set', 'Belum diisi') ? '' : activeNim);
    setEditInstitution(activeInstitution);
    setIsEditModalOpen(true);
  };

  // Handler Simpan Perubahan Profil Akademik
  const handleSaveEditProfile = async (e) => {
    e.preventDefault();
    try {
      setIsUploading(true);
      if (updateUserProfileData) {
        await updateUserProfileData({
          displayName: editDisplayName.trim() || activeDisplayName,
          nim: editNim.trim() || activeNim,
          institution: editInstitution.trim() || activeInstitution,
        });
      }
      setIsEditModalOpen(false);
      setFeedback({
        type: 'success',
        text: t('data_saved_toast', 'Data akademik berhasil diperbarui!'),
      });
    } catch (err) {
      console.error('Gagal memperbarui profil:', err);
      setFeedback({
        type: 'error',
        text: language === 'en' ? 'Failed to update academic profile.' : 'Gagal memperbarui data akademik.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendOtp = () => {
    setFeedback({
      type: 'success',
      text: `${t('otp_sent')} ${activeEmail}.`,
    });
  };

  return (
    <div className="space-y-5">
      {/* Tactical Header */}
      <div className="border-b border-[#222d3d] pb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono tracking-widest text-[#f59e0b] uppercase">
              <User className="w-3.5 h-3.5 text-[#f59e0b]" />
              <span>{t('profile_tag')}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight mt-0.5 font-sans">
              {t('profile_title')}
            </h1>
          </div>
          <span
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-sm border ${
              isDemoMode
                ? 'bg-amber-950/40 text-[#f59e0b] border-[#f59e0b]/40'
                : 'bg-emerald-950/40 text-emerald-400 border-emerald-500/40'
            }`}
          >
            {isDemoMode ? t('demo_mode') : t('verified_account')}
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1 font-sans">
          {t('profile_subtitle')}
        </p>
      </div>

      {/* Banner Rekomendasi Registrasi jika di Mode Demo */}
      {isDemoMode && onOpenAuth && (
        <div className="bg-[#121822] p-4 rounded-xl border border-[#f59e0b]/40 text-xs font-mono space-y-2 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#f59e0b]/5 rounded-bl-full pointer-events-none" />
          <div className="flex items-center gap-2 text-[#f59e0b] font-bold">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>{t('demo_banner_title')}</span>
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            {t('demo_banner_desc')}
          </p>
          <button
            onClick={onOpenAuth}
            className="w-full bg-[#f59e0b] hover:bg-[#d97706] text-black font-bold py-2 rounded-md text-xs transition uppercase tracking-wider shadow-sm"
          >
            {t('demo_banner_btn')}
          </button>
        </div>
      )}

      {/* Profile Card Header dengan Tombol Ganti Foto */}
      <div className="bg-[#121822] p-4 sm:p-5 rounded-xl border border-[#232f42] text-slate-100 relative">
        <div className="flex items-center gap-4">
          {/* Avatar Container dengan Hover & Tombol Kamera */}
          <div className="relative shrink-0 group">
            <img
              src={currentPhoto}
              alt=""
              className="w-16 h-16 rounded-xl object-cover ring-2 ring-[#f59e0b]/40 shadow-md group-hover:brightness-90 transition"
            />
            {/* Quick Camera Overlay Button */}
            <button
              type="button"
              onClick={handleOpenPhotoModal}
              title={t('change_photo')}
              className="absolute -bottom-1 -right-1 bg-[#f59e0b] hover:bg-[#d97706] text-black p-1.5 rounded-full shadow-lg border-2 border-[#121822] transition active:scale-95 flex items-center justify-center cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-100 truncate">
                {activeDisplayName}
              </h2>
            </div>
            <p className="text-xs text-slate-400 truncate mt-0.5 font-mono">
              {activeInstitution}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`inline-block text-[10px] font-mono font-bold px-2 py-0.5 rounded-sm border ${ROLE_BADGE_COLORS[role]}`}>
                {ROLE_LABELS[role]}
              </span>
              <button
                type="button"
                onClick={handleOpenPhotoModal}
                className="text-[10px] font-mono font-bold text-[#f59e0b] hover:text-[#fbbf24] flex items-center gap-1 transition underline-offset-2 hover:underline"
              >
                <Camera className="w-3 h-3" />
                <span>{t('change_photo')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
              : 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Account Info Details: DATA AKADEMIK */}
      <div className="bg-[#121822] p-4 sm:p-5 rounded-xl border border-[#232f42] text-slate-100 space-y-4">
        <div className="flex items-center justify-between border-b border-[#1f2937] pb-2.5">
          <h3 className="text-xs font-mono font-bold text-[#f59e0b] uppercase tracking-wider flex items-center gap-1.5">
            <IdCard className="w-4 h-4 text-[#f59e0b]" />
            {t('academic_data_title')}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenEditModal}
              className="text-[10px] font-mono font-bold text-[#f59e0b] hover:text-[#fbbf24] bg-[#f59e0b]/10 hover:bg-[#f59e0b]/20 px-2 py-0.5 rounded border border-[#f59e0b]/30 flex items-center gap-1 transition cursor-pointer"
            >
              <Edit3 className="w-3 h-3" />
              <span>{t('edit_academic_data', 'Ubah Data')}</span>
            </button>
            <span className="text-[10px] font-mono text-slate-400 bg-[#1c2432] px-2 py-0.5 rounded border border-[#2a364a]">
              {t('synced')}
            </span>
          </div>
        </div>

        <div className="space-y-3 text-xs">
          {/* Nama Lengkap */}
          <div className="flex items-center justify-between py-2 border-b border-[#1a2332]">
            <span className="text-slate-400 flex items-center gap-2">
              <User className="w-4 h-4 text-slate-500" /> {t('full_name')}
            </span>
            <span className="font-semibold text-slate-100 font-sans">{activeDisplayName}</span>
          </div>

          {/* Email Akun */}
          <div className="flex items-center justify-between py-2 border-b border-[#1a2332]">
            <span className="text-slate-400 flex items-center gap-2">
              <Mail className="w-4 h-4 text-slate-500" /> {t('account_email')}
            </span>
            <span className="font-mono font-bold text-[#f59e0b] truncate max-w-[200px] text-right">
              {activeEmail}
            </span>
          </div>

          {/* NIM / Nomor Induk Mahasiswa */}
          <div className="flex items-center justify-between py-2 border-b border-[#1a2332]">
            <span className="text-slate-400 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-slate-500" /> {getIdLabel()}
            </span>
            <span className="font-mono font-bold text-slate-100 tracking-wider">
              {activeNim}
            </span>
          </div>

          {/* Institusi */}
          <div className="flex items-center justify-between py-2 border-b border-[#1a2332]">
            <span className="text-slate-400 flex items-center gap-2">
              <Building className="w-4 h-4 text-slate-500" /> {t('campus_institution')}
            </span>
            <span className="font-semibold text-slate-200 text-right">{activeInstitution}</span>
          </div>

          {/* Status Verifikasi */}
          <div className="flex items-center justify-between py-2">
            <span className="text-slate-400 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" /> {t('verification_status')}
            </span>
            <span className="font-mono font-semibold text-emerald-400 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              {userProfile?.emailVerified || currentUser?.emailVerified
                ? t('verified')
                : t('active_unverified')}
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================== */}
      {/* FITUR GANTI BAHASA (INDONESIA & ENGLISH)                   */}
      {/* ========================================================== */}
      <div className="bg-[#121822] p-4 sm:p-5 rounded-xl border border-[#232f42] text-slate-100 space-y-4">
        <div className="flex items-center justify-between border-b border-[#1f2937] pb-2.5">
          <h3 className="text-xs font-mono font-bold text-[#f59e0b] uppercase tracking-wider flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-[#f59e0b]" />
            {t('language_settings_title')}
          </h3>
          <span className="text-[10px] font-mono text-[#00e5ff] bg-[#00e5ff]/10 px-2 py-0.5 rounded border border-[#00e5ff]/30">
            {language.toUpperCase()}
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <span className="text-xs font-bold text-slate-200 block font-mono">
              {t('interface_language')}
            </span>
            <span className="text-[11px] text-slate-400">
              {t('interface_language_desc')}
            </span>
          </div>

          {/* Tombol Pemilih 2 Bahasa */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            {/* 1. Bahasa Indonesia */}
            <button
              type="button"
              onClick={() => handleLanguageChange('id')}
              className={`p-3 rounded-xl border text-left transition flex items-center justify-between relative cursor-pointer ${
                language === 'id'
                  ? 'bg-[#1e2a3c] border-[#f59e0b] ring-1 ring-[#f59e0b]/50 shadow-md'
                  : 'bg-[#151d29] border-[#222e40] hover:border-slate-500 hover:bg-[#1a2433]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xl shrink-0 select-none">🇮🇩</span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-100 font-sans truncate">
                    Indonesia
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    Bahasa Nasional
                  </div>
                </div>
              </div>
              {language === 'id' && (
                <div className="bg-[#f59e0b] text-black p-1 rounded-full shrink-0 shadow-xs">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              )}
            </button>

            {/* 2. English */}
            <button
              type="button"
              onClick={() => handleLanguageChange('en')}
              className={`p-3 rounded-xl border text-left transition flex items-center justify-between relative cursor-pointer ${
                language === 'en'
                  ? 'bg-[#1e2a3c] border-[#f59e0b] ring-1 ring-[#f59e0b]/50 shadow-md'
                  : 'bg-[#151d29] border-[#222e40] hover:border-slate-500 hover:bg-[#1a2433]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xl shrink-0 select-none">🇬🇧</span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-100 font-sans truncate">
                    English
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    International (US)
                  </div>
                </div>
              </div>
              {language === 'en' && (
                <div className="bg-[#f59e0b] text-black p-1 rounded-full shrink-0 shadow-xs">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================== */}
      {/* FITUR TEMA TAMPILAN (MODE GELAP & TERANG - 1 KLIK)        */}
      {/* ========================================================== */}
      <div 
        onClick={() => handleThemeChange(theme === 'dark' ? 'light' : 'dark')}
        className="bg-[#121822] p-4 rounded-xl border border-[#232f42] text-slate-100 flex items-center justify-between gap-3 cursor-pointer hover:border-[#f59e0b]/50 transition shadow-sm select-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#18212e] border border-[#283548] flex items-center justify-center shrink-0">
            {theme === 'dark' ? (
              <Moon className="w-4 h-4 text-[#f59e0b]" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-100 font-mono">
                {t('theme_settings_title', 'MODE TAMPILAN')}
              </span>
              <span className="text-[10px] font-mono font-bold text-[#00e5ff] bg-[#00e5ff]/10 px-2 py-0.2 rounded border border-[#00e5ff]/30 uppercase">
                {theme === 'dark' ? t('theme_dark') : t('theme_light')}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-sans block mt-0.5">
              {language === 'en'
                ? (theme === 'dark' ? 'Dark Mode active (Click to switch to Light)' : 'Light Mode active (Click to switch to Dark)')
                : (theme === 'dark' ? 'Mode Gelap aktif (Klik untuk beralih ke Terang)' : 'Mode Terang aktif (Klik untuk beralih ke Gelap)')}
            </span>
          </div>
        </div>

        {/* Sakelar Toggle 1-Klik */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleThemeChange(theme === 'dark' ? 'light' : 'dark');
          }}
          className={`relative inline-flex h-8 w-15 items-center rounded-full transition-colors duration-300 p-1 shrink-0 cursor-pointer ${
            theme === 'light' ? 'bg-[#f59e0b]' : 'bg-[#1b2535] border border-slate-700'
          }`}
          title={theme === 'dark' ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
        >
          <span
            className={`inline-flex h-6 w-6 transform items-center justify-center rounded-full transition-all duration-300 shadow-md ${
              theme === 'light'
                ? 'translate-x-7 bg-white text-amber-500'
                : 'translate-x-0 bg-[#0b101a] text-[#f59e0b]'
            }`}
          >
            {theme === 'light' ? (
              <Sun className="w-3.5 h-3.5 stroke-[2.5]" />
            ) : (
              <Moon className="w-3.5 h-3.5 stroke-[2.5]" />
            )}
          </span>
        </button>
      </div>

      {/* Keamanan & MFA */}
      <div className="bg-[#121822] p-4 sm:p-5 rounded-xl border border-[#232f42] text-slate-100 space-y-4">
        <h3 className="text-xs font-mono font-bold text-[#f59e0b] uppercase tracking-wider flex items-center gap-1.5">
          <KeyRound className="w-4 h-4 text-[#f59e0b]" />
          {t('security_title')}
        </h3>

        <div className="p-3.5 bg-[#17202d] rounded-lg border border-[#232f42] space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-xs font-bold text-slate-200 block font-mono">
                {t('mfa_title')}
              </span>
              <span className="text-[11px] text-slate-400">
                {t('mfa_desc')}
              </span>
            </div>
            <button
              onClick={() => setMfaEnabled(!mfaEnabled)}
              className={`text-xs px-3 py-1 rounded font-mono font-bold transition ${
                mfaEnabled
                  ? 'bg-emerald-500 text-black shadow-xs'
                  : 'bg-[#232f42] text-slate-400 hover:text-white'
              }`}
            >
              {mfaEnabled ? t('mfa_active') : t('mfa_inactive')}
            </button>
          </div>

          {mfaEnabled && (
            <div className="pt-2 border-t border-[#232f42] flex items-center justify-between">
              <span className="text-[11px] text-slate-400 font-mono">{t('otp_test')}</span>
              <button
                onClick={handleSendOtp}
                className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-[11px] font-mono font-bold px-3 py-1 rounded transition"
              >
                {t('send_otp_btn')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tombol Aksi Keluar / Masuk Akun */}
      <div className="pt-2 space-y-2">
        {onOpenAuth && (
          <button
            type="button"
            onClick={onOpenAuth}
            className="w-full bg-[#1c2432] hover:bg-[#253245] text-[#f59e0b] border border-[#f59e0b]/40 text-xs font-mono font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 shadow-xs"
          >
            <User className="w-4 h-4" />
            {isDemoMode ? t('demo_banner_btn') : (language === 'en' ? 'SWITCH / LOG IN ANOTHER ACCOUNT' : 'GANTI / MASUK AKUN LAIN')}
          </button>
        )}
        <button
          type="button"
          onClick={logout}
          className="w-full bg-[#1e131d] hover:bg-rose-950/60 text-rose-300 border border-rose-500/40 text-xs font-mono font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 shadow-xs"
        >
          <LogOut className="w-4 h-4" />
          {t('logout_btn')}
        </button>
      </div>

      {/* ========================================================== */}
      {/* MODAL UBAH FOTO PROFIL (AVATAR MANAGER)                    */}
      {/* ========================================================== */}
      {isPhotoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#121822] border border-[#232f42] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[#232f42] flex items-center justify-between bg-[#161d2a]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-[#f59e0b]/10 text-[#f59e0b] rounded-md border border-[#f59e0b]/30">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 font-sans">
                    {t('photo_modal_title')}
                  </h3>
                  <span className="text-[10px] font-mono text-[#f59e0b] tracking-wider uppercase block">
                    {t('photo_modal_tag')}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPhotoModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-[#232f42] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5">
              {/* Preview Foto Terpilih */}
              <div className="text-center space-y-2 py-2">
                <div className="relative inline-block">
                  <img
                    src={previewPhoto || currentPhoto}
                    alt="Preview"
                    className="w-24 h-24 rounded-2xl object-cover ring-4 ring-[#f59e0b]/50 shadow-xl mx-auto bg-[#0b0f17]"
                  />
                  <div className="absolute -bottom-1 -right-1 bg-[#f59e0b] text-black text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md shadow-xs border border-black/40">
                    {t('preview_tag')}
                  </div>
                </div>
                <p className="text-[11px] font-mono text-slate-400">
                  {t('preview_sub')}
                </p>
              </div>

              {/* Opsi 1: Upload File dari Perangkat */}
              <div className="space-y-2">
                <label className="block text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider">
                  {t('opt1_title')}
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full bg-[#18212e] hover:bg-[#202c3d] border border-[#2b3a4f] hover:border-[#f59e0b]/50 text-slate-200 py-3 px-4 rounded-xl text-xs font-mono font-bold transition flex items-center justify-center gap-2 shadow-xs group"
                >
                  <Upload className="w-4 h-4 text-[#f59e0b] group-hover:-translate-y-0.5 transition-transform" />
                  <span>{t('opt1_btn')}</span>
                </button>
                <span className="text-[10px] text-slate-500 font-mono block text-center">
                  {t('opt1_hint')}
                </span>
              </div>

              {/* Opsi 2: Preset Avatar Karakter Smartsa */}
              <div className="space-y-2">
                <label className="block text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider">
                  {t('opt2_title')}
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {PRESET_AVATARS.map((avatar) => {
                    const isSelected = previewPhoto === avatar.url;
                    return (
                      <button
                        key={avatar.id}
                        type="button"
                        onClick={() => {
                          setPreviewPhoto(avatar.url);
                          setUrlInput('');
                        }}
                        className={`relative p-2 rounded-xl border text-left transition flex flex-col items-center gap-1.5 ${
                          isSelected
                            ? 'bg-[#1e2a3c] border-[#f59e0b] ring-1 ring-[#f59e0b]'
                            : 'bg-[#151d29] border-[#222e40] hover:border-slate-500 hover:bg-[#1a2433]'
                        }`}
                      >
                        <div className="relative">
                          <img
                            src={avatar.url}
                            alt={avatar.name}
                            className="w-12 h-12 rounded-lg object-cover"
                          />
                          {isSelected && (
                            <div className="absolute -top-1 -right-1 bg-[#f59e0b] text-black p-0.5 rounded-full shadow-xs">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          )}
                        </div>
                        <span className="text-[9px] font-mono font-semibold text-slate-300 text-center leading-tight line-clamp-1">
                          {avatar.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Opsi 3: Masukkan Tautan URL Foto */}
              <div className="space-y-2">
                <label className="block text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider">
                  {t('opt3_title')}
                </label>
                <div className="relative">
                  <Link className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    placeholder="https://images.unsplash.com/..."
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value);
                      if (e.target.value.trim().startsWith('http')) {
                        setPreviewPhoto(e.target.value.trim());
                      }
                    }}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-[#0b0f17] border border-slate-700 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#f59e0b] font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 border-t border-[#232f42] bg-[#161d2a] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsPhotoModalOpen(false)}
                className="px-4 py-2 text-xs font-mono font-bold text-slate-400 hover:text-white rounded-lg transition"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleSavePhoto}
                disabled={isUploading || !previewPhoto}
                className="px-5 py-2 bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-mono font-bold rounded-lg transition flex items-center gap-1.5 shadow-md disabled:opacity-50"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>{isUploading ? t('saving_photo') : t('save_photo')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================== */}
      {/* MODAL UBAH DATA PROFIL AKADEMIK (NAMA, NIM, INSTITUSI)     */}
      {/* ========================================================== */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#121822] border border-[#232f42] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[#232f42] flex items-center justify-between bg-[#161d2a]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-[#f59e0b]/10 text-[#f59e0b] rounded-md border border-[#f59e0b]/30">
                  <IdCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 font-sans">
                    {t('edit_profile_title', 'Ubah Data Profil Akademik')}
                  </h3>
                  <span className="text-[10px] font-mono text-[#f59e0b] tracking-wider uppercase block">
                    {activeEmail}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-[#232f42] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveEditProfile}>
              <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
                <p className="text-xs text-slate-400 font-sans leading-relaxed">
                  {t('edit_profile_desc', 'Perbarui nama lengkap, NIM, atau asal institusi Anda.')}
                </p>

                {/* Field: Nama Lengkap */}
                <div>
                  <label className="block text-[11px] font-mono font-bold text-slate-300 mb-1">
                    {t('full_name')}
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Ralfky Ardan"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-[#0b0f17] border border-slate-700 rounded-md text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
                    />
                  </div>
                </div>

                {/* Field: NIM / ID Akademik */}
                <div>
                  <label className="block text-[11px] font-mono font-bold text-slate-300 mb-1">
                    {getIdLabel()}
                  </label>
                  <div className="relative">
                    <GraduationCap className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="Contoh: 25050974168"
                      value={editNim}
                      onChange={(e) => setEditNim(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-[#0b0f17] border border-slate-700 rounded-md text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#f59e0b] font-mono font-bold text-[#f59e0b]"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono mt-1 block">
                    NIM resmi akun: 25050974168
                  </span>
                </div>

                {/* Field: Institusi Kampus */}
                <div>
                  <label className="block text-[11px] font-mono font-bold text-slate-300 mb-1">
                    {t('campus_institution')}
                  </label>
                  <div className="relative">
                    <Building className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Universitas Negeri Surabaya"
                      value={editInstitution}
                      onChange={(e) => setEditInstitution(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-[#0b0f17] border border-slate-700 rounded-md text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-5 py-3.5 border-t border-[#232f42] bg-[#161d2a] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-mono font-bold text-slate-400 hover:text-white rounded-lg transition"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-5 py-2 bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-mono font-bold rounded-lg transition flex items-center gap-1.5 shadow-md disabled:opacity-50"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>{isUploading ? (language === 'en' ? 'SAVING...' : 'MENYIMPAN...') : t('save_changes', 'SIMPAN PERUBAHAN')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
