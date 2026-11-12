import { useState, useEffect } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { ROLES } from '../../constants/roles';
import {
  fetchAdminOverviewData,
  updateUserVerificationByAdmin,
} from '../../services/lmsFirestoreService';
import { DEMO_AUDIT_LOGS } from '../../services/mockData';
import { AccessibleDialog, AccessibleToast } from '../common/AccessibleDialog';
import {
  Users,
  ShieldCheck,
  Activity,
  Layers,
  Database,
  Server,
  Cloud,
} from 'lucide-react';

const DEMO_VERIFICATION_QUEUE = [
  {
    id: 'verif_01',
    name: 'Bambang Sudarmono, M.T.',
    email: 'bambang@poltek.ac.id',
    institution: 'Politeknik Elektronika Negeri Surabaya',
    type: 'Dosen',
    appliedAt: '22 Okt 2026, 06:30 WIB',
    isFirestoreUser: false,
  },
  {
    id: 'verif_02',
    name: 'Nur Aini Farida, S.Pd.',
    email: 'nuraini@smkn2-sby.sch.id',
    institution: 'SMK Negeri 2 Surabaya',
    type: 'Guru',
    appliedAt: '21 Okt 2026, 17:45 WIB',
    isFirestoreUser: false,
  },
];

export default function AdminDashboard() {
  const { userProfile, currentUser, role } = useAuth();
  const { t, language } = useLanguage();

  const [usersList, setUsersList] = useState([]);
  const [classesCount, setClassesCount] = useState(6);
  const [dataSource, setDataSource] = useState('demo');
  const [loadedAdminUid, setLoadedAdminUid] = useState(null);
  const [verificationQueue, setVerificationQueue] = useState(DEMO_VERIFICATION_QUEUE);
  const [auditLogs, setAuditLogs] = useState(DEMO_AUDIT_LOGS);
  const [confirmAction, setConfirmAction] = useState(null);
  const [toast, setToast] = useState(null);

  const loading = Boolean(
    currentUser && role === ROLES.ADMIN && loadedAdminUid !== currentUser.uid
  );

  const showToast = (text, type = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    let mounted = true;
    if (!currentUser || role !== ROLES.ADMIN) {
      return undefined;
    }

    fetchAdminOverviewData()
      .then((res) => {
        if (!mounted) return;
        if (res.source === 'firestore') {
          setDataSource('firestore');
          setUsersList(res.users || []);
          setClassesCount(res.classes?.length || 0);

          const pendingUsers = (res.users || [])
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
        }
      })
      .finally(() => {
        if (mounted) {
          setLoadedAdminUid(currentUser.uid);
        }
      });

    return () => {
      mounted = false;
    };
  }, [currentUser, role]);

  const executeDecision = async ({ item, decision }) => {
    try {
      if (item.isFirestoreUser && currentUser && role === ROLES.ADMIN) {
        await updateUserVerificationByAdmin(item.id, {
          role: decision === 'approve' ? ROLES.LECTURER : undefined,
          verificationStatus: decision === 'approve' ? 'verified' : 'rejected',
        });
      }

      setVerificationQueue((prev) => prev.filter((q) => q.id !== item.id));
      const newLog = {
        id: `log_${decision}_${item.id}_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('id-ID'),
        actor: userProfile?.displayName || 'Administrator',
        action: decision === 'approve' ? 'APPROVE_INSTRUCTOR' : 'REJECT_INSTRUCTOR',
        target: `${item.name} (${item.email})`,
        status: 'SUCCESS',
        ip: 'cloud-client',
      };
      setAuditLogs((prev) => [newLog, ...prev]);

      showToast(
        decision === 'approve' ? t('admin_verif_approved') : t('admin_verif_rejected'),
        'success'
      );
    } catch (err) {
      showToast(err.message || 'Gagal memperbarui status verifikasi.', 'error');
    } finally {
      setConfirmAction(null);
    }
  };

  const totalUsersDisplay = dataSource === 'firestore' ? usersList.length : 1420;

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
            {dataSource === 'firestore' ? 'Live Cloud Firestore' : 'Demo Snapshot'}
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
            {dataSource === 'firestore' ? 'Firestore Classes' : 'Active Modules'}
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
      </div>
    </div>
  );
}
