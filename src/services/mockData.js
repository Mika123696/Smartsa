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
