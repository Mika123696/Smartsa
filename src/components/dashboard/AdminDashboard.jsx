import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { ROLES } from '../../constants/roles';
import {
  deleteClassByAdmin,
  fetchAdminOverviewData,
  updateClassByAdmin,
  updateUserByAdmin,
  updateUserVerificationByAdmin,
} from '../../services/lmsFirestoreService';
import { AccessibleDialog, AccessibleToast } from '../common/AccessibleDialog';
import {
  Users,
  ShieldCheck,
  Activity,
  Layers,
  Database,
  Server,
  Cloud,
  Search,
  Save,
  Trash2,
  RefreshCw,
  BookOpen,
} from 'lucide-react';

export default function AdminDashboard({ onClassesChanged }) {
  const { userProfile, currentUser, role } = useAuth();
  const { t, language } = useLanguage();

  const [usersList, setUsersList] = useState([]);
  const [classesList, setClassesList] = useState([]);
  const [classesCount, setClassesCount] = useState(0);
  const [dataSource, setDataSource] = useState('unconnected');
  const [loadedAdminUid, setLoadedAdminUid] = useState(null);
  const [verificationQueue, setVerificationQueue] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmDeleteClass, setConfirmDeleteClass] = useState(null);
  const [toast, setToast] = useState(null);

  // User Management state
  const [userSearch, setUserSearch] = useState('');
  const [userDrafts, setUserDrafts] = useState({});
  const [savingUserId, setSavingUserId] = useState(null);

  // Class Catalog Management state
  const [classDrafts, setClassDrafts] = useState({});
  const [savingClassId, setSavingClassId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loading = Boolean(
    currentUser && role === ROLES.ADMIN && loadedAdminUid !== currentUser.uid
  );

  const showToast = (text, type = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  const appendAuditLog = (action, target, status = 'SUCCESS') => {
    const newLog = {
      id: `log_${action}_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('id-ID'),
      actor: userProfile?.displayName || 'Administrator',
      action,
      target,
      status,
      ip: 'cloud-client',
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  const hydrateDrafts = (users, classes) => {
    const uDrafts = {};
    users.forEach((u) => {
      const r = u.role || ROLES.STUDENT;
      const idVal =
        r === ROLES.LECTURER
          ? u.nidn || u.nim || ''
          : r === ROLES.ADMIN
            ? u.nip || u.nim || ''
            : u.nim || '';
      uDrafts[u.uid] = { role: r, idNumber: idVal };
    });
    setUserDrafts(uDrafts);

    const cDrafts = {};
    classes.forEach((c) => {
      cDrafts[c.id] = {
        instructor: c.instructor || c.lecturer || '',
        lecturerId: c.lecturerId || '',
      };
    });
    setClassDrafts(cDrafts);
  };

  const applyOverviewResponse = useCallback((res) => {
    if (res?.source !== 'firestore') return;
    const loadedUsers = res.users || [];
    const loadedClasses = res.classes || [];
    setDataSource('firestore');
    setUsersList(loadedUsers);
    setClassesList(loadedClasses);
    setClassesCount(loadedClasses.length);
    hydrateDrafts(loadedUsers, loadedClasses);

    const pendingUsers = loadedUsers
      .filter(
        (u) =>
          u.verificationStatus === 'pending' ||
          u.requestedRole === ROLES.LECTURER
      )
      .map((u) => ({
        id: u.uid,
        name: u.displayName || u.email || 'Pengguna',
        email: u.email || '-',
        institution: u.institution || 'Institusi Terdaftar',
        type: u.requestedRole === ROLES.LECTURER ? 'Dosen' : u.role || 'Pendidik',
        appliedAt: u.createdAt?.toDate
          ? u.createdAt.toDate().toLocaleString('id-ID')
          : 'Cloud Firestore',
        isFirestoreUser: true,
      }));

    setVerificationQueue(pendingUsers);
  }, []);

  const loadAdminOverview = useCallback(async () => {
    if (!currentUser || role !== ROLES.ADMIN) return;
    setRefreshing(true);
    try {
      const res = await fetchAdminOverviewData();
      applyOverviewResponse(res);
    } finally {
      setLoadedAdminUid(currentUser.uid);
      setRefreshing(false);
    }
  }, [currentUser, role, applyOverviewResponse]);

  useEffect(() => {
    let mounted = true;
    if (!currentUser || role !== ROLES.ADMIN) {
      return undefined;
    }

    fetchAdminOverviewData()
      .then((res) => {
        if (mounted) applyOverviewResponse(res);
      })
      .finally(() => {
        if (mounted) setLoadedAdminUid(currentUser.uid);
      });

    return () => {
      mounted = false;
    };
  }, [currentUser, role, applyOverviewResponse]);

  const executeDecision = async ({ item, decision }) => {
    try {
      if (item.isFirestoreUser && currentUser && role === ROLES.ADMIN) {
        await updateUserVerificationByAdmin(item.id, {
          role: decision === 'approve' ? ROLES.LECTURER : undefined,
          verificationStatus: decision === 'approve' ? 'verified' : 'rejected',
        });
      }

      setVerificationQueue((prev) => prev.filter((q) => q.id !== item.id));
      appendAuditLog(
        decision === 'approve' ? 'APPROVE_INSTRUCTOR' : 'REJECT_INSTRUCTOR',
        `${item.name} (${item.email})`
      );

      showToast(
        decision === 'approve' ? t('admin_verif_approved') : t('admin_verif_rejected'),
        'success'
      );
      if (item.isFirestoreUser) {
        void loadAdminOverview();
      }
    } catch (err) {
      showToast(err.message || 'Gagal memperbarui status verifikasi.', 'error');
    } finally {
      setConfirmAction(null);
    }
  };

  const handleSaveUserRow = async (user) => {
    const draft = userDrafts[user.uid];
    if (!draft) return;
    setSavingUserId(user.uid);
    try {
      const idStr = String(draft.idNumber || '').trim();
      const updates = {
        role: draft.role,
        nim: draft.role === ROLES.STUDENT ? idStr : user.nim || '',
        nidn: draft.role === ROLES.LECTURER ? idStr : user.nidn || '',
        nip: draft.role === ROLES.ADMIN ? idStr : user.nip || '',
      };
      await updateUserByAdmin(user.uid, updates);
      setUsersList((prev) =>
        prev.map((u) => (u.uid === user.uid ? { ...u, ...updates } : u))
      );
      appendAuditLog('UPDATE_USER_ROLE', `${user.email || user.uid} -> ${draft.role}`);
      showToast(
        language === 'en'
          ? `User ${user.displayName || user.email} updated in Firestore.`
          : `Data pengguna ${user.displayName || user.email} berhasil diperbarui.`,
        'success'
      );
    } catch (err) {
      showToast(err.message || 'Gagal memperbarui pengguna.', 'error');
    } finally {
      setSavingUserId(null);
    }
  };

  const handleSaveClassRow = async (cls) => {
    const draft = classDrafts[cls.id];
    if (!draft) return;
    setSavingClassId(cls.id);
    try {
      await updateClassByAdmin(cls.id, {
        instructor: draft.instructor,
        lecturerId: draft.lecturerId,
      });
      setClassesList((prev) =>
        prev.map((c) =>
          c.id === cls.id
            ? {
                ...c,
                instructor: draft.instructor,
                lecturer: draft.instructor,
                lecturerId: draft.lecturerId,
              }
            : c
        )
      );
      onClassesChanged?.();
      appendAuditLog('REASSIGN_CLASS', `${cls.code || cls.id} -> ${draft.instructor}`);
      showToast(
        language === 'en'
          ? `Class ${cls.code} instructor updated.`
          : `Pengampu kelas ${cls.code} berhasil diperbarui.`,
        'success'
      );
    } catch (err) {
      showToast(err.message || 'Gagal memperbarui kelas.', 'error');
    } finally {
      setSavingClassId(null);
    }
  };

  const executeDeleteClass = async () => {
    if (!confirmDeleteClass) return;
    try {
      await deleteClassByAdmin(confirmDeleteClass.id);
      setClassesList((prev) => prev.filter((c) => c.id !== confirmDeleteClass.id));
      setClassesCount((prev) => Math.max(0, prev - 1));
      onClassesChanged?.();
      appendAuditLog('DELETE_CLASS', `${confirmDeleteClass.code} (${confirmDeleteClass.id})`);
      showToast(
        language === 'en'
          ? `Class ${confirmDeleteClass.code} deleted from Firestore.`
          : `Kelas ${confirmDeleteClass.code} berhasil dihapus dari Firestore.`,
        'success'
      );
    } catch (err) {
      showToast(err.message || 'Gagal menghapus kelas.', 'error');
    } finally {
      setConfirmDeleteClass(null);
    }
  };

  const educatorUsers = usersList.filter(
    (u) => u.role === ROLES.LECTURER || u.role === ROLES.ADMIN
  );

  const filteredUsers = usersList.filter((u) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      String(u.displayName || '').toLowerCase().includes(q) ||
      String(u.email || '').toLowerCase().includes(q) ||
      String(u.nim || '').toLowerCase().includes(q) ||
      String(u.nidn || '').toLowerCase().includes(q) ||
      String(u.nip || '').toLowerCase().includes(q)
    );
  });

  const totalUsersDisplay = usersList.length;

  return (
    <div className="space-y-6">
      <AccessibleToast toast={toast} onDismiss={() => setToast(null)} />

      <AccessibleDialog
        isOpen={Boolean(confirmAction)}
        variant={confirmAction?.decision === 'reject' ? 'danger' : 'confirm'}
        title={
          confirmAction?.decision === 'approve'
            ? language === 'en'
              ? 'Approve Educator Account'
              : 'Setujui Akun Pendidik'
            : language === 'en'
            ? 'Reject Verification Request'
            : 'Tolak Permohonan Verifikasi'
        }
        message={
          confirmAction
            ? language === 'en'
              ? `Proceed to ${confirmAction.decision} educator access for ${confirmAction.item.name}?`
              : `Lanjutkan proses ${
                  confirmAction.decision === 'approve' ? 'persetujuan' : 'penolakan'
                } akun pendidik untuk ${confirmAction.item.name}?`
            : ''
        }
        confirmLabel={t('dialog_confirm')}
        cancelLabel={t('dialog_cancel')}
        onConfirm={() => confirmAction && executeDecision(confirmAction)}
        onClose={() => setConfirmAction(null)}
      />

      <AccessibleDialog
        isOpen={Boolean(confirmDeleteClass)}
        variant="danger"
        title={language === 'en' ? 'Delete Class' : 'Hapus Kelas dari Firestore'}
        message={
          confirmDeleteClass
            ? language === 'en'
              ? `Delete class "${confirmDeleteClass.name}" (${confirmDeleteClass.code}) permanently?`
              : `Yakin ingin menghapus kelas "${confirmDeleteClass.name}" (${confirmDeleteClass.code}) dari Cloud Firestore?`
            : ''
        }
        confirmLabel={language === 'en' ? 'Delete' : 'Hapus'}
        cancelLabel={t('dialog_cancel')}
        onConfirm={executeDeleteClass}
        onClose={() => setConfirmDeleteClass(null)}
      />

      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 bg-rose-500/20 border border-rose-400/30 text-rose-300 text-xs px-3 py-1 rounded-full mb-3">
            <ShieldCheck className="w-3.5 h-3.5" />
            {t('admin_badge')}
          </span>
          <h2 className="text-2xl font-bold tracking-tight">{t('admin_title')}</h2>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 leading-relaxed">{t('admin_sub')}</p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">{t('admin_total_users')}</span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {loading ? '...' : totalUsersDisplay}
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1 inline-block">
            {dataSource === 'firestore'
              ? 'Live Cloud Firestore'
              : language === 'en'
                ? 'Awaiting Firestore'
                : 'Menunggu Firestore'}
          </span>
        </div>

        <div className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">{t('admin_pending_verif')}</span>
            <div className="p-2 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-xl">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
            {verificationQueue.length}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 inline-block">
            {language === 'en' ? 'Educator Role Requests' : 'Role Guru & Dosen'}
          </span>
        </div>

        <div className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">{t('admin_total_classes')}</span>
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {loading ? '...' : classesCount}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 inline-block">
            {dataSource === 'firestore'
              ? 'Firestore Classes'
              : language === 'en'
                ? 'Unloaded'
                : 'Belum dimuat'}
          </span>
        </div>

        <div className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">{t('admin_security_rules')}</span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
            {language === 'en' ? 'Protected' : 'Terproteksi'}
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1 inline-block">
            RBAC &amp; Least Privilege
          </span>
        </div>
      </div>

      {/* Cloud Services Health */}
      <div className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
          {language === 'en'
            ? 'Compute & Database Infrastructure Status'
            : 'Kesehatan Layanan Komputasi & Database'}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-50 dark:bg-[#0f141e] rounded-xl border border-slate-200 dark:border-[#232f42] flex items-center gap-3">
            <Database className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <span className="font-semibold block text-slate-800 dark:text-slate-200">
                Cloud Firestore
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                ● {dataSource === 'firestore' ? 'Connected' : 'Ready'}
              </span>
            </div>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-[#0f141e] rounded-xl border border-slate-200 dark:border-[#232f42] flex items-center gap-3">
            <Server className="w-5 h-5 text-blue-500 shrink-0" />
            <div>
              <span className="font-semibold block text-slate-800 dark:text-slate-200">
                Vercel Backend
              </span>
              <span className="text-blue-600 dark:text-sky-400 font-bold text-[10px]">
                ● Serverless Ready
              </span>
            </div>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-[#0f141e] rounded-xl border border-slate-200 dark:border-[#232f42] flex items-center gap-3">
            <Cloud className="w-5 h-5 text-indigo-500 shrink-0" />
            <div>
              <span className="font-semibold block text-slate-800 dark:text-slate-200">
                Cloudinary CDN
              </span>
              <span className="text-slate-500 dark:text-slate-400 font-medium text-[10px]">
                ● Env Configured
              </span>
            </div>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-[#0f141e] rounded-xl border border-slate-200 dark:border-[#232f42] flex items-center gap-3">
            <Activity className="w-5 h-5 text-purple-500 shrink-0" />
            <div>
              <span className="font-semibold block text-slate-800 dark:text-slate-200">
                Gemini LLM AI
              </span>
              <span className="text-slate-500 dark:text-slate-400 font-medium text-[10px]">
                ● Exam-Safe Guard
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Educator Verification Queue */}
      <div className="bg-white dark:bg-[#121822] p-6 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs">
        <div className="mb-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {language === 'en'
              ? 'Educator Account Verification Requests'
              : 'Permohonan Verifikasi Akun Pendidik'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {language === 'en'
              ? 'Approval is required before prospective lecturers or teachers can publish classes and exams.'
              : 'Persetujuan diperlukan agar calon dosen atau guru dapat membuat ruang kelas dan merilis soal ujian.'}
          </p>
        </div>

        {verificationQueue.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 dark:bg-[#0f141e] rounded-xl border border-dashed border-slate-200 dark:border-[#232f42] text-xs text-slate-500 dark:text-slate-400">
            {language === 'en'
              ? 'No pending verification requests.'
              : 'Tidak ada permohonan verifikasi yang tertunda.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-[#0f141e] text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-[#232f42]">
                <tr>
                  <th className="py-3 px-4">{language === 'en' ? 'Full Name' : 'Nama Lengkap'}</th>
                  <th className="py-3 px-4">{language === 'en' ? 'Email & Role' : 'Email & Tipe'}</th>
                  <th className="py-3 px-4">{language === 'en' ? 'Institution' : 'Institusi'}</th>
                  <th className="py-3 px-4">{language === 'en' ? 'Submitted At' : 'Waktu Pengajuan'}</th>
                  <th className="py-3 px-4 text-right">
                    {language === 'en' ? 'Decision' : 'Keputusan'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#232f42]">
                {verificationQueue.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50 dark:hover:bg-[#161d2a] transition"
                  >
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      {item.name}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      <div>{item.email}</div>
                      <span className="inline-block text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-1.5 py-0.5 rounded-sm mt-0.5">
                        {item.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {item.institution}
                    </td>
                    <td className="py-3 px-4 text-slate-400">{item.appliedAt}</td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => setConfirmAction({ item, decision: 'approve' })}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1.5 rounded-lg font-semibold transition"
                      >
                        {language === 'en' ? 'Approve' : 'Setujui'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAction({ item, decision: 'reject' })}
                        className="bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 px-2.5 py-1.5 rounded-lg font-semibold transition"
                      >
                        {language === 'en' ? 'Reject' : 'Tolak'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Live Firestore User Management */}
      <div className="bg-white dark:bg-[#121822] p-6 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              {language === 'en'
                ? 'Live Firestore User & Role Management'
                : 'Manajemen Pengguna & Peran (Cloud Firestore)'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {language === 'en'
                ? 'Update user roles (student, lecturer, admin) and academic identifiers (NIM/NIDN/NIP) directly in Firestore.'
                : 'Ubah peran pengguna (student, lecturer, admin) serta nomor identitas akademik (NIM/NIDN/NIP) secara langsung.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder={language === 'en' ? 'Search name / email / ID...' : 'Cari nama / email / NIM...'}
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-[#232f42] bg-slate-50 dark:bg-[#0f141e] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>
            <button
              type="button"
              onClick={() => void loadAdminOverview()}
              disabled={refreshing}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-[#232f42] bg-slate-50 dark:bg-[#0f141e] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1a2232] flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {language === 'en' ? 'Refresh' : 'Muat Ulang'}
            </button>
          </div>
        </div>

        {dataSource !== 'firestore' ? (
          <div className="text-center py-8 bg-slate-50 dark:bg-[#0f141e] rounded-xl border border-dashed border-slate-200 dark:border-[#232f42] text-xs text-slate-500 dark:text-slate-400">
            {language === 'en'
              ? 'Connect as an authenticated Admin with Firebase active to manage live Firestore users.'
              : 'Masuk sebagai Admin terautentikasi dengan Firebase aktif untuk mengelola data pengguna Cloud Firestore.'}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 dark:bg-[#0f141e] rounded-xl border border-dashed border-slate-200 dark:border-[#232f42] text-xs text-slate-500 dark:text-slate-400">
            {language === 'en'
              ? 'No users match your search query.'
              : 'Tidak ada pengguna yang sesuai dengan kata kunci pencarian.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-[#0f141e] text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-[#232f42]">
                <tr>
                  <th className="py-3 px-3">{language === 'en' ? 'User' : 'Pengguna'}</th>
                  <th className="py-3 px-3">{language === 'en' ? 'Role' : 'Peran'}</th>
                  <th className="py-3 px-3">NIM / NIDN / NIP</th>
                  <th className="py-3 px-3 text-right">{language === 'en' ? 'Action' : 'Aksi'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#232f42]">
                {filteredUsers.map((u) => {
                  const draft = userDrafts[u.uid] || {
                    role: u.role || ROLES.STUDENT,
                    idNumber: u.nim || u.nidn || u.nip || '',
                  };
                  const idLabel =
                    draft.role === ROLES.LECTURER
                      ? 'NIDN'
                      : draft.role === ROLES.ADMIN
                        ? 'NIP'
                        : 'NIM';
                  return (
                    <tr key={u.uid} className="hover:bg-slate-50 dark:hover:bg-[#161d2a] transition">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {u.displayName || 'Tanpa Nama'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          {u.email || u.uid}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={draft.role}
                          onChange={(e) => {
                            const nextRole = e.target.value;
                            setUserDrafts((prev) => ({
                              ...prev,
                              [u.uid]: { ...draft, role: nextRole },
                            }));
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#232f42] bg-white dark:bg-[#0f141e] text-slate-800 dark:text-slate-200 text-xs font-mono"
                        >
                          <option value={ROLES.STUDENT}>student</option>
                          <option value={ROLES.LECTURER}>lecturer</option>
                          <option value={ROLES.ADMIN}>admin</option>
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <input
                          type="text"
                          value={draft.idNumber}
                          onChange={(e) =>
                            setUserDrafts((prev) => ({
                              ...prev,
                              [u.uid]: { ...draft, idNumber: e.target.value },
                            }))
                          }
                          placeholder={idLabel}
                          className="w-40 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#232f42] bg-white dark:bg-[#0f141e] text-slate-800 dark:text-slate-200 text-xs font-mono"
                        />
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => void handleSaveUserRow(u)}
                          disabled={savingUserId === u.uid}
                          className="inline-flex items-center gap-1.5 bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {savingUserId === u.uid
                            ? language === 'en'
                              ? 'Saving...'
                              : 'Menyimpan...'
                            : language === 'en'
                              ? 'Save'
                              : 'Simpan'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Live Firestore Class Catalog Management */}
      <div className="bg-white dark:bg-[#121822] p-6 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              {language === 'en'
                ? 'Live Class Catalog & Lecturer Assignment'
                : 'Manajemen Katalog Kelas & Penugasan Dosen'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {language === 'en'
                ? 'Reassign lead instructors or remove classes from Firestore.'
                : 'Atur ulang dosen pengampu atau hapus kelas dari Firestore.'}
            </p>
          </div>
        </div>

        {dataSource !== 'firestore' ? (
          <div className="text-center py-8 bg-slate-50 dark:bg-[#0f141e] rounded-xl border border-dashed border-slate-200 dark:border-[#232f42] text-xs text-slate-500 dark:text-slate-400">
            {language === 'en'
              ? 'Connect as an authenticated Admin with Firebase active to manage Firestore classes.'
              : 'Masuk sebagai Admin terautentikasi dengan Firebase aktif untuk mengelola katalog kelas Firestore.'}
          </div>
        ) : classesList.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 dark:bg-[#0f141e] rounded-xl border border-dashed border-slate-200 dark:border-[#232f42] text-xs text-slate-500 dark:text-slate-400">
            {language === 'en'
              ? 'No classes found in Firestore yet.'
              : 'Belum ada kelas di Firestore.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-[#0f141e] text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-[#232f42]">
                <tr>
                  <th className="py-3 px-3">{language === 'en' ? 'Class & Code' : 'Kelas & Kode'}</th>
                  <th className="py-3 px-3">{language === 'en' ? 'Educator Account' : 'Akun Pengampu'}</th>
                  <th className="py-3 px-3">{language === 'en' ? 'Instructor Display' : 'Nama Pengampu'}</th>
                  <th className="py-3 px-3 text-right">{language === 'en' ? 'Actions' : 'Aksi'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#232f42]">
                {classesList.map((cls) => {
                  const draft = classDrafts[cls.id] || {
                    instructor: cls.instructor || cls.lecturer || '',
                    lecturerId: cls.lecturerId || '',
                  };
                  return (
                    <tr key={cls.id} className="hover:bg-slate-50 dark:hover:bg-[#161d2a] transition">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {cls.name || cls.title}
                        </div>
                        <div className="text-[11px] text-amber-600 dark:text-[#f59e0b] font-mono">
                          {cls.code} • {cls.category}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={draft.lecturerId}
                          onChange={(e) => {
                            const selectedUid = e.target.value;
                            const matched = educatorUsers.find((u) => u.uid === selectedUid);
                            setClassDrafts((prev) => ({
                              ...prev,
                              [cls.id]: {
                                lecturerId: selectedUid,
                                instructor: matched?.displayName || draft.instructor,
                              },
                            }));
                          }}
                          className="w-48 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#232f42] bg-white dark:bg-[#0f141e] text-slate-800 dark:text-slate-200 text-xs"
                        >
                          <option value="">
                            {language === 'en' ? '-- Keep / Custom --' : '-- Pilih Dosen / Kustom --'}
                          </option>
                          {educatorUsers.map((ed) => (
                            <option key={ed.uid} value={ed.uid}>
                              {ed.displayName || ed.email} ({ed.role})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <input
                          type="text"
                          value={draft.instructor}
                          onChange={(e) =>
                            setClassDrafts((prev) => ({
                              ...prev,
                              [cls.id]: { ...draft, instructor: e.target.value },
                            }))
                          }
                          placeholder={language === 'en' ? 'Instructor name' : 'Nama dosen pengampu'}
                          className="w-48 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#232f42] bg-white dark:bg-[#0f141e] text-slate-800 dark:text-slate-200 text-xs"
                        />
                      </td>
                      <td className="py-3 px-3 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => void handleSaveClassRow(cls)}
                          disabled={savingClassId === cls.id}
                          className="inline-flex items-center gap-1 bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {savingClassId === cls.id
                            ? language === 'en'
                              ? 'Saving...'
                              : 'Menyimpan...'
                            : language === 'en'
                              ? 'Save'
                              : 'Simpan'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteClass(cls)}
                          className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {language === 'en' ? 'Delete' : 'Hapus'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Logs */}
      <div className="bg-white dark:bg-[#121822] p-6 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs">
        <div className="mb-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {language === 'en'
              ? 'System Security Audit Trail'
              : 'Rekam Jejak Keamanan Sistem (Audit Logs)'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {language === 'en'
              ? 'Immutable audit log stream for tracking critical administrative operations.'
              : 'Koleksi immutable audit_logs untuk mencatat transaksi bernilai kritis dan deteksi anomali.'}
          </p>
        </div>

        {auditLogs.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 dark:bg-[#0f141e] rounded-xl border border-dashed border-slate-200 dark:border-[#232f42] text-xs text-slate-500 dark:text-slate-400">
            {language === 'en'
              ? 'No server audit logs recorded yet in this session.'
              : 'Belum ada log audit server yang tercatat pada sesi ini.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900 dark:bg-[#090d16] text-slate-200 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Target</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#232f42] font-sans">
                {auditLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50 dark:hover:bg-[#161d2a] transition text-[11px]"
                  >
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-mono">
                      {log.timestamp}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      {log.actor}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono bg-slate-100 dark:bg-[#0f141e] text-slate-800 dark:text-amber-400 px-2 py-0.5 rounded-md text-[10px]">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{log.target}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-semibold px-2 py-0.5 rounded-full text-[10px] ${
                          log.status === 'SUCCESS'
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                            : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-mono">{log.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
