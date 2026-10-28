import {
  GraduationCap,
  ShieldCheck,
  Server,
  Database,
  Cloud,
  Cpu,
  ArrowRight,
} from 'lucide-react';

export default function AboutPage({ onGoToDashboard }) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      {/* Platform Title */}
      <div className="text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-blue-500/30">
          <GraduationCap className="w-7 h-7" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900">Tentang Smartsa LMS</h1>
        <p className="text-sm text-slate-500 max-w-xl mx-auto">
          Arsitektur pembelajaran digital hibrida yang dirancang untuk keandalan jaringan, integritas evaluasi, dan asistensi AI terisolasi.
        </p>
      </div>

      {/* Tech Stack Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-blue-600 font-bold text-sm">
            <Database className="w-4 h-4" />
            <span>Google Firebase & Cloud Firestore</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Menyediakan manajemen identitas pengguna terenkripsi melalui Firebase Authentication, sinkronisasi data real-time berbasis NoSQL, dan kemampuan persistensi lokal (*offline caching*) tanpa membebani kuota pengguna.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-sm">
            <Server className="w-4 h-4" />
            <span>Vercel Serverless Middleware (TypeScript)</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Menjalankan logika bisnis privat seperti kalkulasi skor evaluasi (`/api/grade`), validasi kode pendaftaran (`/api/join-class`), penandatanganan berkas Cloudinary, dan orkestrasi pemanggilan Google Gemini AI.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-purple-600 font-bold text-sm">
            <Cpu className="w-4 h-4" />
            <span>Google Gemini Generative AI</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Berfungsi sebagai Learning Assistant bagi pembelajar dan Teaching Assistant bagi pendidik. Menggunakan model terpisah dengan proteksi penguncian otomatis (*exam lockout*) saat sesi ujian aktif.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
            <Cloud className="w-4 h-4" />
            <span>Cloudinary CDN & Media Storage</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Distribusi media gambar modul dan berkas panduan Manual Book PDF dengan pengunggahan langsung bertanda tangan digital (*direct signed uploads*) untuk memangkas beban bandwidth server.
          </p>
        </div>
      </div>

      {/* Security Principles */}
      <div className="bg-slate-900 text-white p-8 rounded-3xl space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-400" />
          Prinsip Utama Keamanan & Integritas Penilaian
        </h3>
        <ul className="text-xs sm:text-sm text-slate-300 space-y-2 list-disc pl-5 leading-relaxed">
          <li>
            <strong>Zero Key Leakage:</strong> Kunci jawaban pretest/post-test tidak pernah dikirim ke browser atau aplikasi mobile pengguna; seluruh evaluasi terjadi di sisi server.
          </li>
          <li>
            <strong>Exam Lockout Protocol:</strong> API backend secara otomatis menolak permintaan asistensi AI jika token pengguna sedang memiliki sesi ujian aktif.
          </li>
          <li>
            <strong>Immutable Audit Logs:</strong> Setiap perubahan data kritis dicatat dalam koleksi `audit_logs` yang tidak dapat dimodifikasi atau dihapus oleh siapapun kecuali sistem backend.
          </li>
        </ul>
        <div className="pt-4">
          <button
            onClick={onGoToDashboard}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition inline-flex items-center gap-2"
          >
            <span>Buka Dashboard LMS</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

