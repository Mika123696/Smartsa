import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  CheckCircle2,
  Search,
  Edit3,
  X,
  Save,
  UserCheck,
  QrCode,
  ChevronDown,
  ChevronUp,
  BookOpen,
} from 'lucide-react';
import { DEMO_CLASSES } from '../../services/mockData';
import {
  ATTENDANCE_STATUSES,
  getCourseAttendance,
  saveCourseAttendance,
  getCourseStudents,
  saveCourseStudents,
  calculateStudentAttendanceSummary,
  calculateFinalScore,
} from '../../services/dosenClassService';
import QrAttendanceWidget from './QrAttendanceWidget';

export default function DosenKelasPage({
  initialMatkulId,
  initialPertemuan = 1,
  onOpenCourseMateri,
}) {
  const [selectedMatkulId, setSelectedMatkulId] = useState(
    initialMatkulId || DEMO_CLASSES[0]?.id || 'subj_pbo'
  );
  const [selectedPertemuan, setSelectedPertemuan] = useState(Number(initialPertemuan) || 1);
  const [showQrPanel, setShowQrPanel] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // State Mahasiswa (20 Siswa) & Presensi Manual untuk Mata Kuliah Terpilih
  const [students, setStudents] = useState(() => getCourseStudents(selectedMatkulId));
  const [attendanceRecords, setAttendanceRecords] = useState(() =>
    getCourseAttendance(selectedMatkulId)
  );

  // Modal Edit Nilai Mahasiswa
  const [editingStudent, setEditingStudent] = useState(null);
  const [editTugas, setEditTugas] = useState('');
  const [editUts, setEditUts] = useState('');
  const [editUas, setEditUas] = useState('');
  const [editCatatan, setEditCatatan] = useState('');

  // Sinkronisasi ulang jika dosen berpindah ke mata kuliah lain
  const handleSelectMatkul = (nextId) => {
    setSelectedMatkulId(nextId);
    setStudents(getCourseStudents(nextId));
    setAttendanceRecords(getCourseAttendance(nextId));
  };

  // Sinkronisasi apabila state presensi/mahasiswa berubah dari komponen lain
  useEffect(() => {
    const syncAttendance = (e) => {
      if (!e?.detail?.matkulId || e.detail.matkulId === selectedMatkulId) {
        setAttendanceRecords(getCourseAttendance(selectedMatkulId));
      }
    };
    const syncStudents = (e) => {
      if (!e?.detail?.matkulId || e.detail.matkulId === selectedMatkulId) {
        setStudents(getCourseStudents(selectedMatkulId));
      }
    };
    window.addEventListener('smartsa_dosen_attendance_updated', syncAttendance);
    window.addEventListener('smartsa_dosen_students_updated', syncStudents);
    return () => {
      window.removeEventListener('smartsa_dosen_attendance_updated', syncAttendance);
      window.removeEventListener('smartsa_dosen_students_updated', syncStudents);
    };
  }, [selectedMatkulId]);

  const activeCourse =
    DEMO_CLASSES.find((c) => c.id === selectedMatkulId) || DEMO_CLASSES[0];

  const currentMeetingAttendance = useMemo(
    () => attendanceRecords[selectedPertemuan] || {},
    [attendanceRecords, selectedPertemuan]
  );

  const handleSetStudentAttendance = (studentId, status) => {
    const nextMeetingRecord = {
      ...currentMeetingAttendance,
      [studentId]: status,
    };
    const nextRecords = {
      ...attendanceRecords,
      [selectedPertemuan]: nextMeetingRecord,
    };
    setAttendanceRecords(nextRecords);
    saveCourseAttendance(selectedMatkulId, nextRecords);
  };

  const handleMarkAllPresent = () => {
    const allPresent = {};
    students.forEach((st) => {
      allPresent[st.id] = 'Hadir';
    });
    const nextRecords = {
      ...attendanceRecords,
      [selectedPertemuan]: allPresent,
    };
    setAttendanceRecords(nextRecords);
    saveCourseAttendance(selectedMatkulId, nextRecords);
  };

  const openEditStudentModal = (student) => {
    setEditingStudent(student);
    setEditTugas(String(student.nilaiTugas ?? 0));
    setEditUts(String(student.nilaiUTS ?? 0));
    setEditUas(String(student.nilaiUAS ?? 0));
    setEditCatatan(student.catatan || '');
  };

  const handleSaveStudentGrades = (e) => {
    e.preventDefault();
    if (!editingStudent) return;

    const clampScore = (val) => Math.max(0, Math.min(100, Number(val) || 0));
    const updated = students.map((st) =>
      st.id === editingStudent.id
        ? {
            ...st,
            nilaiTugas: clampScore(editTugas),
            nilaiUTS: clampScore(editUts),
            nilaiUAS: clampScore(editUas),
            catatan: editCatatan.trim(),
          }
        : st
    );
    setStudents(updated);
    saveCourseStudents(selectedMatkulId, updated);
    setEditingStudent(null);
  };

  const attendanceStats = useMemo(() => {
    const counts = { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0, Belum: 0 };
    students.forEach((s) => {
      const st = currentMeetingAttendance[s.id];
      if (st && counts[st] !== undefined) {
        counts[st] += 1;
      } else {
        counts.Belum += 1;
      }
    });
    return counts;
  }, [students, currentMeetingAttendance]);

  const classAverageScore = useMemo(() => {
    if (students.length === 0) return '0.0';
    const sum = students.reduce((acc, st) => acc + calculateFinalScore(st).finalNum, 0);
    return (sum / students.length).toFixed(1);
  }, [students]);

  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.nim.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.classGroup.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const meetingPad = selectedPertemuan < 10 ? `0${selectedPertemuan}` : selectedPertemuan;

  return (
    <div className="space-y-4 font-sans pb-8">
      {/* Header Halaman Kelas & Presensi Manual Dosen */}
      <div className="bg-[#121822] p-4 sm:p-5 rounded-xl border border-[#232f42] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#f59e0b] via-[#00e5ff] to-[#f59e0b]" />

        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <span className="text-[10px] font-mono font-bold text-[#f59e0b] uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>// MENU KELAS • PRESENSI &amp; DAFTAR MAHASISWA</span>
            </span>
            <h1 className="text-lg sm:text-xl font-black text-slate-100 mt-1">
              Kelola Kelas &amp; Presensi Manual
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Atur kehadiran manual ({students.length} mahasiswa terdaftar), sesi QR Code, dan rekap nilai per pertemuan.
            </p>
          </div>

          {onOpenCourseMateri && activeCourse && (
            <button
              type="button"
              onClick={() => onOpenCourseMateri(activeCourse)}
              className="px-3 py-1.5 rounded-lg bg-[#172133] hover:bg-[#20304a] text-[#00e5ff] border border-[#00e5ff]/35 text-[11px] font-mono font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Materi Matkul</span>
            </button>
          )}
        </div>

        {/* Filter Mata Kuliah & Pertemuan */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-4 pt-3.5 border-t border-[#1c2738]">
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase mb-1">
              Pilih Mata Kuliah
            </label>
            <select
              value={selectedMatkulId}
              onChange={(e) => handleSelectMatkul(e.target.value)}
              className="w-full px-3 py-2 bg-[#0a0f18] border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-[#f59e0b]"
            >
              {DEMO_CLASSES.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  [{cls.code}] {cls.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase mb-1">
              Pertemuan Ke-
            </label>
            <select
              value={selectedPertemuan}
              onChange={(e) => setSelectedPertemuan(Number(e.target.value))}
              className="w-full px-3 py-2 bg-[#0a0f18] border border-slate-700 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-[#f59e0b]"
            >
              {Array.from({ length: 16 }, (_, idx) => idx + 1).map((p) => (
                <option key={p} value={p}>
                  Pertemuan {p < 10 ? `0${p}` : p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Ringkasan Statistik Pertemuan & Nilai Kelas */}
        <div className="grid grid-cols-5 gap-1.5 mt-3.5 font-mono text-center">
          <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/30">
            <span className="text-sm sm:text-base font-black text-emerald-400 block">
              {attendanceStats.Hadir}
            </span>
            <span className="text-[9px] text-emerald-200 uppercase">Hadir</span>
          </div>
          <div className="p-2 rounded-lg bg-sky-950/40 border border-sky-500/30">
            <span className="text-sm sm:text-base font-black text-sky-400 block">
              {attendanceStats.Izin}
            </span>
            <span className="text-[9px] text-sky-200 uppercase">Izin</span>
          </div>
          <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-500/30">
            <span className="text-sm sm:text-base font-black text-amber-400 block">
              {attendanceStats.Sakit}
            </span>
            <span className="text-[9px] text-amber-200 uppercase">Sakit</span>
          </div>
          <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-500/30">
            <span className="text-sm sm:text-base font-black text-rose-400 block">
              {attendanceStats.Alpa}
            </span>
            <span className="text-[9px] text-rose-200 uppercase">Alpa</span>
          </div>
          <div className="p-2 rounded-lg bg-[#18150c] border border-[#f59e0b]/40">
            <span className="text-sm sm:text-base font-black text-[#f59e0b] block">
              {classAverageScore}
            </span>
            <span className="text-[9px] text-amber-200 uppercase">Rata2</span>
          </div>
        </div>
      </div>

      {/* Toggle Generator QR Code Terintegrasi di Halaman Kelas */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowQrPanel((prev) => !prev)}
          className="w-full p-3 rounded-xl bg-[#121822] hover:bg-[#162030] border border-[#232f42] flex items-center justify-between text-xs font-mono font-bold text-[#00e5ff] transition cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <QrCode className="w-4 h-4" />
            <span>Sesi QR Code Presensi (Pertemuan {meetingPad})</span>
          </span>
          {showQrPanel ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {showQrPanel && (
          <QrAttendanceWidget
            matkulId={selectedMatkulId}
            matkulCode={activeCourse?.code}
            selectedPertemuan={selectedPertemuan}
          />
        )}
      </div>

      {/* Daftar 20 Mahasiswa + Presensi Manual Per Pertemuan */}
      <div className="bg-[#121822] p-4 rounded-xl border border-[#232f42] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1c2738] pb-2.5">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#f59e0b]" />
            <div>
              <h2 className="text-xs font-mono font-bold text-slate-100 uppercase">
                Daftar 20 Mahasiswa &amp; Presensi Manual (P{meetingPad})
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={handleMarkAllPresent}
            className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold flex items-center gap-1 transition cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Tandai Semua Hadir</span>
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari mahasiswa berdasarkan nama, NIM, atau kelas..."
            className="w-full pl-8 pr-3 py-2 bg-[#0a0f18] border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#f59e0b]"
          />
        </div>

        <div className="space-y-2.5">
          {filteredStudents.map((st, idx) => {
            const currentStatus = currentMeetingAttendance[st.id] || '';
            const attSummary = calculateStudentAttendanceSummary(attendanceRecords, st.id);
            const { finalNum, grade } = calculateFinalScore(st);

            return (
              <div
                key={st.id}
                className="p-3 rounded-xl bg-[#0b1019] border border-[#1f2c40] hover:border-[#2d405c] transition space-y-2.5"
              >
                {/* Identitas Mahasiswa & Rekap Singkat */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-[#182334] border border-[#283952] text-[#f59e0b] font-mono font-bold text-[11px] flex items-center justify-center shrink-0">
                      {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="text-xs sm:text-sm font-bold text-slate-100 truncate">
                          {st.name}
                        </h3>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-950/50 text-emerald-300 border border-emerald-500/30">
                          Hadir {attSummary.percent}%
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                        NIM: {st.nim} • {st.classGroup} • Nilai: {finalNum} ({grade})
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openEditStudentModal(st)}
                    className="px-2 py-1 rounded-lg bg-[#182334] hover:bg-[#23324a] text-[#00e5ff] border border-[#00e5ff]/30 text-[10px] font-mono font-bold flex items-center gap-1 transition cursor-pointer shrink-0"
                    title="Edit nilai Tugas/UTS/UAS"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Nilai</span>
                  </button>
                </div>

                {/* Tombol Presensi Manual untuk Pertemuan yang Dipilih */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#182234]">
                  <span className="text-[10px] font-mono text-slate-400">
                    Status P{meetingPad}:{' '}
                    <strong className="text-slate-200">
                      {currentStatus || 'Belum Diisi'}
                    </strong>
                  </span>

                  <div className="flex items-center gap-1 font-mono">
                    {ATTENDANCE_STATUSES.map((opt) => {
                      const isActive = currentStatus === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => handleSetStudentAttendance(st.id, opt.key)}
                          className={`px-2 py-1 rounded text-[10px] border transition cursor-pointer ${
                            isActive
                              ? opt.activeClass
                              : 'bg-[#121a28] text-slate-400 border-[#223047] hover:text-slate-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Edit Nilai Mahasiswa */}
      {editingStudent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#121822] w-full max-w-md rounded-xl border border-[#232f42] shadow-2xl overflow-hidden text-slate-100">
            <div className="p-4 border-b border-[#1c2738] flex items-center justify-between bg-[#161e2b]">
              <div>
                <span className="text-[9px] font-mono font-bold text-[#f59e0b] uppercase block">
                  // INPUT &amp; REVISI NILAI MAHASISWA
                </span>
                <h3 className="text-sm font-bold text-slate-100">
                  {editingStudent.name} ({editingStudent.nim})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="w-7 h-7 rounded-lg bg-[#1d283a] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStudentGrades} className="p-4 space-y-3.5">
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-300 mb-1 uppercase">
                    Tugas (30%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editTugas}
                    onChange={(e) => setEditTugas(e.target.value)}
                    className="w-full px-2.5 py-2 bg-[#0a0f18] border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-[#f59e0b] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-300 mb-1 uppercase">
                    UTS (35%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editUts}
                    onChange={(e) => setEditUts(e.target.value)}
                    className="w-full px-2.5 py-2 bg-[#0a0f18] border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-[#f59e0b] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-300 mb-1 uppercase">
                    UAS (35%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editUas}
                    onChange={(e) => setEditUas(e.target.value)}
                    className="w-full px-2.5 py-2 bg-[#0a0f18] border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-[#f59e0b] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-300 mb-1 uppercase">
                  Catatan Evaluasi Dosen
                </label>
                <textarea
                  rows={2}
                  value={editCatatan}
                  onChange={(e) => setEditCatatan(e.target.value)}
                  placeholder="Catatan perkembangan belajar mahasiswa..."
                  className="w-full px-3 py-2 bg-[#0a0f18] border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#00e5ff]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#1c2738]">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-3.5 py-2 rounded-lg text-xs font-mono text-slate-400 hover:text-white bg-[#162030] cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-mono font-bold bg-[#f59e0b] hover:bg-[#d97706] text-black flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Nilai</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
