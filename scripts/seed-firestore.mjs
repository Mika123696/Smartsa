/**
 * Idempotent Firestore & Firebase Auth seed script for Smartsa LMS.
 * Seeds 3 strictly separated role accounts (mhs@smartsa.edu, dosen@smartsa.edu, admin@smartsa.edu)
 * in Firebase Auth & Firestore `users/{uid}`, plus initial classes, assignments, and server-only exam_keys.
 *
 * Usage:
 *   node scripts/seed-firestore.mjs
 *   node scripts/seed-firestore.mjs --lecturer-uid <uid>
 *   SEED_DEFAULT_PASSWORD="YourPassword123!" node scripts/seed-firestore.mjs
 */

import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

function initFirebaseAdmin() {
  if (getApps().length > 0) return;

  const serviceAccountJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    const parsed = JSON.parse(serviceAccountJson);
    if (typeof parsed.private_key === 'string') {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    initializeApp({ credential: cert(parsed) });
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
    return;
  }

  initializeApp({
    credential: applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });
}

const MEETING_TOPICS = [
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

const SEED_SUBJECTS = [
  {
    id: 'subj_pbo',
    title: 'Pemrograman Berorientasi Objek',
    instructor: 'Dr. Andi Saputra',
    code: 'PBO101',
    day: 'Senin',
    time: '08.00–10.30',
    iconType: 'code',
    category: 'Teknologi Informasi',
    description:
      'Konsep dasar OOP, Enkapsulasi, Inheritansi, Polimorfisme, dan Abstraksi dengan Java & Dart.',
    coverImage: '',
  },
  {
    id: 'subj_bd',
    title: 'Basis Data',
    instructor: 'Ir. Rina Wijaya',
    code: 'BD202',
    day: 'Senin',
    time: '13.00–15.30',
    iconType: 'database',
    category: 'Teknologi Informasi',
    description:
      'Perancangan ERD, Relational Schema, Normalisasi, SQL Lanjut, dan Pengantar NoSQL Firestore.',
    coverImage: '',
  },
  {
    id: 'subj_pwmb',
    title: 'Pemrograman Web dan Perangkat Bergerak',
    instructor: 'Budi Hartono, M.T.',
    code: 'PWPB303',
    day: 'Selasa',
    time: '08.00–10.30',
    iconType: 'mobile',
    category: 'Teknologi Informasi',
    description:
      'Pembuatan aplikasi responsif lintas platform menggunakan React, Tailwind CSS, dan Flutter.',
    coverImage: '',
  },
  {
    id: 'subj_pda',
    title: 'Pemrograman Dasar & Algoritma',
    instructor: 'Siti Nurhaliza, M.Kom.',
    code: 'PDA404',
    day: 'Rabu',
    time: '10.00–12.30',
    iconType: 'git',
    category: 'Ilmu Komputer',
    description:
      'Logika pemrograman terstruktur, algoritma sorting & searching, kompleksitas waktu Big-O.',
    coverImage: '',
  },
  {
    id: 'subj_uiux',
    title: 'Desain Industri & UI/UX',
    instructor: 'Dimas Prakoso, M.Ds.',
    code: 'UIUX505',
    day: 'Kamis',
    time: '08.00–10.30',
    iconType: 'palette',
    category: 'Sistem Informasi',
    description:
      'Metodologi Design Thinking, Wireframing, Prototyping Figma, Desain Sistem, dan Usability Testing.',
    coverImage: '',
  },
  {
    id: 'subj_ppl',
    title: 'Pemodelan Perangkat Lunak',
    instructor: 'Dr. Maya Lestari',
    code: 'PPL606',
    day: 'Jumat',
    time: '13.00–15.30',
    iconType: 'layers',
    category: 'Teknologi Informasi',
    description:
      'Analisis kebutuhan sistem, UML Diagram (Use Case, Sequence, Activity), dan Software Architecture.',
    coverImage: '',
  },
];

const SEED_ASSIGNMENTS = [
  {
    id: 'asg_01',
    classId: 'subj_pbo',
    meetingNo: 1,
    title: 'Tugas Praktikum 01: Implementasi OOP & Inheritance',
    subject: 'Pemrograman Berorientasi Objek',
    subjectCode: 'PBO101',
    deadline: '2026-11-20T23:59:00+07:00',
    deadlineLabel: '20 Nov 2026, 23:59 WIB',
    note: 'Buatlah program aplikasi perpustakaan sederhana menggunakan konsep Inheritance dan Polimorfisme. Format laporan PDF dan lampirkan link repository GitHub.',
    maxSize: '10 MB',
    allowedFormats: '.pdf, .zip, .docx',
  },
  {
    id: 'asg_02',
    classId: 'subj_bd',
    meetingNo: 1,
    title: 'Tugas 02: Normalisasi Basis Data & Skema NoSQL',
    subject: 'Basis Data',
    subjectCode: 'BD202',
    deadline: '2026-11-24T21:00:00+07:00',
    deadlineLabel: '24 Nov 2026, 21:00 WIB',
    note: 'Rancang ERD dan lakukan normalisasi 1NF, 2NF, hingga 3NF pada studi kasus sistem rawat jalan rumah sakit.',
    maxSize: '15 MB',
    allowedFormats: '.pdf, .zip',
  },
  {
    id: 'asg_03',
    classId: 'subj_uiux',
    meetingNo: 2,
    title: 'Proyek Sesi 03: Desain UI/UX & Wireframing Mobile LMS',
    subject: 'Desain Industri & UI/UX',
    subjectCode: 'UIUX505',
    deadline: '2026-11-28T23:59:00+07:00',
    deadlineLabel: '28 Nov 2026, 23:59 WIB',
    note: 'Kumpulkan file PDF laporan analisis pengguna, Persona, Wireframe Lo-Fi, serta link prototype Figma.',
    maxSize: '25 MB',
    allowedFormats: '.pdf, .zip, .fig',
  },
  {
    id: 'asg_04',
    classId: 'subj_pwmb',
    meetingNo: 1,
    title: 'Tugas 04: Pembuatan Modul REST API & Vercel Serverless',
    subject: 'Pemrograman Web dan Perangkat Bergerak',
    subjectCode: 'PWPB303',
    deadline: '2026-11-30T23:59:00+07:00',
    deadlineLabel: '30 Nov 2026, 23:59 WIB',
    note: 'Implementasikan endpoint API /api/grade dan /api/join-class dengan proteksi Firebase Admin ID Token.',
    maxSize: '10 MB',
    allowedFormats: '.pdf, .zip',
  },
];

const SEED_ACCOUNTS = [
  {
    email: 'mhs@smartsa.edu',
    displayName: 'Budi Santoso',
    role: 'student',
    institution: 'Universitas Negeri Surabaya',
    nim: '25050974001',
    nidn: '',
    nip: '',
  },
  {
    email: 'dosen@smartsa.edu',
    displayName: 'Dr. Andi Saputra',
    role: 'lecturer',
    institution: 'Universitas Negeri Surabaya',
    nim: '0012088501',
    nidn: '0012088501',
    nip: '',
  },
  {
    email: 'admin@smartsa.edu',
    displayName: 'Administrator Smartsa',
    role: 'admin',
    institution: 'Smartsa Central Administration',
    nim: 'ADM-001',
    nidn: '',
    nip: 'ADM-001',
  },
];

const DEFAULT_SEED_QUESTIONS = [
  {
    id: 'q1',
    question: 'Apa tujuan utama pemisahan tanggung jawab (Separation of Concerns) dalam arsitektur aplikasi?',
    options: [
      'Menghilangkan kebutuhan validasi input',
      'Memisahkan layer UI, logika bisnis, dan akses data agar mudah dirawat',
      'Menyatukan seluruh kode ke satu file tunggal',
      'Mengizinkan klien menyimpan kredensial admin',
    ],
  },
  {
    id: 'q2',
    question: 'Mengapa evaluasi jawaban ujian harus dilakukan di endpoint backend terproteksi?',
    options: [
      'Agar kode CSS lebih ringan',
      'Agar animasi tombol berjalan lebih cepat',
      'Agar kunci jawaban tidak dapat dibaca atau dimodifikasi oleh browser pengguna',
      'Agar token autentikasi tidak perlu dikirim ke server',
    ],
  },
  {
    id: 'q3',
    question: 'Bagaimana mekanisme Cloud Firestore melindungi akses baca dokumen kelas dan submission mahasiswa?',
    options: [
      'Mengandalkan penyembunyian komponen React saja',
      'Memvalidasi kepemilikan dosen dan status keanggotaan kelas di Firestore Security Rules',
      'Mengirim seluruh database ke localStorage saat aplikasi dimuat',
      'Menonaktifkan otentikasi pengguna',
    ],
  },
  {
    id: 'q4',
    question: 'Apa manfaat utama mencatat progres belajar dan skor evaluasi per pertemuan secara terstruktur?',
    options: [
      'Membuka semua materi sekaligus tanpa syarat',
      'Mengukur capaian belajar (Gain Δ) dari Pretest ke Post-test secara objektif',
      'Menghapus kebutuhan peran dosen dan admin',
      'Menghindari penggunaan basis data server',
    ],
  },
];

const DEFAULT_EXAM_KEY = {
  pretest: { q1: 1, q2: 2, q3: 1, q4: 1 },
  posttest: { q1: 1, q2: 2, q3: 1, q4: 1 },
};

async function seedRoleAccounts(auth, db, defaultPassword) {
  const seeded = [];

  for (const acc of SEED_ACCOUNTS) {
    let userRecord;
    let created = false;

    try {
      userRecord = await auth.getUserByEmail(acc.email);
      const authPatch = {};
      if (userRecord.displayName !== acc.displayName) {
        authPatch.displayName = acc.displayName;
      }
      if (!userRecord.emailVerified) {
        authPatch.emailVerified = true;
      }
      if (Object.keys(authPatch).length > 0) {
        userRecord = await auth.updateUser(userRecord.uid, authPatch);
      }
    } catch (err) {
      if (err?.code !== 'auth/user-not-found') {
        throw err;
      }
      userRecord = await auth.createUser({
        email: acc.email,
        password: defaultPassword,
        displayName: acc.displayName,
        emailVerified: true,
      });
      created = true;
    }

    await auth.setCustomUserClaims(userRecord.uid, { role: acc.role });

    await db
      .collection('users')
      .doc(userRecord.uid)
      .set(
        {
          uid: userRecord.uid,
          email: acc.email,
          displayName: acc.displayName,
          role: acc.role,
          institution: acc.institution,
          nim: acc.nim,
          nidn: acc.nidn,
          nip: acc.nip,
          photoURL: null,
          emailVerified: true,
          verificationStatus: 'verified',
          ...(created ? { createdAt: FieldValue.serverTimestamp() } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    seeded.push({ uid: userRecord.uid, email: acc.email, role: acc.role, created });
  }

  return seeded;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const defaultPassword =
    process.env.SEED_DEFAULT_PASSWORD || args['default-password'] || 'Smartsa123!';

  initFirebaseAdmin();
  const auth = getAuth();
  const db = getFirestore();

  const seededAccounts = await seedRoleAccounts(auth, db, defaultPassword);
  const lecturerAccount = seededAccounts.find((a) => a.role === 'lecturer');
  const lecturerUid = args['lecturer-uid']?.trim() || lecturerAccount?.uid || 'system_seed';

  for (const subj of SEED_SUBJECTS) {
    const meetings = MEETING_TOPICS.map((topic, i) => {
      const order = i + 1;
      const padded = order < 10 ? `0${order}` : `${order}`;
      return {
        id: `${subj.id}_m${order}`,
        order,
        title: `Pertemuan ${padded}: ${topic}`,
        status: order === 1 ? 'in_progress' : order <= 2 ? 'open' : 'locked',
        date: `Minggu ke-${order} (${subj.day}, ${subj.time})`,
        hasVideo: true,
        hasPdf: true,
      };
    });

    await db
      .collection('classes')
      .doc(subj.id)
      .set(
        {
          id: subj.id,
          name: subj.title,
          title: subj.title,
          code: subj.code,
          lecturer: subj.instructor,
          instructor: subj.instructor,
          lecturerId: lecturerUid,
          category: subj.category,
          description: subj.description,
          day: subj.day,
          time: subj.time,
          iconType: subj.iconType,
          coverImage: subj.coverImage,
          materialsCount: 5,
          meetingsCount: 16,
          maxStudents: 50,
          isPublic: true,
          isActive: true,
          meetings,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    await db
      .collection('exam_keys')
      .doc(subj.id)
      .set(
        {
          classId: subj.id,
          meetings: {
            1: DEFAULT_EXAM_KEY,
          },
          ...DEFAULT_EXAM_KEY,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    for (const examType of ['pretest', 'posttest']) {
      const examDocId = `${subj.id}_m1_${examType}`;
      await db
        .collection('exams')
        .doc(examDocId)
        .set(
          {
            examId: examDocId,
            classId: subj.id,
            meetingNo: 1,
            examType,
            title: `${examType === 'posttest' ? 'Post-test' : 'Pretest'} Pertemuan 1 — ${subj.title}`,
            status: 'published',
            durationMinutes: 15,
            deadline: null,
            questions: DEFAULT_SEED_QUESTIONS,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    }
  }

  for (const asg of SEED_ASSIGNMENTS) {
    await db
      .collection('assignments')
      .doc(asg.id)
      .set(
        {
          ...asg,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }

  console.log(
    `[seed-firestore] Seeded ${seededAccounts.length} isolated role accounts (${seededAccounts
      .map((a) => `${a.email}:${a.role}${a.created ? ':created' : ':synced'}`)
      .join(', ')}), ${SEED_SUBJECTS.length} classes, ${SEED_ASSIGNMENTS.length} assignments, and ${SEED_SUBJECTS.length} exam_keys (lecturerId=${lecturerUid}).`
  );
}

main().catch((err) => {
  console.error('[seed-firestore] Failed:', err.message);
  process.exitCode = 1;
});
