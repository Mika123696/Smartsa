import { ROLES } from '../constants/roles';

export const DEMO_USERS = {
  student: {
    uid: 'demo_mhs_01',
    email: 'mhs@smartsa.edu',
    displayName: 'Mahasiswa Demo',
    role: ROLES.STUDENT,
    institution: 'Universitas Negeri Surabaya',
    nim: '25050974001',
    photoURL: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
    emailVerified: true,
  },
  lecturer: {
    uid: 'demo_dsn_01',
    email: 'dosen@smartsa.edu',
    displayName: 'Dr. Andi Saputra',
    role: ROLES.LECTURER,
    institution: 'Fakultas Teknik Informatika',
    nidn: '0012058402',
    photoURL: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=120&q=80',
    emailVerified: true,
  },
};

// Mata Pelajaran / Modul sesuai Screenshot
export const DEMO_SUBJECTS = [
  {
    id: 'subj_pbo',
    title: 'Pemrograman Berorientasi Objek',
    lecturer: 'Dr. Andi Saputra',
    code: 'PBO101',
    day: 'Senin',
    time: '08.00–10.30',
    iconType: 'code',
    materialsCount: 5,
    completedCount: 0,
    colorScheme: {
      bg: 'bg-blue-50/80',
      text: 'text-blue-600',
      border: 'border-blue-100',
    },
    description: 'Konsep dasar OOP, Enkapsulasi, Inheritansi, Polimorfisme, dan Abstraksi dengan Java & Dart.',
  },
  {
    id: 'subj_bd',
    title: 'Basis Data',
    lecturer: 'Ir. Rina Wijaya',
    code: 'BD202',
    day: 'Senin',
    time: '13.00–15.30',
    iconType: 'database',
    materialsCount: 5,
    completedCount: 0,
    colorScheme: {
      bg: 'bg-teal-50/80',
      text: 'text-teal-600',
      border: 'border-teal-100',
    },
    description: 'Perancangan ERD, Relational Schema, Normalisasi, SQL Lanjut, dan Pengantar NoSQL Firestore.',
  },
  {
    id: 'subj_pwmb',
    title: 'Pemrograman Web dan Perangkat Bergerak',
    lecturer: 'Budi Hartono, M.T.',
    code: 'PWPB303',
    day: 'Selasa',
    time: '08.00–10.30',
    iconType: 'mobile',
    materialsCount: 5,
    completedCount: 0,
    colorScheme: {
      bg: 'bg-amber-50/80',
      text: 'text-amber-600',
      border: 'border-amber-100',
    },
    description: 'Pembuatan aplikasi responsif lintas platform menggunakan React, Tailwind CSS, dan Flutter.',
  },
  {
    id: 'subj_pda',
    title: 'Pemrograman Dasar & Algoritma',
    lecturer: 'Siti Nurhaliza, M.Kom.',
    code: 'PDA404',
    day: 'Rabu',
    time: '10.00–12.30',
    iconType: 'git',
    materialsCount: 5,
    completedCount: 0,
    colorScheme: {
      bg: 'bg-emerald-50/80',
      text: 'text-emerald-600',
      border: 'border-emerald-100',
    },
    description: 'Logika pemrograman terstruktur, algoritma sorting & searching, kompleksitas waktu Big-O.',
  },
  {
    id: 'subj_uiux',
    title: 'Desain Industri & UI/UX',
    lecturer: 'Dimas Prakoso, M.Ds.',
    code: 'UIUX505',
    day: 'Kamis',
    time: '08.00–10.30',
    iconType: 'palette',
    materialsCount: 5,
    completedCount: 0,
    colorScheme: {
      bg: 'bg-pink-50/80',
      text: 'text-pink-600',
      border: 'border-pink-100',
    },
    description: 'Metodologi Design Thinking, Wireframing, Prototyping Figma, Desain Sistem, dan Usability Testing.',
  },
  {
    id: 'subj_ppl',
    title: 'Pemodelan Perangkat Lunak',
    lecturer: 'Dr. Maya Lestari',
    code: 'PPL606',
    day: 'Jumat',
    time: '13.00–15.30',
    iconType: 'layers',
    materialsCount: 5,
    completedCount: 0,
    colorScheme: {
      bg: 'bg-purple-50/80',
      text: 'text-purple-600',
      border: 'border-purple-100',
    },
    description: 'Analisis kebutuhan sistem, UML Diagram (Use Case, Sequence, Activity), dan Software Architecture.',
  },
];

const SEMESTER_MEETING_TOPICS = [
  'Kontrak Kuliah & Pengenalan Arsitektur Perangkat Lunak',
  'Konsep Fundamental & Fondasi Paradigma Objek',
  'Struktur Kelas, Entitas & Representasi Memori',
  'Enkapsulasi, Getter-Setter & Validasi State',
  'Inheritance & Hierarki Pewarisan Tingkat Lanjut',
  'Polimorfisme Dinamis & Method Overriding',
  'Kelas Abstrak, Antarmuka (Interface) & Kontrak API',
  'Evaluasi Tengah Semester (ETS) & Review Arsitektur',
  'Penanganan Error, Logging & Exception Boundary',
  'Asynchronous Programming, Future & Reactive Stream',
  'Integrasi Cloud Firestore NoSQL & Operasi CRUD',
  'Manajemen State Global & Real-time Listeners',
  'Otentikasi Pengguna & Enkripsi Sesi Klien',
  'Optimasi Kinerja, Caching & Lazy Loading',
  'Pengujian Unit, Widget Testing & Mocking',
  'Evaluasi Akhir Semester (EAS) & Gelar Karya Mandiri',
];

export const DEMO_CLASSES = DEMO_SUBJECTS.map((s, idx) => {
  const meetings = SEMESTER_MEETING_TOPICS.map((topic, i) => {
    const order = i + 1;
    return {
      id: `${s.id}_m${order}`,
      order,
      title: `Pertemuan ${order < 10 ? '0' + order : order}: ${topic}`,
      status: order === 1 ? 'in_progress' : (order <= 2 ? 'open' : 'locked'),
      date: `Minggu ke-${order} (${s.day}, ${s.time})`,
      barcode: `${s.code}-M${order < 10 ? '0' + order : order}-SCAN-${1000 + order * 47}`,
      pretestDone: order === 1,
      posttestDone: false,
      hasVideo: true,
      hasPdf: true,
      score: null,
    };
  });

  return {
    id: s.id,
    name: s.title,
    code: s.code,
    description: s.description,
    instructor: s.lecturer,
    category: 'Teknologi Informasi',
    coverImage:
      idx % 2 === 0
        ? 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=600&q=80'
        : 'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?auto=format&fit=crop&w=600&q=80',
    enrolledCount: 38 + idx * 3,
    maxStudents: 50,
    progress: 0,
    meetingsCount: 16,
    completedMeetings: 0,
    meetings,
  };
});

export const DEMO_DISCUSSIONS = [];

export const DEMO_AUDIT_LOGS = [
  {
    id: 'log_01',
    timestamp: '22 Okt 2026, 08:30 WIB',
    actor: 'Dr. Andi Saputra',
    action: 'PUBLISH_MEETING',
    target: 'Pertemuan PBO: Inheritance & Abstract Class',
    status: 'SUCCESS',
    ip: '180.252.110.12',
  },
  {
    id: 'log_02',
    timestamp: '22 Okt 2026, 07:15 WIB',
    actor: 'Mahasiswa Demo',
    action: 'QR_PRESENCE_CHECKIN',
    target: 'Presensi PBO (Tepat Waktu)',
    status: 'SUCCESS',
    ip: '114.124.200.54',
  },
  {
    id: 'log_03',
    timestamp: '21 Okt 2026, 21:04 WIB',
    actor: 'Sistem Keamanan API',
    action: 'BLOCKED_AI_EXAM_ATTEMPT',
    target: 'Pretest PBO (Percobaan Akses AI Saat Ujian)',
    status: 'BLOCKED',
    ip: '36.85.12.98',
  },
];

// 20 Data Mahasiswa Resmi per Mata Kuliah untuk Portal Dosen
export const DEMO_COURSE_STUDENTS = [
  { id: 'mhs_01', nim: '25050974001', name: 'Ahmad Fauzi', email: 'ahmad.fauzi@mhs.unesa.ac.id', classGroup: 'TI-2025A', status: 'Aktif', nilaiTugas: 88, nilaiUTS: 85, nilaiUAS: 90, catatan: 'Aktif berdiskusi di kelas' },
  { id: 'mhs_02', nim: '25050974002', name: 'Siti Aisyah Putri', email: 'siti.aisyah@mhs.unesa.ac.id', classGroup: 'TI-2025A', status: 'Aktif', nilaiTugas: 92, nilaiUTS: 89, nilaiUAS: 91, catatan: 'Laporan praktikum sangat rapi' },
  { id: 'mhs_03', nim: '25050974003', name: 'Ralfky Ardan', email: 'ralfkyardan@gmail.com', classGroup: 'TI-2025A', status: 'Aktif', nilaiTugas: 94, nilaiUTS: 90, nilaiUAS: 93, catatan: 'Penguasaan arsitektur sistem sangat baik' },
  { id: 'mhs_04', nim: '25050974004', name: 'Dewi Lestari', email: 'dewi.lestari@mhs.unesa.ac.id', classGroup: 'TI-2025A', status: 'Aktif', nilaiTugas: 85, nilaiUTS: 82, nilaiUAS: 86, catatan: '' },
  { id: 'mhs_05', nim: '25050974005', name: 'Rian Pratama', email: 'rian.pratama@mhs.unesa.ac.id', classGroup: 'TI-2025A', status: 'Aktif', nilaiTugas: 79, nilaiUTS: 76, nilaiUAS: 80, catatan: 'Perlu pendalaman materi minggu ke-4' },
  { id: 'mhs_06', nim: '25050974006', name: 'Nadia Kusuma Wardani', email: 'nadia.kusuma@mhs.unesa.ac.id', classGroup: 'TI-2025A', status: 'Aktif', nilaiTugas: 90, nilaiUTS: 87, nilaiUAS: 89, catatan: '' },
  { id: 'mhs_07', nim: '25050974007', name: 'Bagas Adi Nugroho', email: 'bagas.adi@mhs.unesa.ac.id', classGroup: 'TI-2025A', status: 'Aktif', nilaiTugas: 81, nilaiUTS: 78, nilaiUAS: 82, catatan: '' },
  { id: 'mhs_08', nim: '25050974008', name: 'Putri Rahmawati', email: 'putri.rahma@mhs.unesa.ac.id', classGroup: 'TI-2025A', status: 'Aktif', nilaiTugas: 87, nilaiUTS: 84, nilaiUAS: 88, catatan: '' },
  { id: 'mhs_09', nim: '25050974009', name: 'Fajar Hidayatullah', email: 'fajar.hidayat@mhs.unesa.ac.id', classGroup: 'TI-2025A', status: 'Aktif', nilaiTugas: 75, nilaiUTS: 72, nilaiUAS: 77, catatan: 'Konsisten mengumpulkan tugas tepat waktu' },
  { id: 'mhs_10', nim: '25050974010', name: 'Intan Permata Sari', email: 'intan.permata@mhs.unesa.ac.id', classGroup: 'TI-2025A', status: 'Aktif', nilaiTugas: 91, nilaiUTS: 88, nilaiUAS: 90, catatan: '' },
  { id: 'mhs_11', nim: '25050974011', name: 'Dimas Wahyu Saputra', email: 'dimas.wahyu@mhs.unesa.ac.id', classGroup: 'TI-2025B', status: 'Aktif', nilaiTugas: 83, nilaiUTS: 80, nilaiUAS: 84, catatan: '' },
  { id: 'mhs_12', nim: '25050974012', name: 'Anisa Nur Fitria', email: 'anisa.fitria@mhs.unesa.ac.id', classGroup: 'TI-2025B', status: 'Aktif', nilaiTugas: 89, nilaiUTS: 86, nilaiUAS: 88, catatan: '' },
  { id: 'mhs_13', nim: '25050974013', name: 'Reza Mahendra', email: 'reza.mahendra@mhs.unesa.ac.id', classGroup: 'TI-2025B', status: 'Aktif', nilaiTugas: 77, nilaiUTS: 74, nilaiUAS: 79, catatan: '' },
  { id: 'mhs_14', nim: '25050974014', name: 'Larasati Wulandari', email: 'larasati.w@mhs.unesa.ac.id', classGroup: 'TI-2025B', status: 'Aktif', nilaiTugas: 93, nilaiUTS: 91, nilaiUAS: 94, catatan: 'Asisten praktikum kelas' },
  { id: 'mhs_15', nim: '25050974015', name: 'Ilham Kurniawan', email: 'ilham.k@mhs.unesa.ac.id', classGroup: 'TI-2025B', status: 'Aktif', nilaiTugas: 80, nilaiUTS: 79, nilaiUAS: 81, catatan: '' },
  { id: 'mhs_16', nim: '25050974016', name: 'Zahra Salsabila', email: 'zahra.salsa@mhs.unesa.ac.id', classGroup: 'TI-2025B', status: 'Aktif', nilaiTugas: 86, nilaiUTS: 83, nilaiUAS: 87, catatan: '' },
  { id: 'mhs_17', nim: '25050974017', name: 'Muhammad Rizky', email: 'm.rizky@mhs.unesa.ac.id', classGroup: 'TI-2025B', status: 'Aktif', nilaiTugas: 82, nilaiUTS: 81, nilaiUAS: 83, catatan: '' },
  { id: 'mhs_18', nim: '25050974018', name: 'Citra Ayu Ningsih', email: 'citra.ayu@mhs.unesa.ac.id', classGroup: 'TI-2025B', status: 'Aktif', nilaiTugas: 90, nilaiUTS: 88, nilaiUAS: 91, catatan: '' },
  { id: 'mhs_19', nim: '25050974019', name: 'Yoga Pratama Putra', email: 'yoga.pratama@mhs.unesa.ac.id', classGroup: 'TI-2025B', status: 'Aktif', nilaiTugas: 74, nilaiUTS: 70, nilaiUAS: 76, catatan: 'Disarankan mengikuti sesi asistensi' },
  { id: 'mhs_20', nim: '25050974020', name: 'Tiara Anggraini', email: 'tiara.anggraini@mhs.unesa.ac.id', classGroup: 'TI-2025B', status: 'Aktif', nilaiTugas: 88, nilaiUTS: 86, nilaiUAS: 89, catatan: '' },
];

export const getInitialCourseMaterials = (matkulId, matkulTitle = 'Mata Kuliah') => [
  {
    id: `${matkulId}_seed_1`,
    matkulId,
    pertemuan: 1,
    mode: 'text',
    judul: `Pertemuan 01 - Kontrak Kuliah & Pengantar ${matkulTitle}`,
    deskripsi: 'Catatan ringkas kompetensi dasar, bobot penilaian, dan tata tertib perkuliahan semester ini.',
    kontenTeks: `## Capaian Pembelajaran Pertemuan 01\n\nMahasiswa memahami ruang lingkup **${matkulTitle}**, standar evaluasi akademik, serta alur kolaborasi praktikum.\n\n- Kehadiran minimal: **75%** (Presensi QR Code / Verifikasi Dosen)\n- Komponen Penilaian: Tugas (30%), ETS/UTS (35%), EAS/UAS (35%)\n- Gunakan ruang diskusi untuk tanya jawab teknis di luar jam kelas.`,
    fileName: null,
    fileSize: null,
    fileMimeType: null,
    pdfBlobUrl: null,
    createdAt: '02 Nov 2026',
    createdAtTime: '08:00',
  },
  {
    id: `${matkulId}_seed_2`,
    matkulId,
    pertemuan: 2,
    mode: 'pdf',
    judul: `Pertemuan 02 - Modul Praktikum & Panduan ${matkulTitle}`,
    deskripsi: 'Dokumen referensi praktikum resmi dalam format PDF untuk dipelajari sebelum sesi kelas dimulai.',
    kontenTeks: '',
    fileName: `Modul_Praktikum_${(matkulId || 'kuliah').toUpperCase()}_2026.pdf`,
    fileSize: '2.45 MB',
    fileMimeType: 'application/pdf',
    pdfBlobUrl: null,
    createdAt: '04 Nov 2026',
    createdAtTime: '10:15',
  },
];
