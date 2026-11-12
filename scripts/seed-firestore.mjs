/**
 * Idempotent Firestore seed script for Smartsa LMS.
 * Seeds initial classes (PBO101, BD202, PWPB303, PDA404, UIUX505, PPL606),
 * assignments, and server-only exam_keys using firebase-admin.
 *
 * Usage:
 *   node scripts/seed-firestore.mjs
 *   node scripts/seed-firestore.mjs --lecturer-uid <uid>
 */

import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
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
    coverImage:
      'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=600&q=80',
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
    coverImage:
      'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?auto=format&fit=crop&w=600&q=80',
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
    coverImage:
      'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=600&q=80',
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
    coverImage:
      'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?auto=format&fit=crop&w=600&q=80',
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
    coverImage:
      'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=600&q=80',
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
    coverImage:
      'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?auto=format&fit=crop&w=600&q=80',
  },
];

const SEED_ASSIGNMENTS = [
  {
    id: 'asg_01',
    classId: 'subj_pbo',
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

const DEFAULT_EXAM_KEY = {
  pretest: { q1: 1, q2: 2, q3: 1, q4: 1 },
  posttest: { q1: 1, q2: 2, q3: 1, q4: 1 },
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lecturerUid = args['lecturer-uid']?.trim() || 'system_seed';

  initFirebaseAdmin();
  const db = getFirestore();

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
          ...DEFAULT_EXAM_KEY,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
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
    `[seed-firestore] Seeded ${SEED_SUBJECTS.length} classes, ${SEED_ASSIGNMENTS.length} assignments, and ${SEED_SUBJECTS.length} exam_keys (lecturerId=${lecturerUid}).`
  );
}

main().catch((err) => {
  console.error('[seed-firestore] Failed:', err.message);
  process.exitCode = 1;
});
