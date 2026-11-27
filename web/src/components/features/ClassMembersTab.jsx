import { useState } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

function resolveMemberDisplayName(member) {
  return String(
    member?.studentName || member?.displayName || member?.name || member?.email || member?.uid || 'Peserta'
  ).trim();
}

/**
 * Tab manajemen anggota kelas (`ANGGOTA`) untuk Dosen Pengampu dan Administrator.
 * Menampilkan permintaan bergabung berstatus `pending` (Approve / Reject)
 * serta daftar anggota aktif (`approved` / `active`) dengan pencarian cepat dan hapus via dialog konfirmasi.
 */
export default function ClassMembersTab({
  classData,
  members = [],
  loading = false,
  memberActionId = null,
  feedback = null,
  language = 'id',
  onRefresh,
  onApprove,
  onReject,
  onRequestRemove,
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const pendingMembers = members.filter(
    (m) => String(m?.status || 'approved').toLowerCase() === 'pending'
  );
  const activeMembers = members.filter((m) => {
    const status = String(m?.status || 'approved').toLowerCase();
    return status === 'approved' || status === 'active';
  });

  const cleanQuery = searchQuery.trim().toLowerCase();
  const filteredActiveMembers = activeMembers.filter((m) => {
    if (!cleanQuery) return true;
    return (
      resolveMemberDisplayName(m).toLowerCase().includes(cleanQuery) ||
      String(m?.email || '').toLowerCase().includes(cleanQuery) ||
      String(m?.uid || '').toLowerCase().includes(cleanQuery) ||
      String(m?.accountType || '').toLowerCase().includes(cleanQuery)
    );
  });

  const syncedEnrolledCount =
    typeof classData?.enrolledCount === 'number'
      ? classData.enrolledCount
      : activeMembers.length;

  return (
    <div className="bg-white dark:bg-[#121822] border border-slate-200 dark:border-[#232f42] rounded-xl p-4 sm:p-5 space-y-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-[#232f42] pb-4">
        <div>
          <h3 className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-[#f59e0b]" />
            {language === 'en' ? '// Class Members Management' : '// Manajemen Anggota Kelas'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {language === 'en'
              ? 'Approve or reject pending join requests and manage active class participants securely via Admin SDK.'
              : 'Setujui atau tolak permintaan bergabung yang tertunda serta kelola peserta aktif kelas secara aman via server Admin SDK.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <span
            data-testid="members-enrolled-summary"
            className="px-2.5 py-1 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 font-bold"
          >
            {syncedEnrolledCount} {language === 'en' ? 'Active Enrolled' : 'Peserta Terdaftar'}
          </span>
          <span className="px-2.5 py-1 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 font-bold">
            {pendingMembers.length} {language === 'en' ? 'Pending' : 'Menunggu'}
          </span>
          <button
            type="button"
            onClick={() => onRefresh?.()}
            disabled={loading}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0b0f17] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1a2232] transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {language === 'en' ? 'Refresh' : 'Muat Ulang'}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : undefined}
          className={`p-3 rounded-lg text-xs font-mono flex items-start gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/40'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Permintaan Bergabung (Pending) */}
      <div className="space-y-2.5">
        <h4 className="text-xs font-mono font-bold text-amber-700 dark:text-[#f59e0b] uppercase flex items-center justify-between">
          <span>
            {language === 'en'
              ? 'Pending Join Requests'
              : 'Permintaan Bergabung (Pending)'}
          </span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/50">
            {pendingMembers.length}
          </span>
        </h4>

        {loading && members.length === 0 ? (
          <div className="p-6 text-center text-xs font-mono text-slate-500 dark:text-slate-400">
            {language === 'en' ? 'Loading class members...' : 'Memuat daftar anggota kelas...'}
          </div>
        ) : pendingMembers.length === 0 ? (
          <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-[#232f42] bg-slate-50 dark:bg-[#0b0f17] text-xs text-slate-500 dark:text-slate-400 text-center">
            {language === 'en'
              ? 'No pending join requests for this class.'
              : 'Tidak ada permintaan bergabung yang menunggu persetujuan.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-[#232f42] rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/10 overflow-hidden">
            {pendingMembers.map((member) => {
              const rowKey = member.id || member.uid;
              const displayLabel = resolveMemberDisplayName(member);
              const busy = memberActionId === rowKey;
              return (
                <div
                  key={rowKey}
                  className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {displayLabel}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-bold uppercase">
                        pending
                      </span>
                      {member.accountType && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {member.accountType}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {member.email || member.uid}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={
                        language === 'en'
                          ? `Approve ${displayLabel}`
                          : `Setujui ${displayLabel}`
                      }
                      onClick={() => onApprove?.(member)}
                      className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-mono font-bold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      {language === 'en' ? 'Approve' : 'Setujui'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={
                        language === 'en'
                          ? `Reject ${displayLabel}`
                          : `Tolak ${displayLabel}`
                      }
                      onClick={() => onReject?.(member)}
                      className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 text-[11px] font-mono font-bold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      {language === 'en' ? 'Reject' : 'Tolak'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Anggota Aktif (Approved / Active) + Pencarian Cepat */}
      <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-[#232f42]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h4 className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 uppercase">
            {language === 'en'
              ? `Active Members (${activeMembers.length})`
              : `Anggota Aktif (${activeMembers.length})`}
          </h4>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label={language === 'en' ? 'Search active members' : 'Cari anggota aktif'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                language === 'en'
                  ? 'Search name, email, or UID...'
                  : 'Cari nama, email, atau UID...'
              }
              className="w-full sm:w-64 pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-[#232f42] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#f59e0b]"
            />
          </div>
        </div>

        {filteredActiveMembers.length === 0 ? (
          <div className="p-5 rounded-lg border border-dashed border-slate-200 dark:border-[#232f42] bg-slate-50 dark:bg-[#0b0f17] text-xs text-slate-500 dark:text-slate-400 text-center">
            {activeMembers.length === 0
              ? language === 'en'
                ? 'No active student members in this class yet.'
                : 'Belum ada anggota aktif yang terdaftar di kelas ini.'
              : language === 'en'
                ? 'No members match your search filter.'
                : 'Tidak ada anggota aktif yang sesuai dengan pencarian.'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-[#232f42]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-[#0b0f17] text-slate-600 dark:text-slate-400 uppercase font-mono text-[10px] border-b border-slate-200 dark:border-[#232f42]">
                <tr>
                  <th className="py-2.5 px-3">{language === 'en' ? 'Member' : 'Peserta'}</th>
                  <th className="py-2.5 px-3">{language === 'en' ? 'Account' : 'Tipe Akun'}</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">{language === 'en' ? 'Action' : 'Aksi'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#232f42]">
                {filteredActiveMembers.map((member) => {
                  const rowKey = member.id || member.uid;
                  const displayLabel = resolveMemberDisplayName(member);
                  const isClassOwner = Boolean(
                    classData?.lecturerId && member.uid === classData.lecturerId
                  );
                  const busy = memberActionId === rowKey;
                  return (
                    <tr
                      key={rowKey}
                      className="hover:bg-slate-50 dark:hover:bg-[#161d2a] transition"
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {displayLabel}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {member.email || member.uid}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        {member.accountType || member.role || 'student'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 uppercase">
                          {member.status || 'approved'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {!isClassOwner && (
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={
                              language === 'en'
                                ? `Remove ${displayLabel}`
                                : `Keluarkan ${displayLabel}`
                            }
                            onClick={() => onRequestRemove?.(member)}
                            className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg transition disabled:opacity-50"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            {language === 'en' ? 'Remove' : 'Keluarkan'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
