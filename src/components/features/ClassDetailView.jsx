import { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Lock,
  PlayCircle,
  FileText,
  Download,
  AlertTriangle,
  Sparkles,
  HelpCircle,
  Users,
  Clock,
  Upload,
  File,
  FileUp,
  X,
  Trash2,
} from 'lucide-react';

export default function ClassDetailView({ classData, onBack, onNavigateAI }) {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState('meetings'); // 'meetings' | 'material' | 'video' | 'pdf' | 'exam' | 'tasks'
  const [selectedMeeting, setSelectedMeeting] = useState(classData.meetings?.[0] || null);

  // Status Ujian & Autosave
  const [examActive, setExamActive] = useState(false);
  const [examType, setExamType] = useState('pretest'); // 'pretest' | 'posttest'
  const [examTimer, setExamTimer] = useState(900); // 15 menit = 900 detik
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [examFinished, setExamFinished] = useState(false);
  const [examScore, setExamScore] = useState(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // State Pengumpulan Tugas File Mahasiswa
  const [taskSubmissions, setTaskSubmissions] = useState([
    {
      id: 'task_01',
      title: 'Tugas Praktikum 01: Clean Architecture & State Management',
      deadline: 'Besok, 23:59 WIB',
      isOverdue: false,
      status: 'pending',
      file: null,
      note: 'Susun laporan teknis diagram kelas, skema koleksi Firestore, dan daftar endpoint API Vercel dalam format PDF atau ZIP.',
      maxSize: '15 MB',
      allowedFormats: '.pdf, .zip, .docx',
    },
    {
      id: 'task_02',
      title: 'Tugas Proyek 02: Implementasi Quill Delta JSON & Media CDN',
      deadline: '30 Okt 2026, 21:00 WIB',
      isOverdue: false,
      status: 'submitted',
      file: {
        name: 'Laporan_Proyek_Kelompok_01.pdf',
        size: '3.2 MB',
        uploadedAt: 'Kemarin, 16:45 WIB',
      },
      note: 'Implementasikan editor teks Delta JSON dan pengunggahan berkas bertanda tangan ke Cloudinary.',
      maxSize: '25 MB',
      allowedFormats: '.pdf, .zip',
    },
  ]);

  const [activeTaskModal, setActiveTaskModal] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [taskNotes, setTaskNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [taskFeedback, setTaskFeedback] = useState(null);

  // Contoh Soal Ujian
  const examQuestions = [
    {
      id: 'q1',
      question: 'Apa fungsi utama lapisan Repository dalam Clean Architecture pada arsitektur perangkat lunak modern?',
      options: [
        'Mengatur tampilan antarmuka pengguna pada komponen React/Flutter',
        'Menyediakan abstraksi akses data independen dari framework database atau API eksternal',
        'Menjalankan kompresi media gambar secara otomatis di Cloudinary',
        'Mengirimkan token verifikasi email OTP menggunakan Nodemailer',
      ],
      correctIndex: 1,
    },
    {
      id: 'q2',
      question: 'Mengapa kunci jawaban pretest dan post-test dilarang keras disimpan pada dokumen Firestore sisi klien?',
      options: [
        'Karena Firestore tidak mendukung tipe data array pilihan ganda',
        'Karena akan memperlambat waktu rendering komponen antarmuka web',
        'Karena dapat diinspeksi oleh pengguna melalui network request atau local storage (risiko kebocoran ujian)',
        'Karena Firebase Admin SDK mewajibkan penyimpanan di file Excel',
      ],
      correctIndex: 2,
    },
    {
      id: 'q3',
      question: 'Kapan asisten kecerdasan buatan (Learning Assistant AI) wajib dikunci secara otomatis oleh sistem Smartsa LMS?',
      options: [
        'Saat kuota internet gawai pengguna di bawah 10%',
        'Saat pengguna sedang dalam sesi aktif mengerjakan ujian pretest atau post-test',
        'Hanya pada malam hari di luar jam perkuliahan',
        'Saat pengguna belum melakukan bookmark pada modul materi',
      ],
      correctIndex: 1,
    },
    {
      id: 'q4',
      question: 'Apa format penyimpanan materi teks yang digunakan pada Smartsa LMS untuk menghindari risiko serangan XSS?',
      options: [
        'Format HTML mentah dengan tag script aktif',
        'Format Delta JSON (flutter_quill / Quill standard)',
        'Format Dokumen Microsoft Word .docx terkompresi',
        'Format file teks biner tanpa pemformatan',
      ],
      correctIndex: 1,
    },
  ];

  const handleExamSubmit = () => {
    setExamFinished(true);
    setExamActive(false);

    let correctCount = 0;
    examQuestions.forEach((q) => {
      if (selectedAnswers[q.id] === q.correctIndex) {
        correctCount += 1;
      }
    });

    const calculatedScore = (correctCount / examQuestions.length) * 100;
    setExamScore(calculatedScore);
  };

  // Efek Timer Ujian
  useEffect(() => {
    if (!examActive || examFinished) return;

    const interval = setInterval(() => {
      setExamTimer((t) => {
        if (t <= 1) {
          clearInterval(interval);
          setExamFinished(true);
          setExamActive(false);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [examActive, examFinished]);

  const handleStartExam = (type) => {
    setExamType(type);
    setExamActive(true);
    setExamTimer(900);
    setExamFinished(false);
    setSelectedAnswers({});
    setActiveTab('exam');
  };

  const handleAnswerSelect = (qId, optionIdx) => {
    setSelectedAnswers((prev) => ({ ...prev, [qId]: optionIdx }));
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDownloadPdf = () => {
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3000);
  };

  // Handler Upload Berkas Tugas
  const handleTaskFileSubmit = (e) => {
    e.preventDefault();
    if (!uploadedFile) {
      setTaskFeedback({
        type: 'error',
        text: 'Silakan pilih berkas dokumen tugas terlebih dahulu!',
      });
      return;
    }

    setIsUploading(true);
    setTimeout(() => {
      const fileMeta = {
        name: uploadedFile.name,
        size: `${(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB`,
        uploadedAt: 'Baru saja',
      };

      setTaskSubmissions((prev) =>
        prev.map((t) =>
          t.id === activeTaskModal.id
            ? { ...t, status: 'submitted', file: fileMeta }
            : t
        )
      );

      setIsUploading(false);
      setTaskFeedback({
        type: 'success',
        text: `Berkas "${uploadedFile.name}" berhasil dikirimkan ke server LMS!`,
      });

      setTimeout(() => {
        setActiveTaskModal(null);
        setUploadedFile(null);
        setTaskNotes('');
        setTaskFeedback(null);
      }, 1400);
    }, 900);
  };

  const handleCancelTask = (taskId) => {
    if (window.confirm('Tarik berkas tugas ini untuk mengunggah revisi baru?')) {
      setTaskSubmissions((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: 'pending', file: null } : t
        )
      );
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-[#121822] p-5 sm:p-6 rounded-xl border border-[#232f42] relative overflow-hidden shadow-xl text-slate-100">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#f59e0b]" />

        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#f59e0b] hover:text-[#fbbf24] mb-3 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          {language === 'en' ? '// RETURN TO MODULE DIRECTORY' : '// KEMBALI KE DIREKTORI MODUL'}
        </button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono font-bold text-[#00e5ff] bg-[#00e5ff]/10 border border-[#00e5ff]/30 px-2 py-0.5 rounded-xs uppercase">
                {classData.category}
              </span>
              <span className="text-[10px] font-mono font-bold text-[#f59e0b] bg-[#141d2c] border border-[#f59e0b]/30 px-2 py-0.5 rounded-xs">
                {language === 'en' ? 'CODE' : 'KODE'}: {classData.code}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-100 mt-2 font-mono">{classData.name}</h2>
            <p className="text-xs text-slate-400 mt-1 font-sans">{classData.description}</p>
          </div>

          <div className="text-left md:text-right pt-2 md:pt-0 border-t md:border-t-0 border-[#1c2638]">
            <span className="text-[10px] font-mono text-slate-400 block">
              {language === 'en' ? '// LEAD INSTRUCTOR' : '// INSTRUKTUR PENANGGUNG JAWAB'}
            </span>
            <span className="text-xs font-mono font-bold text-[#f59e0b]">{classData.instructor}</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-1.5 mt-5 pt-3 border-t border-[#1b263b] font-mono">
          <button
            onClick={() => setActiveTab('meetings')}
            className={`px-3 py-1.5 rounded-xs text-[11px] font-bold transition flex items-center gap-1.5 ${
              activeTab === 'meetings'
                ? 'bg-[#f59e0b] text-black shadow-md'
                : 'bg-[#141c2b] text-slate-300 hover:text-[#f59e0b] border border-[#212f45]'
            }`}
          >
            <BookOpen className="w-3 h-3" />
            {language === 'en' ? 'SYLLABUS' : 'SILABUS'}
          </button>
          <button
            onClick={() => setActiveTab('material')}
            className={`px-3 py-1.5 rounded-xs text-[11px] font-bold transition flex items-center gap-1.5 ${
              activeTab === 'material'
                ? 'bg-[#f59e0b] text-black shadow-md'
                : 'bg-[#141c2b] text-slate-300 hover:text-[#f59e0b] border border-[#212f45]'
            }`}
          >
            <FileText className="w-3 h-3" />
            {language === 'en' ? 'READING' : 'DELTA JSON'}
          </button>
          <button
            onClick={() => setActiveTab('video')}
            className={`px-3 py-1.5 rounded-xs text-[11px] font-bold transition flex items-center gap-1.5 ${
              activeTab === 'video'
                ? 'bg-[#f59e0b] text-black shadow-md'
                : 'bg-[#141c2b] text-slate-300 hover:text-[#f59e0b] border border-[#212f45]'
            }`}
          >
            <PlayCircle className="w-3 h-3" />
            VIDEO CDN
          </button>
          <button
            onClick={() => setActiveTab('pdf')}
            className={`px-3 py-1.5 rounded-xs text-[11px] font-bold transition flex items-center gap-1.5 ${
              activeTab === 'pdf'
                ? 'bg-[#f59e0b] text-black shadow-md'
                : 'bg-[#141c2b] text-slate-300 hover:text-[#f59e0b] border border-[#212f45]'
            }`}
          >
            <Download className="w-3 h-3" />
            MANUAL BOOK
          </button>
          <button
            onClick={() => setActiveTab('exam')}
            className={`px-3 py-1.5 rounded-xs text-[11px] font-bold transition flex items-center gap-1.5 ${
              activeTab === 'exam'
                ? 'bg-rose-500 text-white shadow-md'
                : 'bg-[#1d1219] text-rose-300 hover:bg-rose-950/60 border border-rose-800/50'
            }`}
          >
            <HelpCircle className="w-3 h-3" />
            {language === 'en' ? 'PRETEST & EXAM' : 'PRETEST & EVALUASI'}
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-3 py-1.5 rounded-xs text-[11px] font-bold transition flex items-center gap-1.5 ${
              activeTab === 'tasks'
                ? 'bg-[#f59e0b] text-black shadow-md'
                : 'bg-[#141c2b] text-slate-300 hover:text-[#f59e0b] border border-[#212f45]'
            }`}
          >
            <Upload className="w-3 h-3" />
            {language === 'en' ? 'TASKS SUBMISSION' : 'PENGUMPULAN TUGAS FILE'}
          </button>
        </div>
      </div>

      {/* TAB CONTENT: Silabus Pertemuan */}
      {activeTab === 'meetings' && (
        <div className="bg-[#121822] p-5 rounded-xl border border-[#232f42] space-y-4">
          <div className="flex items-center justify-between border-b border-[#1b263b] pb-3">
            <h3 className="text-xs font-mono font-bold text-[#f59e0b] uppercase tracking-wider">
              // DAFTAR PERTEMUAN BERTINGKAT
            </h3>
            <span className="text-[10px] font-mono text-slate-400">PRASYARAT PRETEST WAJIB</span>
          </div>

          <div className="space-y-2.5">
            {classData.meetings?.map((meet) => (
              <div
                key={meet.id}
                className={`p-3.5 rounded-sm border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  meet.status === 'completed'
                    ? 'border-emerald-500/40 bg-emerald-950/20'
                    : meet.status === 'in_progress'
                    ? 'border-[#f59e0b]/50 bg-[#172133]'
                    : 'border-[#1b2538] bg-[#0b101a] opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-7 h-7 rounded-xs flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                      meet.status === 'completed'
                        ? 'bg-emerald-500 text-black'
                        : meet.status === 'in_progress'
                        ? 'bg-[#f59e0b] text-black'
                        : 'bg-[#1e293d] text-slate-400'
                    }`}
                  >
                    0{meet.order}
                  </div>
                  <div>
                    <h4 className="text-xs font-mono font-bold text-slate-100">{meet.title}</h4>
                    <p className="text-[10px] font-mono text-slate-400 mt-0.5">Jadwal: {meet.date}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2 font-mono">
                      <span className="text-[9px] bg-[#0d1421] border border-[#212f45] px-1.5 py-0.5 rounded-xs text-slate-300">
                        {meet.pretestDone ? '✓ PRETEST SELESAI' : '✕ PRETEST BELUM'}
                      </span>
                      <span className="text-[9px] bg-[#0d1421] border border-[#212f45] px-1.5 py-0.5 rounded-xs text-slate-300">
                        {meet.posttestDone ? '✓ POST-TEST SELESAI' : '✕ POST-TEST BELUM'}
                      </span>
                      {meet.score && (
                        <span className="text-[9px] bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-bold px-1.5 py-0.5 rounded-xs">
                          SKOR: {meet.score}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center font-mono">
                  {meet.status === 'locked' ? (
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> TERKUNCI
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setSelectedMeeting(meet);
                        setActiveTab('material');
                      }}
                      className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-[11px] font-bold px-3 py-1.5 rounded-xs transition uppercase"
                    >
                      Buka Modul
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Materi Teks Delta JSON */}
      {activeTab === 'material' && (
        <div className="bg-[#121822] p-5 sm:p-6 rounded-xl border border-[#232f42] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1b263b]">
            <div>
              <span className="text-[9px] font-mono font-bold text-[#00e5ff] uppercase tracking-wider">
                // FORMAT PENYIMPANAN: QUILL DELTA JSON PROTOCOL
              </span>
              <h3 className="text-base font-mono font-bold text-slate-100 mt-0.5">
                {selectedMeeting ? selectedMeeting.title : 'Pertemuan 01: Dasar Perangkat Lunak'}
              </h3>
            </div>
            <button
              onClick={() => onNavigateAI()}
              className="bg-[#172133] hover:bg-[#202f48] text-[#f59e0b] border border-[#f59e0b]/40 text-xs font-mono font-bold px-3 py-1.5 rounded-xs transition flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#f59e0b]" />
              KONSULTASI AI
            </button>
          </div>

          <div className="text-xs sm:text-sm text-slate-300 leading-relaxed space-y-3 font-mono">
            <h4 className="text-sm font-bold text-[#f59e0b]">// 1. ARSITEKTUR KLIEN TERDISTRIBUSI</h4>
            <p className="text-slate-300">
              Arsitektur terdistribusi modern membagi beban komputasi antara klien pintar (*smart client* berbasis Flutter/React) dan lapisan komputasi awan yang *stateless*. Pendekatan ini memungkinkan ketersediaan tinggi tanpa biaya pemeliharaan server fisik.
            </p>

            <div className="p-3 bg-[#070b12] border border-[#1e2a3f] text-slate-200 rounded-xs font-mono text-[11px] overflow-x-auto">
              <span className="text-emerald-400">// Operasi Atomik Firestore (Smartsa LMS Spec)</span>
              <br />
              await updateDoc(doc(db, "classes", classId), &#123;
              <br />
              &nbsp;&nbsp;members: arrayUnion(userId),
              <br />
              &nbsp;&nbsp;updatedAt: serverTimestamp()
              <br />
              &#125;);
            </div>

            <h4 className="text-sm font-bold text-[#f59e0b]">// 2. PRINSIP ISOLASI KUNCI EVALUASI</h4>
            <p className="text-slate-300">
              Kunci jawaban soal evaluasi dievaluasi semata-mata pada sisi server (<code className="text-[#00e5ff]">/api/grade</code>). Klien tidak pernah menerima atribut kunci jawaban dalam payload HTTP untuk mengeliminasi celah kecurangan inspeksi jaringan.
            </p>

            <div className="bg-[#121b29] border-l-2 border-[#f59e0b] p-3 text-slate-300 text-xs font-mono">
              <strong className="text-[#f59e0b]">Catatan Instruktur:</strong> Selesaikan pretest terlebih dahulu sebelum membuka sesi pengerjaan penugasan kelompok.
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Video Pembelajaran */}
      {activeTab === 'video' && (
        <div className="bg-[#121822] p-5 rounded-xl border border-[#232f42] space-y-4">
          <div className="flex items-center justify-between border-b border-[#1b263b] pb-3">
            <h3 className="text-xs font-mono font-bold text-[#f59e0b] uppercase tracking-wider">
              // CDN STREAM STREAMING VIDEO
            </h3>
            <span className="text-[10px] font-mono text-[#00e5ff]">1080P ADAPTIVE HLS</span>
          </div>

          <div className="aspect-video bg-[#070b12] border border-[#1e2a3f] rounded-xs overflow-hidden relative flex items-center justify-center text-white">
            <div className="text-center p-6">
              <PlayCircle className="w-14 h-14 text-[#f59e0b] mx-auto mb-3 cursor-pointer hover:scale-110 transition drop-shadow-md" />
              <p className="text-xs sm:text-sm font-mono font-bold text-slate-100">
                Transmisi Video: Clean Architecture & Firebase Integration
              </p>
              <p className="text-[10px] font-mono text-slate-400 mt-1">
                DURASI: 24M 30S • ENKRIPSI CDN CLOUDINARY
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Manual Book PDF */}
      {activeTab === 'pdf' && (
        <div className="bg-[#121822] p-5 rounded-xl border border-[#232f42] space-y-4">
          <div className="flex items-center justify-between border-b border-[#1b263b] pb-3">
            <div>
              <h3 className="text-xs font-mono font-bold text-[#f59e0b] uppercase tracking-wider">
                // DOKUMEN PRAKTIKUM & MANUAL BOOK (PDF)
              </h3>
              <p className="text-[10px] font-mono text-slate-400">Unduh dokumen untuk akses offline tanpa koneksi internet.</p>
            </div>
            <button
              onClick={handleDownloadPdf}
              className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-mono font-bold px-3 py-1.5 rounded-xs transition flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              UNDUH OFFLINE
            </button>
          </div>

          {downloadSuccess && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 rounded-xs text-xs font-mono flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Dokumen Manual Book berhasil diunduh dan disimpan ke memori penyimpanan lokal aplikasi!
            </div>
          )}

          <div className="border border-[#1e2a3f] rounded-xs p-6 text-center bg-[#070b12]">
            <FileText className="w-10 h-10 text-[#00e5ff] mx-auto mb-2" />
            <h4 className="text-xs font-mono font-bold text-slate-200">Buku_Panduan_Praktikum_Smartsa_2026.pdf</h4>
            <p className="text-[10px] font-mono text-slate-400 mt-1">Ukuran File: 4.8 MB • 38 Halaman Dokumen</p>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Pretest & Post-Test Ujian */}
      {activeTab === 'exam' && (
        <div className="bg-[#121822] p-5 sm:p-6 rounded-xl border border-[#232f42] space-y-4">
          {!examActive && !examFinished && (
            <div className="text-center py-6 max-w-lg mx-auto space-y-3 font-mono">
              <div className="w-12 h-12 rounded-xs bg-rose-950/40 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto">
                <HelpCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-100">// SESI EVALUASI KOMPETENSI</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Evaluasi memiliki durasi 15 menit dengan autosave berkala ke serverless gateway.
                <strong className="text-rose-400 block mt-1.5">
                  ⚠️ PROTOKOL KEAMANAN: AI ASSISTANT DIKUNCI SELAMA UJIAN UNTUK MENJAGA INTEGRITAS AKADEMIK.
                </strong>
              </p>
              <div className="flex justify-center gap-2.5 pt-2">
                <button
                  onClick={() => handleStartExam('pretest')}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded-xs shadow-md transition"
                >
                  MULAI PRETEST
                </button>
                <button
                  onClick={() => handleStartExam('posttest')}
                  className="bg-[#00e5ff] hover:bg-[#33ebff] text-black text-xs font-bold px-4 py-2 rounded-xs shadow-md transition"
                >
                  MULAI POST-TEST
                </button>
              </div>
            </div>
          )}

          {/* Sesi Ujian Aktif */}
          {examActive && (
            <div className="space-y-4 font-mono">
              <div className="bg-[#090d16] border border-[#1e2a3f] text-white p-3.5 rounded-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-rose-400 uppercase">
                    {examType === 'pretest' ? '// PRETEST AKTIF' : '// POST-TEST AKTIF'}
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-[10px] text-slate-400">AUTOSAVE: AKTIF</span>
                </div>
                <div className="flex items-center gap-2 bg-rose-950/80 border border-rose-600/50 px-2.5 py-1 rounded-xs text-rose-300 text-xs font-bold">
                  <Clock className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                  <span>SISA WAKTU: {formatTimer(examTimer)}</span>
                </div>
              </div>

              <div className="p-3 bg-amber-950/40 border border-amber-500/40 text-amber-300 rounded-xs text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>LOCKOUT ACTIVE:</strong> Smartsa AIC AI Assistant dinonaktifkan secara otomatis pada sesi ini.
                </span>
              </div>

              <div className="space-y-4">
                {examQuestions.map((q, idx) => (
                  <div key={q.id} className="p-4 border border-[#1e2a3f] rounded-xs bg-[#090d16] space-y-2.5">
                    <p className="text-xs font-bold text-slate-100">
                      [SOAL 0{idx + 1}] {q.question}
                    </p>
                    <div className="space-y-1.5">
                      {q.options.map((opt, optIdx) => (
                        <label
                          key={optIdx}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xs border text-xs cursor-pointer transition ${
                            selectedAnswers[q.id] === optIdx
                              ? 'bg-[#152338] border-[#f59e0b] font-bold text-[#f59e0b]'
                              : 'bg-[#0f1624] border-[#1e2a3f] text-slate-300 hover:bg-[#141d2c]'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q_${q.id}`}
                            checked={selectedAnswers[q.id] === optIdx}
                            onChange={() => handleAnswerSelect(q.id, optIdx)}
                            className="mt-0.5 accent-[#f59e0b]"
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-3 border-t border-[#1b263b]">
                <button
                  onClick={handleExamSubmit}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-5 py-2.5 rounded-xs shadow-lg transition uppercase tracking-wider"
                >
                  KIRIM LEMBAR EVALUASI
                </button>
              </div>
            </div>
          )}

          {/* Hasil Ujian */}
          {examFinished && (
            <div className="text-center py-6 max-w-md mx-auto space-y-3 font-mono">
              <div className="w-14 h-14 rounded-xs bg-emerald-950/50 border border-emerald-500/50 text-emerald-400 flex items-center justify-center mx-auto text-xl font-bold">
                ✓
              </div>
              <h3 className="text-base font-bold text-slate-100">// EVALUASI BERHASIL DISERAHKAN</h3>
              <p className="text-xs text-slate-400">
                Lembar jawaban telah dievaluasi oleh endpoint backend <code className="text-[#00e5ff]">/api/grade</code>.
              </p>
              <div className="p-4 bg-[#070b12] border border-[#1e2a3f] rounded-xs">
                <span className="text-[10px] text-slate-400 block">// SKOR KOMPETENSI OPERATOR</span>
                <span className="text-2xl font-black text-[#f59e0b] mt-1 block">
                  {examScore} / 100
                </span>
                <span className="text-xs text-emerald-400 mt-1 inline-block">
                  STATUS: {examScore >= 75 ? 'KOMPETEN (PASS)' : 'PERLU PENDALAMAN MODUL'}
                </span>
              </div>
              <button
                onClick={() => {
                  setExamFinished(false);
                  setActiveTab('meetings');
                }}
                className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded-xs transition uppercase"
              >
                KEMBALI KE SILABUS
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: FITUR PENGUMPULAN TUGAS FILE */}
      {activeTab === 'tasks' && (
        <div className="bg-[#121822] p-5 rounded-xl border border-[#232f42] space-y-4">
          <div className="flex items-center justify-between border-b border-[#1b263b] pb-3">
            <div>
              <h3 className="text-xs font-mono font-bold text-[#f59e0b] uppercase tracking-wider">
                // PENGUMPULAN TUGAS FILE MODUL
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Kumpulkan laporan praktikum atau kode proyek dalam format PDF / ZIP
              </p>
            </div>
            <span className="text-[10px] font-mono font-bold text-[#00e5ff] bg-[#00e5ff]/10 border border-[#00e5ff]/30 px-2 py-0.5 rounded-xs">
              PORTAL TUGAS
            </span>
          </div>

          <div className="space-y-3">
            {taskSubmissions.map((task) => {
              const isDone = task.status === 'submitted';
              return (
                <div
                  key={task.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isDone
                      ? 'bg-emerald-950/20 border-emerald-500/40'
                      : 'bg-[#0a0f18] border-[#1e2a3f]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-xs uppercase ${
                            isDone
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                              : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {isDone ? 'TELAH DIKUMPULKAN ✓' : 'BELUM MENGUMPULKAN'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          Tenggat: <strong className="text-slate-300">{task.deadline}</strong>
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-100 mt-1.5">{task.title}</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">{task.note}</p>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0 font-mono">
                      {isDone ? (
                        <button
                          onClick={() => handleCancelTask(task.id)}
                          className="bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-[10px] font-bold px-3 py-1.5 rounded-xs border border-rose-500/40 transition flex items-center gap-1 uppercase"
                        >
                          <Trash2 className="w-3 h-3" />
                          Unggah Ulang
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setActiveTaskModal(task);
                            setUploadedFile(null);
                            setTaskFeedback(null);
                          }}
                          className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-[11px] font-bold px-3.5 py-1.5 rounded-xs transition flex items-center gap-1.5 uppercase shadow-md"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Unggah File
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Info File Terunggah */}
                  {isDone && task.file && (
                    <div className="mt-3 pt-3 border-t border-emerald-500/20 flex items-center justify-between text-xs font-mono text-slate-300 bg-[#070b12] p-2.5 rounded-xs">
                      <div className="flex items-center gap-2 truncate">
                        <File className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="truncate font-bold text-slate-200">{task.file.name}</span>
                        <span className="text-slate-500 text-[10px]">({task.file.size})</span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-bold shrink-0">
                        {task.file.uploadedAt}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL UPLOAD TUGAS DI DETAIL CLASS */}
      {activeTaskModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans overflow-y-auto">
          <div className="bg-[#12161f] w-full max-w-md rounded-xl shadow-2xl border border-slate-700/80 overflow-hidden relative my-auto">
            <div className="p-4 bg-[#161c24] border-b border-slate-700 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold text-[#f59e0b] uppercase tracking-wider block">
                  // PENGUNGGAHAN BERKAS TUGAS
                </span>
                <h3 className="text-sm font-bold text-slate-100 mt-0.5 truncate max-w-[280px]">
                  {activeTaskModal.title}
                </h3>
              </div>
              <button
                onClick={() => {
                  setActiveTaskModal(null);
                  setUploadedFile(null);
                  setTaskFeedback(null);
                }}
                className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {taskFeedback && (
              <div
                className={`m-4 p-3 rounded-md text-xs font-mono flex items-start gap-2 ${
                  taskFeedback.type === 'success'
                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                }`}
              >
                {taskFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <span>{taskFeedback.text}</span>
              </div>
            )}

            <form onSubmit={handleTaskFileSubmit} className="p-4 space-y-3.5">
              <div className="p-3 bg-[#0a0f18] rounded-lg border border-[#232f42] text-xs space-y-1">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">
                  PETUNJUK PENUGASAN:
                </span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  {activeTaskModal.note}
                </p>
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-[#192433]">
                  <span>Maks: {activeTaskModal.maxSize}</span>
                  <span className="text-[#f59e0b]">Format: {activeTaskModal.allowedFormats}</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-slate-300 mb-1.5 uppercase">
                  PILIH DOKUMEN TUGAS
                </label>
                <div className="border-2 border-dashed border-slate-700 hover:border-[#f59e0b] rounded-xl p-5 text-center bg-[#0d121a] transition cursor-pointer relative group">
                  <input
                    type="file"
                    accept={activeTaskModal.allowedFormats}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setUploadedFile(f);
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <FileUp className="w-8 h-8 text-[#f59e0b] mx-auto mb-2 group-hover:scale-110 transition-transform" />
                  <p className="text-xs font-bold text-slate-200">
                    {uploadedFile ? uploadedFile.name : 'Klik atau seret file PDF / ZIP ke sini'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">
                    {uploadedFile
                      ? `Ukuran: ${(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB • Siap dikirim`
                      : `Maksimal ukuran file: ${activeTaskModal.maxSize}`}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-slate-300 mb-1 uppercase">
                  CATATAN / LINK KELOMPOK (OPSIONAL)
                </label>
                <textarea
                  rows="2"
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  placeholder="Catatan pengerjaan atau tautan repositori..."
                  className="w-full p-2.5 bg-[#070b12] border border-slate-700 rounded-md text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800 font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTaskModal(null);
                    setUploadedFile(null);
                    setTaskFeedback(null);
                  }}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !uploadedFile}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded-sm transition flex items-center gap-1.5 uppercase shadow-md disabled:opacity-40"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isUploading ? 'Mengunggah Berkas...' : 'Kirim Berkas Tugas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
