import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { useTheme } from '../../context/useTheme';
import { ROLES, ROLE_BADGE_COLORS } from '../../constants/roles';
import { uploadMediaFile, isValidExternalUrl } from '../../services/cloudinaryService';
import SafeImage from '../common/SafeImage';
import {
  Shield,
  CheckCircle,
  AlertCircle,
  LogOut,
  Mail,
  User,
  GraduationCap,
  Building,
  KeyRound,
  IdCard,
  Camera,
  Upload,
  X,
  Check,
  Link,
  Globe,
  Edit3,
  Sun,
  Moon,
} from 'lucide-react';

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

export default function ProfileView({ onOpenAuth }) {
  const {
    userProfile,
    currentUser,
    role,
    logout,
    updateUserPhoto,
    updateUserProfileData,
  } = useAuth();
  const { language, setLanguage, t, getRoleLabel } = useLanguage();
  const { theme, setTheme } = useTheme();

  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // State Modal Ubah Foto Profil
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [photoUploadNote, setPhotoUploadNote] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // State Modal Ubah Data Akademik
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editInstitution, setEditInstitution] = useState('');

  useEffect(() => {
    if (!isPhotoModalOpen && !isEditModalOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsPhotoModalOpen(false);
        setIsEditModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPhotoModalOpen, isEditModalOpen]);

  if (!currentUser) {
    return (
      <div className="bg-white dark:bg-[#121822] p-8 rounded-2xl border border-slate-200 dark:border-[#232f42] text-center space-y-3 shadow-xs">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          {language === 'en' ? 'Sign In to View Profile' : 'Masuk untuk Melihat Profil'}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {language === 'en'
            ? 'No active user session was found.'
            : 'Belum ada sesi akun aktif yang terautentikasi.'}
        </p>
        {onOpenAuth && (
          <button
            type="button"
            onClick={onOpenAuth}
            className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded-lg transition"
          >
            {t('public_login_btn')}
          </button>
        )}
      </div>
    );
  }

  const activeEmail =
    userProfile?.email ||
    currentUser.email ||
    t('not_set', 'Belum diisi');

  const currentPhoto =
    userProfile?.photoURL ||
    currentUser.photoURL ||
    null;

  const activeNim =
    role === ROLES.LECTURER
      ? userProfile?.nidn || userProfile?.nim || t('not_set', 'Belum diisi')
      : role === ROLES.ADMIN
        ? userProfile?.nip || userProfile?.nim || t('not_set', 'Belum diisi')
        : userProfile?.nim || t('not_set', 'Belum diisi');

  const activeDisplayName =
    userProfile?.displayName ||
    currentUser.displayName ||
    currentUser.email ||
    '';

  const activeInstitution =
    userProfile?.institution || 'Universitas Negeri Surabaya';

  const getIdLabel = () => {
    if (role === ROLES.LECTURER) return t('id_lecturer');
    if (role === ROLES.ADMIN) return t('id_admin');
    return t('id_student');
  };

  const handleLanguageChange = (lang) => {
    if (lang === language) return;
    setLanguage(lang);
    setFeedback({
      type: 'success',
      text:
        lang === 'id'
          ? 'Bahasa antarmuka berhasil diubah ke Bahasa Indonesia 🇮🇩'
          : 'Interface language successfully changed to English 🇬🇧',
    });
  };

  const handleThemeChange = (newTheme) => {
    if (newTheme === theme) return;
    setTheme(newTheme);
    setFeedback({
      type: 'success',
      text: `${t('theme_changed_toast')} ${newTheme === 'dark' ? t('theme_dark') : t('theme_light')}`,
    });
  };

  const handleOpenPhotoModal = () => {
    setPreviewPhoto(currentPhoto);
    setUrlInput('');
    setPhotoUploadNote('');
    setIsPhotoModalOpen(true);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoUploadNote(
        language === 'id' ? 'File harus berupa gambar (JPG, PNG, WEBP, GIF).' : 'File must be an image (JPG, PNG, WEBP, GIF).'
      );
      return;
    }

    try {
      setIsUploading(true);
      setPhotoUploadNote('');
      const uploadResult = await uploadMediaFile(file, 'image');
      setPreviewPhoto(uploadResult.url);
      setUrlInput('');
      setPhotoUploadNote(uploadResult.note || '');
    } catch (err) {
      console.error('Gagal memproses gambar:', err);
      setPhotoUploadNote(
        err.message || (language === 'id' ? 'Gagal memproses gambar.' : 'Failed to process image.')
      );
    } finally {
      setIsUploading(false);
    }
  };

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

  const handleOpenEditModal = () => {
    setEditDisplayName(activeDisplayName);
    setEditInstitution(activeInstitution);
    setIsEditModalOpen(true);
  };

  const handleSaveEditProfile = async (e) => {
    e.preventDefault();
    try {
      setIsUploading(true);
      if (updateUserProfileData) {
        await updateUserProfileData({
          displayName: editDisplayName.trim() || activeDisplayName,
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
      <div className="border-b border-slate-200 dark:border-[#222d3d] pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono tracking-widest text-amber-600 dark:text-[#f59e0b] uppercase">
              <User className="w-3.5 h-3.5" />
              <span>{t('profile_tag')}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight mt-0.5 font-sans">
              {t('profile_title')}
            </h1>
          </div>
          <span
            className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-sm border bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/40"
          >
            {t('verified_account')}
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-sans">
          {t('profile_subtitle')}
        </p>
      </div>

      {/* Profile Card Header dengan Tombol Ganti Foto */}
      <div className="bg-white dark:bg-[#121822] p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-[#232f42] text-slate-900 dark:text-slate-100 relative shadow-xs">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0 group">
            <SafeImage
              src={currentPhoto}
              alt={activeDisplayName}
              fallbackLabel={activeDisplayName}
              variant="avatar"
              className="w-16 h-16 rounded-xl object-cover ring-2 ring-amber-400/60 dark:ring-[#f59e0b]/40 shadow-md group-hover:brightness-90 transition"
            />
            <button
              type="button"
              onClick={handleOpenPhotoModal}
              title={t('change_photo')}
              aria-label={t('change_photo')}
              className="absolute -bottom-1 -right-1 bg-[#f59e0b] hover:bg-[#d97706] text-black p-1.5 rounded-full shadow-lg border-2 border-white dark:border-[#121822] transition active:scale-95 flex items-center justify-center cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                {activeDisplayName}
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 font-mono">
              {activeInstitution}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span
                className={`inline-block text-[10px] font-mono font-bold px-2 py-0.5 rounded-sm border ${
                  ROLE_BADGE_COLORS[role] || ''
                }`}
              >
                {getRoleLabel(role)}
              </span>
              <button
                type="button"
                onClick={handleOpenPhotoModal}
                className="text-[10px] font-mono font-bold text-amber-600 dark:text-[#f59e0b] hover:underline flex items-center gap-1 transition"
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
          className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2.5 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
              : 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-500/40'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Account Info Details: DATA AKADEMIK */}
      <div className="bg-white dark:bg-[#121822] p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-[#232f42] text-slate-900 dark:text-slate-100 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#1f2937] pb-2.5 gap-2">
          <h3 className="text-xs font-mono font-bold text-amber-600 dark:text-[#f59e0b] uppercase tracking-wider flex items-center gap-1.5">
            <IdCard className="w-4 h-4" />
            {t('academic_data_title')}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenEditModal}
              className="text-[10px] font-mono font-bold text-amber-700 dark:text-[#f59e0b] bg-amber-50 dark:bg-[#f59e0b]/10 hover:bg-amber-100 dark:hover:bg-[#f59e0b]/20 px-2 py-0.5 rounded border border-amber-200 dark:border-[#f59e0b]/30 flex items-center gap-1 transition cursor-pointer"
            >
              <Edit3 className="w-3 h-3" />
              <span>{t('edit_academic_data', 'Ubah Data')}</span>
            </button>
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#1c2432] px-2 py-0.5 rounded border border-slate-200 dark:border-[#2a364a]">
              {t('synced')}
            </span>
          </div>
        </div>

        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-[#1a2332] gap-3">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400 dark:text-slate-500" /> {t('full_name')}
            </span>
            <span className="font-semibold text-slate-900 dark:text-slate-100 font-sans text-right">{activeDisplayName}</span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-[#1a2332] gap-3">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Mail className="w-4 h-4 text-slate-400 dark:text-slate-500" /> {t('account_email')}
            </span>
            <span className="font-mono font-bold text-amber-600 dark:text-[#f59e0b] truncate max-w-[200px] text-right">
              {activeEmail}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-[#1a2332] gap-3">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-slate-400 dark:text-slate-500" /> {getIdLabel()}
            </span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100 tracking-wider">
              {activeNim}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-[#1a2332] gap-3">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Building className="w-4 h-4 text-slate-400 dark:text-slate-500" /> {t('campus_institution')}
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 text-right">{activeInstitution}</span>
          </div>

          <div className="flex items-center justify-between py-2 gap-3">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-500 dark:text-emerald-400" /> {t('verification_status')}
            </span>
            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              {userProfile?.emailVerified || currentUser?.emailVerified
                ? t('verified')
                : t('active_unverified')}
            </span>
          </div>
        </div>
      </div>

      {/* FITUR GANTI BAHASA */}
      <div className="bg-white dark:bg-[#121822] p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-[#232f42] text-slate-900 dark:text-slate-100 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#1f2937] pb-2.5">
          <h3 className="text-xs font-mono font-bold text-amber-600 dark:text-[#f59e0b] uppercase tracking-wider flex items-center gap-1.5">
            <Globe className="w-4 h-4" />
            {t('language_settings_title')}
          </h3>
          <span className="text-[10px] font-mono text-sky-700 dark:text-[#00e5ff] bg-sky-50 dark:bg-[#00e5ff]/10 px-2 py-0.5 rounded border border-sky-200 dark:border-[#00e5ff]/30">
            {language.toUpperCase()}
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block font-mono">
              {t('interface_language')}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('interface_language_desc')}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => handleLanguageChange('id')}
              className={`p-3 rounded-xl border text-left transition flex items-center justify-between relative cursor-pointer ${
                language === 'id'
                  ? 'bg-amber-50 dark:bg-[#1e2a3c] border-amber-500 dark:border-[#f59e0b] ring-1 ring-amber-400/50 dark:ring-[#f59e0b]/50 shadow-sm'
                  : 'bg-slate-50 dark:bg-[#151d29] border-slate-200 dark:border-[#222e40] hover:border-slate-400 dark:hover:border-slate-500'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xl shrink-0 select-none">🇮🇩</span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 font-sans truncate">
                    Indonesia
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
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

            <button
              type="button"
              onClick={() => handleLanguageChange('en')}
              className={`p-3 rounded-xl border text-left transition flex items-center justify-between relative cursor-pointer ${
                language === 'en'
                  ? 'bg-amber-50 dark:bg-[#1e2a3c] border-amber-500 dark:border-[#f59e0b] ring-1 ring-amber-400/50 dark:ring-[#f59e0b]/50 shadow-sm'
                  : 'bg-slate-50 dark:bg-[#151d29] border-slate-200 dark:border-[#222e40] hover:border-slate-400 dark:hover:border-slate-500'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xl shrink-0 select-none">🇬🇧</span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 font-sans truncate">
                    English
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
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

      {/* FITUR TEMA TAMPILAN */}
      <div
        onClick={() => handleThemeChange(theme === 'dark' ? 'light' : 'dark')}
        className="bg-white dark:bg-[#121822] p-4 rounded-xl border border-slate-200 dark:border-[#232f42] text-slate-900 dark:text-slate-100 flex items-center justify-between gap-3 cursor-pointer hover:border-amber-400 dark:hover:border-[#f59e0b]/50 transition shadow-xs select-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-[#18212e] border border-slate-200 dark:border-[#283548] flex items-center justify-center shrink-0">
            {theme === 'dark' ? (
              <Moon className="w-4 h-4 text-[#f59e0b]" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 font-mono">
                {t('theme_settings_title', 'MODE TAMPILAN')}
              </span>
              <span className="text-[10px] font-mono font-bold text-sky-700 dark:text-[#00e5ff] bg-sky-50 dark:bg-[#00e5ff]/10 px-2 py-0.5 rounded border border-sky-200 dark:border-[#00e5ff]/30 uppercase">
                {theme === 'dark' ? t('theme_dark') : t('theme_light')}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-sans block mt-0.5">
              {language === 'en'
                ? theme === 'dark'
                  ? 'Dark Mode active (Click to switch to Light)'
                  : 'Light Mode active (Click to switch to Dark)'
                : theme === 'dark'
                ? 'Mode Gelap aktif (Klik untuk beralih ke Terang)'
                : 'Mode Terang aktif (Klik untuk beralih ke Gelap)'}
            </span>
          </div>
        </div>

        <button
          type="button"
          aria-label={theme === 'dark' ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
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
      <div className="bg-white dark:bg-[#121822] p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-[#232f42] text-slate-900 dark:text-slate-100 space-y-4 shadow-xs">
        <h3 className="text-xs font-mono font-bold text-amber-600 dark:text-[#f59e0b] uppercase tracking-wider flex items-center gap-1.5">
          <KeyRound className="w-4 h-4" />
          {t('security_title')}
        </h3>

        <div className="p-3.5 bg-slate-50 dark:bg-[#17202d] rounded-lg border border-slate-200 dark:border-[#232f42] space-y-3">
          <div className="flex justify-between items-center gap-3">
            <div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block font-mono">
                {t('mfa_title')}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('mfa_desc')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMfaEnabled(!mfaEnabled)}
              className={`text-xs px-3 py-1 rounded font-mono font-bold transition ${
                mfaEnabled
                  ? 'bg-emerald-500 text-black shadow-xs'
                  : 'bg-slate-200 dark:bg-[#232f42] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {mfaEnabled ? t('mfa_active') : t('mfa_inactive')}
            </button>
          </div>

          {mfaEnabled && (
            <div className="pt-2 border-t border-slate-200 dark:border-[#232f42] flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{t('otp_test')}</span>
              <button
                type="button"
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
            className="w-full bg-slate-100 dark:bg-[#1c2432] hover:bg-slate-200 dark:hover:bg-[#253245] text-amber-700 dark:text-[#f59e0b] border border-amber-300 dark:border-[#f59e0b]/40 text-xs font-mono font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 shadow-xs"
          >
            <User className="w-4 h-4" />
            {language === 'en'
              ? 'SWITCH / LOG IN ANOTHER ACCOUNT'
              : 'GANTI / MASUK AKUN LAIN'}
          </button>
        )}
        <button
          type="button"
          onClick={logout}
          className="w-full bg-rose-50 dark:bg-[#1e131d] hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 text-xs font-mono font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 shadow-xs"
        >
          <LogOut className="w-4 h-4" />
          {t('logout_btn')}
        </button>
      </div>

      {/* MODAL UBAH FOTO PROFIL */}
      {isPhotoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="photo-modal-title"
            className="w-full max-w-md bg-white dark:bg-[#121822] border border-slate-200 dark:border-[#232f42] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-[#232f42] flex items-center justify-between bg-slate-50 dark:bg-[#161d2a]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-100 dark:bg-[#f59e0b]/10 text-amber-600 dark:text-[#f59e0b] rounded-md border border-amber-200 dark:border-[#f59e0b]/30">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="photo-modal-title" className="text-sm font-bold text-slate-900 dark:text-slate-100 font-sans">
                    {t('photo_modal_title')}
                  </h3>
                  <span className="text-[10px] font-mono text-amber-600 dark:text-[#f59e0b] tracking-wider uppercase block">
                    {t('photo_modal_tag')}
                  </span>
                </div>
              </div>
              <button
                type="button"
                aria-label={t('cancel')}
                onClick={() => setIsPhotoModalOpen(false)}
                className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-md hover:bg-slate-200 dark:hover:bg-[#232f42] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              <div className="text-center space-y-2 py-2">
                <div className="relative inline-block">
                  <SafeImage
                    src={previewPhoto || currentPhoto}
                    alt="Preview"
                    fallbackLabel={activeDisplayName}
                    variant="avatar"
                    className="w-24 h-24 rounded-2xl object-cover ring-4 ring-[#f59e0b]/50 shadow-xl mx-auto bg-slate-100 dark:bg-[#0b0f17]"
                  />
                  <div className="absolute -bottom-1 -right-1 bg-[#f59e0b] text-black text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md shadow-xs border border-black/40">
                    {t('preview_tag')}
                  </div>
                </div>
                <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {t('preview_sub')}
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
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
                  className="w-full bg-slate-50 dark:bg-[#18212e] hover:bg-slate-100 dark:hover:bg-[#202c3d] border border-slate-300 dark:border-[#2b3a4f] hover:border-[#f59e0b]/50 text-slate-800 dark:text-slate-200 py-3 px-4 rounded-xl text-xs font-mono font-bold transition flex items-center justify-center gap-2 shadow-xs group"
                >
                  <Upload className="w-4 h-4 text-[#f59e0b] group-hover:-translate-y-0.5 transition-transform" />
                  <span>{t('opt1_btn')}</span>
                </button>
                <span className="text-[10px] text-slate-500 font-mono block text-center">
                  {t('opt1_hint')}
                </span>
                {photoUploadNote && (
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-[#0b0f17] border border-amber-200 dark:border-[#232f42] text-[10px] font-mono text-amber-700 dark:text-amber-300 text-center">
                    {photoUploadNote}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  {t('opt2_title')}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
                            ? 'bg-amber-50 dark:bg-[#1e2a3c] border-amber-500 dark:border-[#f59e0b] ring-1 ring-amber-400 dark:ring-[#f59e0b]'
                            : 'bg-slate-50 dark:bg-[#151d29] border-slate-200 dark:border-[#222e40] hover:border-slate-400 dark:hover:border-slate-500'
                        }`}
                      >
                        <div className="relative">
                          <SafeImage
                            src={avatar.url}
                            alt={avatar.name}
                            fallbackLabel={avatar.name}
                            variant="avatar"
                            className="w-12 h-12 rounded-lg object-cover"
                          />
                          {isSelected && (
                            <div className="absolute -top-1 -right-1 bg-[#f59e0b] text-black p-0.5 rounded-full shadow-xs">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          )}
                        </div>
                        <span className="text-[9px] font-mono font-semibold text-slate-700 dark:text-slate-300 text-center leading-tight line-clamp-1">
                          {avatar.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  {t('opt3_title')}
                </label>
                <div className="relative">
                  <Link className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    placeholder="https://images.unsplash.com/..."
                    value={urlInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setUrlInput(val);
                      if (isValidExternalUrl(val.trim())) {
                        setPreviewPhoto(val.trim());
                      }
                    }}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-[#f59e0b] font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-[#232f42] bg-slate-50 dark:bg-[#161d2a] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsPhotoModalOpen(false)}
                className="px-4 py-2 text-xs font-mono font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg transition"
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

      {/* MODAL UBAH DATA PROFIL AKADEMIK */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-profile-modal-title"
            className="w-full max-w-md bg-white dark:bg-[#121822] border border-slate-200 dark:border-[#232f42] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-[#232f42] flex items-center justify-between bg-slate-50 dark:bg-[#161d2a]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-100 dark:bg-[#f59e0b]/10 text-amber-600 dark:text-[#f59e0b] rounded-md border border-amber-200 dark:border-[#f59e0b]/30">
                  <IdCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="edit-profile-modal-title" className="text-sm font-bold text-slate-900 dark:text-slate-100 font-sans">
                    {t('edit_profile_title', 'Ubah Data Profil Akademik')}
                  </h3>
                  <span className="text-[10px] font-mono text-amber-600 dark:text-[#f59e0b] tracking-wider uppercase block">
                    {activeEmail}
                  </span>
                </div>
              </div>
              <button
                type="button"
                aria-label={t('cancel')}
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-md hover:bg-slate-200 dark:hover:bg-[#232f42] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditProfile}>
              <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-sans leading-relaxed">
                  {t('edit_profile_desc', 'Perbarui nama lengkap atau asal institusi Anda.')}
                </p>

                <div>
                  <label className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('full_name')}
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder={t('full_name_placeholder', 'Contoh: Ahmad Faiz')}
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {getIdLabel()}
                  </label>
                  <div className="relative">
                    <GraduationCap className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={activeNim}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100 dark:bg-[#070a10] border border-slate-200 dark:border-slate-800 rounded-md text-slate-500 dark:text-slate-400 font-mono font-bold cursor-not-allowed"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono mt-1 block">
                    {language === 'en'
                      ? 'Academic ID is read-only and verified by the system.'
                      : 'Nomor induk akademik bersifat read-only dan dikelola sistem.'}
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('campus_institution')}
                  </label>
                  <div className="relative">
                    <Building className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Universitas Negeri Surabaya"
                      value={editInstitution}
                      onChange={(e) => setEditInstitution(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
                    />
                  </div>
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-slate-200 dark:border-[#232f42] bg-slate-50 dark:bg-[#161d2a] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-mono font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg transition"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-5 py-2 bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-mono font-bold rounded-lg transition flex items-center gap-1.5 shadow-md disabled:opacity-50"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>
                    {isUploading
                      ? language === 'en'
                        ? 'SAVING...'
                        : 'MENYIMPAN...'
                      : t('save_changes', 'SIMPAN PERUBAHAN')}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
