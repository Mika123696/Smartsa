import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  BookOpen,
  QrCode,
  Plus,
  FileText,
  PenTool,
  ExternalLink,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Users,
} from 'lucide-react';
import { getInitialCourseMaterials } from '../../services/mockData';
import {
  getCourseAttendance,
  getCourseStudents,
} from '../../services/dosenClassService';
import MateriUpload from './MateriUpload';
import RichNoteRenderer from './RichNoteRenderer';
import QrAttendanceWidget from './QrAttendanceWidget';

export default function DosenCourseDetailPage({
  matkul,
  onBack,
  onNavigateAI,
  onNavigateKelas,
}) {
  const matkulId = matkul?.id || 'subj_pbo';
  const matkulCode = matkul?.code || 'MK101';
  const matkulName = matkul?.name || matkul?.title || 'Mata Kuliah';

  // Tab Navigasi Sederhana (Fokus Materi Perkuliahan + Opsi Cepat QR Presensi)
  const [activeTab, setActiveTab] = useState('materi'); // 'materi' | 'qr'

  // State Materi Perkuliahan (Dual Input + Arsip Materi per Matkul)
  const materialsStorageKey = `smartsa_course_materials_${matkulId}`;
  const [materials, setMaterials] = useState(() => {
    try {
      const saved = localStorage.getItem(materialsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback
    }
    return getInitialCourseMaterials(matkulId, matkulName);
  });
  const [showMaterialForm, setShowMaterialForm] = useState(true);
  const [expandedMaterialId, setExpandedMaterialId] = useState(null);

  // State Pertemuan & Sinkronisasi Kehadiran dari Halaman Kelas
  const [qrPertemuan, setQrPertemuan] = useState(1);
  const [attendanceRecords, setAttendanceRecords] = useState(() =>
    getCourseAttendance(matkulId)
  );
  const students = useMemo(() => getCourseStudents(matkulId), [matkulId]);

  useEffect(() => {
    const syncAttendance = (e) => {
      if (!e?.detail?.matkulId || e.detail.matkulId === matkulId) {
        setAttendanceRecords(getCourseAttendance(matkulId));
      }
    };
    window.addEventListener('smartsa_dosen_attendance_updated', syncAttendance);
    return () => window.removeEventListener('smartsa_dosen_attendance_updated', syncAttendance);
  }, [matkulId]);

  const persistMaterials = (nextList) => {
    setMaterials(nextList);
    try {
      localStorage.setItem(materialsStorageKey, JSON.stringify(nextList));
    } catch (err) {
      console.warn('Gagal menyimpan materi mata kuliah:', err);
    }
  };

  const handleAddMaterial = (newMateri) => {
    const updated = [newMateri, ...materials];
    persistMaterials(updated);
    setExpandedMaterialId(newMateri.id);
  };

  const handleDeleteMaterial = (id) => {
    if (window.confirm('Hapus materi ini dari halaman mata kuliah?')) {
      const target = materials.find((m) => m.id === id);
      if (target?.pdfBlobUrl) {
        URL.revokeObjectURL(target.pdfBlobUrl);
      }
      persistMaterials(materials.filter((m) => m.id !== id));
    }
  };

  const meetingAttendanceCounts = useMemo(() => {
    const meetingMap = attendanceRecords[qrPertemuan] || {};
    const counts = { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0 };
    students.forEach((st) => {
      const status = meetingMap[st.id];
      if (status && counts[status] !== undefined) {
        counts[status] += 1;
      }
    });
    return counts;
  }, [attendanceRecords, qrPertemuan, students]);

  return (
    <div className="space-y-4 font-sans pb-8">
      {/* Header Detail Mata Kuliah */}
      <div className="bg-[#121822] p-4 sm:p-5 rounded-xl border border-[#232f42] relative overflow-hidden shadow-xl text-slate-100">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#f59e0b] via-[#fbbf24] to-[#00e5ff]" />

        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#f59e0b] hover:text-[#fbbf24] transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>// KEMBALI KE DASHBOARD DOSEN</span>
          </button>

          <span className="text-[10px] font-mono text-slate-400 bg-[#0b1019] border border-[#1f2c40] px-2 py-0.5 rounded">
            /dosen/mata-kuliah/{matkulId}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-[#00e5ff] bg-[#00e5ff]/10 border border-[#00e5ff]/30 px-2 py-0.5 rounded-xs uppercase">
              KODE: {matkulCode}
            </span>
            <span className="text-[10px] font-mono font-bold text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/30 px-2 py-0.5 rounded-xs">
              {materials.length} MATERI TERPUBLIKASI
            </span>
          </div>

          <h1 className="text-lg sm:text-xl font-black text-slate-100 tracking-tight">
            {matkulName}
          </h1>

          {matkul?.description && (
            <p className="text-xs text-slate-400 leading-relaxed">
              {matkul.description}
            </p>
          )}
        </div>

        {/* Navigasi Tab Sederhana (Tanpa Tumpang Tindih dengan Menu Kelas) */}
        <div className="grid grid-cols-2 gap-2 mt-4 pt-3.5 border-t border-[#1c2738] font-mono">
          <button
            type="button"
            onClick={() => setActiveTab('materi')}
            className={`px-3 py-2.5 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
              activeTab === 'materi'
                ? 'bg-[#f59e0b] text-black border-[#f59e0b] shadow-md'
                : 'bg-[#141c2b] text-slate-300 hover:text-[#f59e0b] border-[#212f45]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span>Materi Perkuliahan</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            className={`px-3 py-2.5 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
              activeTab === 'qr'
                ? 'bg-[#f59e0b] text-black border-[#f59e0b] shadow-md'
                : 'bg-[#141c2b] text-slate-300 hover:text-[#f59e0b] border-[#212f45]'
            }`}
          >
            <QrCode className="w-3.5 h-3.5 shrink-0" />
            <span>QR Presensi Cepat</span>
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* TAB 1 (FOKUS UTAMA): MATERI PERKULIAHAN (TEKS RANGKUMAN & PDF)      */}
      {/* =================================================================== */}
      {activeTab === 'materi' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#121822] p-3.5 rounded-xl border border-[#232f42]">
            <div>
              <span className="text-[10px] font-mono font-bold text-[#00e5ff] uppercase block">
                // FOKUS UTAMA: MATERI PERKULIAHAN
              </span>
              <h2 className="text-sm font-bold text-slate-100">
                Rangkuman Teks &amp; Dokumen PDF ({materials.length})
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {onNavigateAI && (
                <button
                  type="button"
                  onClick={onNavigateAI}
                  className="px-3 py-1.5 rounded-lg bg-[#172133] hover:bg-[#1f2e47] text-[#00e5ff] border border-[#00e5ff]/30 text-[11px] font-mono font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Draf</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowMaterialForm((prev) => !prev)}
                className="px-3 py-1.5 rounded-lg bg-[#f59e0b] hover:bg-[#d97706] text-black text-[11px] font-mono font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showMaterialForm ? 'Tutup Form' : 'Tambah Materi'}</span>
              </button>
            </div>
          </div>

          {showMaterialForm && (
            <MateriUpload
              matkulId={matkulId}
              matkulCode={matkulCode}
              matkulName={matkulName}
              onSubmitMateri={handleAddMaterial}
              onCancel={() => setShowMaterialForm(false)}
            />
          )}

          {/* Arsip Materi Mata Kuliah */}
          <div className="bg-[#121822] p-4 rounded-xl border border-[#232f42] space-y-3">
            <h3 className="text-xs font-mono font-bold text-[#f59e0b] uppercase tracking-wider border-b border-[#1c2738] pb-2">
              // ARSIP MATERI TERPUBLIKASI ({materials.length})
            </h3>

            {materials.length === 0 ? (
              <div className="text-center py-8 bg-[#0b1019] rounded-lg border border-dashed border-[#243247]">
                <BookOpen className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-300">Belum Ada Materi Dipublikasikan</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Tambahkan rangkuman teks atau dokumen PDF melalui form di atas.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {materials.map((mat) => {
                  const isTextMode = mat.mode === 'text';
                  const isExpanded = expandedMaterialId === mat.id;

                  return (
                    <div
                      key={mat.id}
                      className="p-3.5 rounded-xl bg-[#0b1019] border border-[#1f2c40] hover:border-[#2e405c] transition space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                              isTextMode
                                ? 'bg-[#0b2330] text-[#00e5ff] border-[#00e5ff]/30'
                                : 'bg-[#241808] text-[#f59e0b] border-[#f59e0b]/30'
                            }`}
                          >
                            {isTextMode ? (
                              <PenTool className="w-4 h-4" />
                            ) : (
                              <FileText className="w-4 h-4" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 font-mono">
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#162033] text-slate-200 border border-[#25354f]">
                                PERTEMUAN {mat.pertemuan < 10 ? `0${mat.pertemuan}` : mat.pertemuan}
                              </span>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                  isTextMode
                                    ? 'bg-[#00e5ff]/15 text-[#00e5ff]'
                                    : 'bg-[#f59e0b]/15 text-[#f59e0b]'
                                }`}
                              >
                                {isTextMode ? 'RANGKUMAN TEKS' : 'DOKUMEN PDF'}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                • {mat.createdAt} {mat.createdAtTime || ''}
                              </span>
                            </div>

                            <h4 className="text-xs sm:text-sm font-bold text-slate-100 mt-1">
                              {mat.judul}
                            </h4>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {mat.deskripsi}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteMaterial(mat.id)}
                          className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-500/30 transition cursor-pointer shrink-0"
                          title="Hapus materi"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {isTextMode && (
                        <div className="pt-1 border-t border-[#182234]">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedMaterialId(isExpanded ? null : mat.id)
                            }
                            className="text-[11px] font-mono font-bold text-[#00e5ff] hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="w-3.5 h-3.5" />
                                <span>Tutup Rangkuman Materi</span>
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3.5 h-3.5" />
                                <span>Baca Rangkuman Lengkap</span>
                              </>
                            )}
                          </button>

                          {isExpanded && (
                            <div className="mt-2.5 p-3.5 rounded-lg bg-[#101724] border border-[#223149]">
                              <RichNoteRenderer content={mat.kontenTeks} />
                            </div>
                          )}
                        </div>
                      )}

                      {!isTextMode && (
                        <div className="pt-2 border-t border-[#182234] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                          <div className="flex items-center gap-2 text-slate-300 min-w-0">
                            <FileText className="w-3.5 h-3.5 text-[#f59e0b] shrink-0" />
                            <span className="truncate font-semibold">{mat.fileName}</span>
                            {mat.fileSize && (
                              <span className="text-[10px] text-slate-500 shrink-0">
                                ({mat.fileSize})
                              </span>
                            )}
                          </div>

                          {mat.pdfBlobUrl ? (
                            <a
                              href={mat.pdfBlobUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded bg-[#152236] hover:bg-[#1e314d] text-[#00e5ff] border border-[#00e5ff]/40 text-[10px] font-bold flex items-center gap-1 transition"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Buka PDF</span>
                            </a>
                          ) : (
                            <span className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded">
                              Tersinkron ke Modul
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: GENERATOR SESI QR PRESENSI CEPAT + PINTASAN KE HALAMAN KELAS */}
      {/* =================================================================== */}
      {activeTab === 'qr' && (
        <div className="space-y-4">
          <div className="bg-[#121822] p-4 rounded-xl border border-[#232f42] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-mono font-bold text-[#00e5ff] uppercase block">
                  // SESI QR PRESENSI CEPAT
                </span>
                <h2 className="text-sm font-bold text-slate-100">
                  Pilih Pertemuan &amp; Status Sinkron ({students.length} Mahasiswa)
                </h2>
              </div>

              <select
                value={qrPertemuan}
                onChange={(e) => setQrPertemuan(Number(e.target.value))}
                className="px-3 py-2 bg-[#0a0f18] border border-slate-700 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-[#f59e0b]"
              >
                {Array.from({ length: 16 }, (_, idx) => idx + 1).map((p) => (
                  <option key={p} value={p}>
                    Pertemuan {p < 10 ? `0${p}` : p}
                  </option>
                ))}
              </select>
            </div>

            {/* Ringkasan sinkron dari data presensi di halaman Kelas */}
            <div className="grid grid-cols-4 gap-2 font-mono text-center">
              <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/30">
                <span className="text-base font-black text-emerald-400 block">
                  {meetingAttendanceCounts.Hadir}
                </span>
                <span className="text-[9px] text-emerald-200 uppercase">Hadir</span>
              </div>
              <div className="p-2 rounded-lg bg-sky-950/40 border border-sky-500/30">
                <span className="text-base font-black text-sky-400 block">
                  {meetingAttendanceCounts.Izin}
                </span>
                <span className="text-[9px] text-sky-200 uppercase">Izin</span>
              </div>
              <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-500/30">
                <span className="text-base font-black text-amber-400 block">
                  {meetingAttendanceCounts.Sakit}
                </span>
                <span className="text-[9px] text-amber-200 uppercase">Sakit</span>
              </div>
              <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-500/30">
                <span className="text-base font-black text-rose-400 block">
                  {meetingAttendanceCounts.Alpa}
                </span>
                <span className="text-[9px] text-rose-200 uppercase">Alpa</span>
              </div>
            </div>
          </div>

          <QrAttendanceWidget
            matkulId={matkulId}
            matkulCode={matkulCode}
            selectedPertemuan={qrPertemuan}
            onOpenKelas={
              onNavigateKelas
                ? () => onNavigateKelas(matkulId, qrPertemuan)
                : undefined
            }
          />

          {onNavigateKelas && (
            <button
              type="button"
              onClick={() => onNavigateKelas(matkulId, qrPertemuan)}
              className="w-full p-3.5 rounded-xl bg-[#182334] hover:bg-[#22314a] border border-[#f59e0b]/40 text-xs font-mono font-bold text-[#f59e0b] flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Users className="w-4 h-4" />
              <span>Buka Presensi Manual &amp; Daftar 20 Mahasiswa di Menu Kelas</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
