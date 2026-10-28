import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/LanguageContext';
import { DEMO_AUDIT_LOGS } from '../../services/mockData';
import {
  Users,
  ShieldCheck,
  Activity,
  Layers,
  Database,
  Server,
  Cloud,
} from 'lucide-react';

export default function AdminDashboard() {
  const { userProfile } = useAuth();
  const { t, language } = useLanguage();

  // Daftar verifikasi akun pendidik (Guru/Dosen)
  const [verificationQueue, setVerificationQueue] = useState([
    {
      id: 'verif_01',
      name: 'Bambang Sudarmono, M.T.',
      email: 'bambang@poltek.ac.id',
      institution: 'Politeknik Elektronika Negeri Surabaya',
      type: 'Dosen',
      appliedAt: '22 Okt 2026, 06:30 WIB',
    },
    {
      id: 'verif_02',
      name: 'Nur Aini Farida, S.Pd.',
      email: 'nuraini@smkn2-sby.sch.id',
      institution: 'SMK Negeri 2 Surabaya',
      type: 'Guru',
      appliedAt: '21 Okt 2026, 17:45 WIB',
    },
    {
      id: 'verif_03',
      name: 'Rudi Hartono, S.Kom., M.Cs.',
      email: 'rudi@univ-airlangga.ac.id',
      institution: 'Universitas Airlangga',
      type: 'Dosen',
      appliedAt: '21 Okt 2026, 14:12 WIB',
    },
  ]);

  const [auditLogs, setAuditLogs] = useState(DEMO_AUDIT_LOGS);

  const handleApprove = (id, name) => {
    setVerificationQueue((prev) => prev.filter((item) => item.id !== id));
    // Catat ke audit log secara simulasi
    const newLog = {
      id: `log_approve_${id}`,
      timestamp: 'Baru saja',
      actor: userProfile?.displayName || 'Administrator',
      action: 'APPROVE_INSTRUCTOR',
      target: `Verifikasi Akun Pendidik: ${name}`,
      status: 'SUCCESS',
      ip: '127.0.0.1',
    };
    setAuditLogs([newLog, ...auditLogs]);
    alert(`Akun pendidik ${name} berhasil diverifikasi! Hak akses pembuatan kelas telah diaktifkan.`);
  };

  const handleReject = (id, name) => {
    setVerificationQueue((prev) => prev.filter((item) => item.id !== id));
    alert(`Pengajuan verifikasi akun ${name} ditolak.`);
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 bg-rose-500/20 border border-rose-400/30 text-rose-300 text-xs px-3 py-1 rounded-full mb-3">
            <ShieldCheck className="w-3.5 h-3.5" />
            {language === 'en' ? 'Security & System Governance Command' : 'Pusat Kendali Keamanan & Tata Kelola Sistem'}
          </span>
          <h2 className="text-2xl font-bold tracking-tight">
            {language === 'en' ? 'Smartsa LMS Administration Console 🛡️' : 'Konsol Administrasi Smartsa LMS 🛡️'}
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 leading-relaxed">
            {language === 'en'
              ? 'Monitor audit trails, validate educator role submissions, manage security access policies, and observe live cloud infrastructure.'
              : 'Pantau rekam jejak audit (*audit trail*), validasi permohonan role Guru/Dosen, kelola aturan hak akses, dan tinjau keaktifan layanan cloud.'}
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Total Akun Pengguna</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">1,420</div>
          <span className="text-[11px] text-emerald-600 font-semibold mt-1 inline-block">+48 Pendaftar Baru Minggu Ini</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Menunggu Verifikasi</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-600">{verificationQueue.length} Pengajuan</div>
          <span className="text-[11px] text-slate-500 mt-1 inline-block">Role Guru & Dosen</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Total Kelas Aktif</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-indigo-600">48 Kelas</div>
          <span className="text-[11px] text-slate-500 mt-1 inline-block">Tersebar di 12 Institusi</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Status Security Rules</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-700">Terproteksi</div>
          <span className="text-[11px] text-emerald-600 font-semibold mt-1 inline-block">RBAC & Least Privilege</span>
        </div>
      </div>

      {/* Status Infrastruktur Awan */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Kesehatan Layanan Komputasi & Database</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
            <Database className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <span className="font-semibold block text-slate-800">Cloud Firestore</span>
              <span className="text-emerald-600 font-bold text-[10px]">● Beroperasi Normal</span>
            </div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
            <Server className="w-5 h-5 text-blue-500 shrink-0" />
            <div>
              <span className="font-semibold block text-slate-800">Vercel Backend</span>
              <span className="text-blue-600 font-bold text-[10px]">● Serverless Ready</span>
            </div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
            <Cloud className="w-5 h-5 text-indigo-500 shrink-0" />
            <div>
              <span className="font-semibold block text-slate-800">Cloudinary CDN</span>
              <span className="text-slate-500 font-medium text-[10px]">● Menunggu Env Vercel</span>
            </div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
            <Activity className="w-5 h-5 text-purple-500 shrink-0" />
            <div>
              <span className="font-semibold block text-slate-800">Gemini LLM AI</span>
              <span className="text-slate-500 font-medium text-[10px]">● Menunggu Env Vercel</span>
            </div>
          </div>
        </div>
      </div>

      {/* Antrian Verifikasi Akun Pendidik */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Permohonan Verifikasi Akun Pendidik</h3>
            <p className="text-xs text-slate-500">Persetujuan diperlukan agar calon dosen atau guru dapat membuat ruang kelas dan merilis soal ujian.</p>
          </div>
        </div>

        {verificationQueue.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
            Tidak ada permohonan verifikasi yang tertunda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Nama Lengkap</th>
                  <th className="py-3 px-4">Email & Tipe</th>
                  <th className="py-3 px-4">Institusi</th>
                  <th className="py-3 px-4">Waktu Pengajuan</th>
                  <th className="py-3 px-4 text-right">Keputusan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {verificationQueue.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-semibold text-slate-900">{item.name}</td>
                    <td className="py-3 px-4 text-slate-600">
                      <div>{item.email}</div>
                      <span className="inline-block text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-sm mt-0.5">
                        {item.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{item.institution}</td>
                    <td className="py-3 px-4 text-slate-400">{item.appliedAt}</td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleApprove(item.id, item.name)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1.5 rounded-lg font-semibold transition"
                      >
                        Setujui
                      </button>
                      <button
                        onClick={() => handleReject(item.id, item.name)}
                        className="bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 px-2.5 py-1.5 rounded-lg font-semibold transition"
                      >
                        Tolak
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Live Immutable Audit Logs */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Rekam Jejak Keamanan Sistem (Audit Logs)</h3>
            <p className="text-xs text-slate-500">Koleksi immutable `audit_logs` untuk mencatat transaksi bernilai kritis dan deteksi anomali.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900 text-slate-200 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Stempel Waktu</th>
                <th className="py-3 px-4">Aktor Pengguna</th>
                <th className="py-3 px-4">Aksi Eksekusi</th>
                <th className="py-3 px-4">Target Sumber Daya</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition text-[11px]">
                  <td className="py-3 px-4 text-slate-500 font-mono">{log.timestamp}</td>
                  <td className="py-3 px-4 font-semibold text-slate-900">{log.actor}</td>
                  <td className="py-3 px-4">
                    <span className="font-mono bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md text-[10px]">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700">{log.target}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`font-semibold px-2 py-0.5 rounded-full text-[10px] ${
                        log.status === 'SUCCESS'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
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