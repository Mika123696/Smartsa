import { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import {
  Code2,
  Database,
  Smartphone,
  GitBranch,
  Palette,
  Layers,
  ChevronRight,
  Upload,
  FileCheck,
  FileUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  File,
  Eye,
  Trash2,
  FolderOpen,
} from 'lucide-react';
import { DEMO_SUBJECTS } from '../../services/mockData';

export default function MaterialsTab({ onSelectSubject }) {
  const { t, language } = useLanguage();
  // State tab: 'materi' atau 'tugas'
  const [activeSubTab, setActiveSubTab] = useState('materi');

  // State tugas pengumpulan file
  const [assignments, setAssignments] = useState([
    {
      id: 'asg_01',
      title: 'Tugas Praktikum 01: Implementasi OOP & Inheritance',
      subject: 'Pemrograman Berorientasi Objek',
      subjectCode: 'PBO101',
      deadline: 'Besok, 23:59 WIB',
      isOverdue: false,
      status: 'pending', // 'pending' | 'submitted'
      submittedFile: null,
      submittedAt: null,
      grade: null,
      note: 'Buatlah program aplikasi perpustakaan sederhana menggunakan konsep Inheritance dan Polimorfisme. Format laporan PDF dan lampirkan link repository GitHub.',
      maxSize: '10 MB',
      allowedFormats: '.pdf, .zip, .docx',
    },
    {
      id: 'asg_02',
      title: 'Tugas 02: Normalisasi Basis Data & Skema NoSQL',
      subject: 'Basis Data',
      subjectCode: 'BD202',
      deadline: '28 Okt 2026, 21:00 WIB',
      isOverdue: false,
      status: 'submitted',
      submittedFile: {
        name: 'Laporan_Normalisasi_BD_AhmadFaiz.pdf',
        size: '2.4 MB',
        uploadedAt: 'Kemarin, 14:20 WIB',
      },
      submittedAt: 'Kemarin, 14:20 WIB',
      grade: 92,
      note: 'Rancang ERD dan lakukan normalisasi 1NF, 2NF, hingga 3NF pada studi kasus sistem rawat jalan rumah sakit.',
      maxSize: '15 MB',
      allowedFormats: '.pdf, .zip',
    },
    {
      id: 'asg_03',
      title: 'Proyek Sesi 03: Desain UI/UX & Wireframing Mobile LMS',
      subject: 'Desain Industri & UI/UX',
      subjectCode: 'UIUX505',
      deadline: '30 Okt 2026, 23:59 WIB',
      isOverdue: false,
      status: 'pending',
      submittedFile: null,
      submittedAt: null,
      grade: null,
      note: 'Kumpulkan file PDF laporan analisis pengguna, Persona, Wireframe Lo-Fi, serta link prototype Figma.',
      maxSize: '25 MB',
      allowedFormats: '.pdf, .zip, .fig',
    },
    {
      id: 'asg_04',
      title: 'Tugas 04: Pembuatan Modul REST API & Vercel Serverless',
      subject: 'Pemrograman Web dan Perangkat Bergerak',
      subjectCode: 'PWPB303',
      deadline: '20 Okt 2026, 23:59 WIB',
      isOverdue: true,
      status: 'pending',
      submittedFile: null,
      submittedAt: null,
      grade: null,
      note: 'Implementasikan endpoint API /api/grade dan /api/join-class dengan runtime TypeScript Vercel.',
      maxSize: '10 MB',
      allowedFormats: '.pdf, .zip',
    },
  ]);

  // Modal pengumpulan tugas
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [notesInput, setNotesInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState(null);

  const getSubjectIcon = (iconType) => {
    switch (iconType) {
      case 'code':
        return Code2;
      case 'database':
        return Database;
      case 'mobile':
        return Smartphone;
      case 'git':
        return GitBranch;
      case 'palette':
        return Palette;
      case 'layers':
      default:
        return Layers;
    }
  };

  // Handle upload file di modal
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validasi ukuran misal 25MB
      if (file.size > 25 * 1024 * 1024) {
        setSubmitFeedback({
          type: 'error',
          text: 'Ukuran file melebihi batas maksimal 25 MB!',
        });
        return;
      }
      setSelectedFile(file);
      setSubmitFeedback(null);
    }
  };

  const handleSubmitAssignment = (e) => {
    e.preventDefault();
    if (!selectedFile && !selectedAssignment.submittedFile) {
      setSubmitFeedback({
        type: 'error',
        text: 'Silakan pilih berkas dokumen tugas terlebih dahulu!',
      });
      return;
    }

    setIsSubmitting(true);

    // Simulasi upload berkas ke storage (Signed Upload / Cloudinary / Firebase)
    setTimeout(() => {
      const fileData = selectedFile
        ? {
            name: selectedFile.name,
            size: `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`,
            uploadedAt: 'Baru saja',
          }
        : selectedAssignment.submittedFile;

      setAssignments((prev) =>
        prev.map((asg) =>
          asg.id === selectedAssignment.id
            ? {
                ...asg,
                status: 'submitted',
                submittedFile: fileData,
                submittedAt: 'Baru saja (Tepat Waktu)',
              }
            : asg
        )
      );

      setIsSubmitting(false);
      setSubmitFeedback({
        type: 'success',
        text: `Berkas "${fileData.name}" berhasil dikumpulkan dan diverifikasi sistem!`,
      });

      setTimeout(() => {
        setSelectedAssignment(null);
        setSelectedFile(null);
        setNotesInput('');
        setSubmitFeedback(null);
      }, 1500);
    }, 1000);
  };

  // Batalkan / Tarik Pengumpulan Tugas
  const handleCancelSubmission = (assignmentId) => {
    if (window.confirm('Apakah Anda yakin ingin membatalkan pengumpulan tugas ini dan mengunggah ulang?')) {
      setAssignments((prev) =>
        prev.map((asg) =>
          asg.id === assignmentId
            ? {
                ...asg,
                status: 'pending',
                submittedFile: null,
                submittedAt: null,
                grade: null,
              }
            : asg
        )
      );
      setSelectedAssignment(null);
    }
  };

  const pendingCount = assignments.filter((a) => a.status === 'pending').length;
  const submittedCount = assignments.filter((a) => a.status === 'submitted').length;

  return (
    <div className="space-y-5">
      {/* Tactical Header */}
      <div className="border-b border-[#222d3d] pb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono tracking-widest text-[#f59e0b] uppercase">
              <FolderOpen className="w-3.5 h-3.5 text-[#f59e0b]" />
              <span>{t('materials_repo_tag')}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight mt-0.5 font-sans">
              {t('materials_title')}
            </h1>
          </div>
          <span className="text-[10px] font-mono font-bold bg-[#141d2c] text-[#00e5ff] px-2.5 py-1 rounded-sm border border-[#00e5ff]/30">
            {t('courses_count_badge')}
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1 font-sans">
          {t('materials_subtitle')}
        </p>

        {/* Sub-Tabs: Materi Kuliah vs Pengumpulan Tugas */}
        <div className="flex gap-2 mt-4 pt-1 font-mono">
          <button
            onClick={() => setActiveSubTab('materi')}
            className={`flex-1 py-2 text-xs font-bold rounded-sm transition flex items-center justify-center gap-1.5 ${
              activeSubTab === 'materi'
                ? 'bg-[#f59e0b] text-black shadow-md'
                : 'bg-[#151c27] text-slate-400 hover:text-white border border-[#232f42]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{t('tab_modules')}</span>
          </button>

          <button
            onClick={() => setActiveSubTab('tugas')}
            className={`flex-1 py-2 text-xs font-bold rounded-sm transition flex items-center justify-center gap-1.5 relative ${
              activeSubTab === 'tugas'
                ? 'bg-[#f59e0b] text-black shadow-md'
                : 'bg-[#151c27] text-slate-400 hover:text-white border border-[#232f42]'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{t('tab_tasks')}</span>
            {pendingCount > 0 && (
              <span className="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full font-mono">
                {pendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* VIEW 1: DAFTAR MATA PELAJARAN / MODUL */}
      {activeSubTab === 'materi' && (
        <div className="space-y-3">
          {DEMO_SUBJECTS.map((subj) => {
            const Icon = getSubjectIcon(subj.iconType);
            return (
              <div
                key={subj.id}
                onClick={() => onSelectSubject(subj)}
                className="bg-[#121822] p-4 rounded-xl border border-[#232f42] hover:border-[#f59e0b] shadow-md transition-all cursor-pointer flex items-center justify-between gap-3 group relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-[#1b263b] group-hover:bg-[#f59e0b] transition-colors" />

                <div className="flex items-center gap-3.5 min-w-0 pl-1.5">
                  {/* Subject Badge Icon */}
                  <div
                    className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 border border-slate-700/60 ${subj.colorScheme.bg} ${subj.colorScheme.text}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>

                  {/* Subject Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono font-bold text-[#00e5ff] bg-[#00e5ff]/10 border border-[#00e5ff]/30 px-1.5 py-0.2 rounded-xs">
                        {subj.code}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {subj.day}, {subj.time}
                      </span>
                    </div>

                    <h3 className="text-xs sm:text-sm font-bold text-slate-100 truncate group-hover:text-[#f59e0b] transition mt-0.5">
                      {subj.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                      {subj.materialsCount} materi modul • {subj.completedCount} selesai
                    </p>

                    {/* Progress bar */}
                    <div className="w-36 sm:w-48 bg-[#1a2332] h-1.5 rounded-full overflow-hidden mt-2">
                      <div
                        className="bg-[#00897b] h-full rounded-full transition-all"
                        style={{
                          width: `${(subj.completedCount / subj.materialsCount) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Chevron Arrow */}
                <div className="text-slate-500 group-hover:text-[#f59e0b] transition shrink-0 pr-1">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW 2: FITUR PENGUMPULAN TUGAS FILE */}
      {activeSubTab === 'tugas' && (
        <div className="space-y-4">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 gap-2.5 font-mono">
            <div className="bg-[#121822] p-3 rounded-lg border border-[#232f42] flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase">// {language === 'en' ? 'PENDING' : 'BELUM KUMPUL'}</span>
                <div className="text-lg font-black text-rose-400 mt-0.5">{pendingCount} {language === 'en' ? 'Tasks' : 'Tugas'}</div>
              </div>
              <Clock className="w-5 h-5 text-rose-400/80" />
            </div>

            <div className="bg-[#121822] p-3 rounded-lg border border-[#232f42] flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase">// {language === 'en' ? 'SUBMITTED' : 'TELAH DIKIRIM'}</span>
                <div className="text-lg font-black text-emerald-400 mt-0.5">{submittedCount} {language === 'en' ? 'Tasks' : 'Tugas'}</div>
              </div>
              <FileCheck className="w-5 h-5 text-emerald-400/80" />
            </div>
          </div>

          {/* List Kartu Tugas Pengumpulan File */}
          <div className="space-y-3">
            {assignments.map((asg) => {
              const isSubmitted = asg.status === 'submitted';
              return (
                <div
                  key={asg.id}
                  className={`bg-[#121822] p-4 rounded-xl border transition-all relative overflow-hidden ${
                    isSubmitted
                      ? 'border-emerald-500/40 bg-emerald-950/10'
                      : asg.isOverdue
                      ? 'border-rose-500/50 bg-rose-950/10'
                      : 'border-[#232f42] hover:border-[#f59e0b]'
                  }`}
                >
                  {/* Status Bar Indicator */}
                  <div
                    className={`absolute top-0 left-0 w-1.5 h-full ${
                      isSubmitted
                        ? 'bg-emerald-500'
                        : asg.isOverdue
                        ? 'bg-rose-500'
                        : 'bg-[#f59e0b]'
                    }`}
                  />

                  <div className="pl-2 space-y-2.5">
                    {/* Header Tugas */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 font-mono text-[9px]">
                          <span className="font-bold text-[#00e5ff] bg-[#00e5ff]/10 border border-[#00e5ff]/30 px-1.5 py-0.2 rounded-xs">
                            {asg.subjectCode}
                          </span>
                          <span className="text-slate-400 truncate max-w-[180px]">
                            {asg.subject}
                          </span>
                        </div>
                        <h3 className="text-xs sm:text-sm font-bold text-slate-100 mt-1 font-sans">
                          {asg.title}
                        </h3>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-xs shrink-0 uppercase tracking-wider ${
                          isSubmitted
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                            : asg.isOverdue
                            ? 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
                            : 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {isSubmitted ? 'SELESAI ✓' : asg.isOverdue ? 'TERLEWAT' : 'MENUNGGU'}
                      </span>
                    </div>

                    {/* Deskripsi & Instruksi Tugas */}
                    <p className="text-[11px] text-slate-400 leading-relaxed font-sans line-clamp-2">
                      {asg.note}
                    </p>

                    {/* Info Tenggat & Format Berkas */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1e2838] text-[10px] font-mono">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>Tenggat: <strong className={asg.isOverdue && !isSubmitted ? 'text-rose-400' : 'text-slate-300'}>{asg.deadline}</strong></span>
                      </div>

                      <span className="text-slate-500">
                        Format: {asg.allowedFormats} (Maks {asg.maxSize})
                      </span>
                    </div>

                    {/* Info Berkas yang Telah Dikumpulkan */}
                    {isSubmitted && asg.submittedFile && (
                      <div className="p-2.5 bg-[#0a0f18] rounded-md border border-emerald-500/30 flex items-center justify-between gap-2 text-xs font-mono">
                        <div className="flex items-center gap-2 min-w-0">
                          <File className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold text-slate-200 truncate">
                              {asg.submittedFile.name}
                            </p>
                            <span className="text-[9px] text-slate-400">
                              {asg.submittedFile.size} • Diunggah {asg.submittedFile.uploadedAt}
                            </span>
                          </div>
                        </div>

                        {asg.grade !== null && (
                          <div className="text-right shrink-0">
                            <span className="text-[9px] text-slate-400 block">NILAI</span>
                            <span className="text-xs font-bold text-emerald-400 font-mono">
                              {asg.grade}/100
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tombol Aksi Pengumpulan */}
                    <div className="flex justify-end gap-2 pt-1 font-mono">
                      {isSubmitted ? (
                        <>
                          <button
                            onClick={() => {
                              setSelectedAssignment(asg);
                              setSelectedFile(null);
                            }}
                            className="bg-[#1c2432] hover:bg-[#253245] text-slate-300 text-[10px] font-bold px-3 py-1.5 rounded-sm border border-slate-600 transition flex items-center gap-1 uppercase"
                          >
                            <Eye className="w-3 h-3" />
                            {language === 'en' ? 'Task Details' : 'Detail Tugas'}
                          </button>
                          <button
                            onClick={() => handleCancelSubmission(asg.id)}
                            className="bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-[10px] font-bold px-2.5 py-1.5 rounded-sm border border-rose-500/40 transition flex items-center gap-1 uppercase"
                          >
                            <Trash2 className="w-3 h-3" />
                            {t('task_reupload_btn')}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedAssignment(asg);
                            setSelectedFile(null);
                            setSubmitFeedback(null);
                          }}
                          className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-[11px] font-bold px-4 py-1.5 rounded-sm transition flex items-center gap-1.5 uppercase tracking-wide shadow-md"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          {t('task_submit_btn')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL PENGUMPULAN BERKAS TUGAS */}
      {selectedAssignment && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans overflow-y-auto">
          <div className="bg-[#12161f] w-full max-w-md rounded-xl shadow-2xl border border-slate-700/80 overflow-hidden relative my-auto animate-in fade-in zoom-in-95 duration-200">
            {/* Top Hazard Accent */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#f59e0b]" />

            {/* Header Modal */}
            <div className="p-4 bg-[#161c24] border-b border-slate-700 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold text-[#f59e0b] uppercase tracking-wider block">
                  {t('task_modal_tag')}
                </span>
                <h3 className="text-sm font-bold text-slate-100 mt-0.5 truncate max-w-[280px]">
                  {selectedAssignment.title}
                </h3>
              </div>
              <button
                onClick={() => {
                  setSelectedAssignment(null);
                  setSelectedFile(null);
                  setSubmitFeedback(null);
                }}
                className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Feedback Alert */}
            {submitFeedback && (
              <div
                className={`m-4 p-3 rounded-md text-xs font-mono flex items-start gap-2 ${
                  submitFeedback.type === 'success'
                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                }`}
              >
                {submitFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <span>{submitFeedback.text}</span>
              </div>
            )}

            {/* Body Form */}
            <form onSubmit={handleSubmitAssignment} className="p-4 space-y-3.5">
              {/* Petunjuk Tugas */}
              <div className="p-3 bg-[#0a0f18] rounded-lg border border-[#232f42] text-xs space-y-1">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">
                  PETUNJUK PENUGASAN:
                </span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  {selectedAssignment.note}
                </p>
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-[#192433]">
                  <span>Maks: {selectedAssignment.maxSize}</span>
                  <span className="text-[#f59e0b]">Tenggat: {selectedAssignment.deadline}</span>
                </div>
              </div>

              {/* Upload Dropzone */}
              <div>
                <label className="block text-[11px] font-mono font-bold text-slate-300 mb-1.5 uppercase">
                  PILIH DOKUMEN LAPORAN / KODE ({selectedAssignment.allowedFormats})
                </label>

                <div className="border-2 border-dashed border-slate-700 hover:border-[#f59e0b] rounded-xl p-5 text-center bg-[#0d121a] transition cursor-pointer relative group">
                  <input
                    type="file"
                    accept={selectedAssignment.allowedFormats}
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <FileUp className="w-8 h-8 text-[#f59e0b] mx-auto mb-2 group-hover:scale-110 transition-transform" />
                  <p className="text-xs font-bold text-slate-200">
                    {selectedFile ? selectedFile.name : (language === 'en' ? 'Click or drag files here' : 'Klik atau seret berkas ke sini')}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">
                    {selectedFile
                      ? (language === 'en' ? `Size: ${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to turn in` : `Ukuran: ${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Siap dikirim`)
                      : (language === 'en' ? `Supports format ${selectedAssignment.allowedFormats}` : `Mendukung format ${selectedAssignment.allowedFormats}`)}
                  </p>
                </div>
              </div>

              {/* Catatan Tambahan Mahasiswa */}
              <div>
                <label className="block text-[11px] font-mono font-bold text-slate-300 mb-1 uppercase">
                  {language === 'en' ? 'NOTES / REPOSITORY LINK (OPTIONAL)' : 'CATATAN / LINK REPOSITORY (OPSIONAL)'}
                </label>
                <textarea
                  rows="2"
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder={language === 'en' ? 'Attach GitHub repo link, group notes, or task summary...' : 'Lampirkan tautan GitHub, catatan kelompok, atau ringkasan pengerjaan...'}
                  className="w-full p-2.5 bg-[#070b12] border border-slate-700 rounded-md text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
                ></textarea>
              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800 font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAssignment(null);
                    setSelectedFile(null);
                    setSubmitFeedback(null);
                  }}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || (!selectedFile && !selectedAssignment.submittedFile)}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded-sm transition flex items-center gap-1.5 uppercase shadow-md disabled:opacity-40"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isSubmitting ? (language === 'en' ? 'Uploading File...' : 'Mengunggah Berkas...') : t('task_turn_in_btn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
