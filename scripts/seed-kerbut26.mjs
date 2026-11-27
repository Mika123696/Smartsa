/**
 * Skrip Seed Idempoten untuk Kelas KERBUT26 (Kecerdasan Buatan) — Smartsa LMS.
 *
 * Fitur:
 * - Mode default / `--dry-run`: hanya meninjau kelas target, 30 mahasiswa seed,
 *   sinkronisasi akun asli `@mhs.unesa.ac.id`, pembaruan `enrolledCount`, serta
 *   6 topik diskusi + balasan tanpa menulis ke Firestore.
 * - Mode `--execute`: menulis dan menyinkronkan seluruh data secara idempoten.
 * - Mode `--cleanup`: menghapus seluruh dokumen dengan `seedBatch === 'kerbut26'`
 *   pada `users`, `class_members`, dan `discussions`, lalu menghitung ulang
 *   `classes/{classId}.enrolledCount` agar kembali akurat.
 *
 * Penggunaan (PowerShell):
 *   node scripts/seed-kerbut26.mjs
 *   node scripts/seed-kerbut26.mjs --dry-run
 *   node scripts/seed-kerbut26.mjs --execute
 *   node scripts/seed-kerbut26.mjs --cleanup
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export const TARGET_CLASS_CODE = 'KERBUT26';
export const SEED_BATCH = 'kerbut26';
export const SEED_INSTITUTION = 'Universitas Negeri Surabaya';
const NIM_START = 25050974001;
const BATCH_CHUNK_SIZE = 400;

const STUDENT_NAMES = Object.freeze([
  'Ahmad Fauzan Pratama',
  'Siti Rahmawati Nurhaliza',
  'Dimas Aditya Nugroho',
  'Nabila Putri Kartika',
  'Rizky Ramadhan Hidayat',
  'Alya Khairunnisa Zahra',
  'Bagus Setiawan Putra',
  'Dewi Lestari Anggraini',
  'Fajar Maulana Hakim',
  'Intan Permatasari Wijaya',
  'Kevin Ardiansyah Saputra',
  'Laila Fitriani Kusuma',
  'Muhammad Ilham Firmansyah',
  'Nadia Safitri Maharani',
  'Oktavian Dwi Cahyo',
  'Putri Ayu Wulandari',
  'Rafi Alifian Darmawan',
  'Salsabila Azzahra Hadi',
  'Taufik Hidayatullah Akbar',
  'Vina Amelia Puspita',
  'Wahyu Prasetyo Utomo',
  'Yuniar Shinta Dewi',
  'Zaki Mubarok Kurniawan',
  'Anisa Farah Salsabila',
  'Bayu Krisna Wardhana',
  'Citra Kirana Novitasari',
  'Danang Tri Atmojo',
  'Eka Wahyuningtyas',
  'Galih Permana Santoso',
  'Hana Melati Sukma',
]);

/**
 * Mem-parse argumen CLI menjadi mode eksekusi (`dry-run`, `execute`, atau `cleanup`).
 * @param {string[]} argv
 */
export function parseSeedFlags(argv = []) {
  const hasExecute = argv.includes('--execute');
  const hasCleanup = argv.includes('--cleanup');
  const hasDryRun = argv.includes('--dry-run');

  if (hasExecute && hasCleanup) {
    throw new Error('Tidak dapat menggabungkan --execute dan --cleanup dalam satu perintah.');
  }

  const mode = hasCleanup ? 'cleanup' : hasExecute ? 'execute' : 'dry-run';
  return {
    mode,
    dryRun: mode === 'dry-run' || hasDryRun,
    execute: mode === 'execute',
    cleanup: mode === 'cleanup',
  };
}

/**
 * Memuat `.env` lalu `.env.local` dari direktori kerja secara diam-diam tanpa menimpa
 * variabel lingkungan yang sudah ditetapkan di shell dan tanpa mencetak nilai rahasia.
 * @param {string} cwd
 */
export function loadEnvFiles(cwd = process.cwd()) {
  const shellDefinedKeys = new Set(Object.keys(process.env));
  const candidates = ['.env', '.env.local'];

  for (const filename of candidates) {
    const filePath = path.join(cwd, filename);
    if (!fs.existsSync(filePath)) continue;

    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
      const eqIndex = withoutExport.indexOf('=');
      if (eqIndex <= 0) continue;

      const key = withoutExport.slice(0, eqIndex).trim();
      if (!key || shellDefinedKeys.has(key)) continue;

      let value = withoutExport.slice(eqIndex + 1).trim();
      const quoteChar = value[0];
      if ((quoteChar === '"' || quoteChar === "'") && value.endsWith(quoteChar) && value.length >= 2) {
        value = value.slice(1, -1);
      } else {
        const hashCommentIdx = value.indexOf(' #');
        if (hashCommentIdx !== -1) {
          value = value.slice(0, hashCommentIdx).trim();
        }
      }

      process.env[key] = value;
    }
  }
}

export function initFirebaseAdmin() {
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

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
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

/**
 * Memeriksa apakah email termasuk domain mahasiswa UNESA (`@mhs.unesa.ac.id`), case-insensitive.
 * @param {unknown} rawEmail
 */
export function isMhsUnesaEmail(rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  return /^[^\s@]+@mhs\.unesa\.ac\.id$/.test(email);
}

/**
 * Menghasilkan 30 entri profil mahasiswa UNESA & payload dokumen `users` + `class_members`.
 * @param {string} classId
 * @param {{ timestampValue?: unknown }} [options]
 */
export function buildSeededStudents(classId, { timestampValue = FieldValue.serverTimestamp() } = {}) {
  const baseDateMs = Date.UTC(2026, 1, 16, 1, 0, 0);

  return STUDENT_NAMES.map((fullName, idx) => {
    const seq = String(idx + 1).padStart(2, '0');
    const uid = `seed_kerbut26_mhs_${seq}`;
    const nim = String(NIM_START + idx);
    const email = `${nim}@mhs.unesa.ac.id`;
    const memberId = `${classId}_${uid}`;
    const joinedDate = new Date(baseDateMs + idx * 18 * 60 * 1000);

    return {
      uid,
      memberId,
      nim,
      email,
      displayName: fullName,
      userDoc: {
        uid,
        email,
        name: fullName,
        displayName: fullName,
        photoURL: null,
        role: 'student',
        accountType: 'MAHASISWA',
        isInstitutional: true,
        emailVerified: true,
        institution: SEED_INSTITUTION,
        nim,
        seedBatch: SEED_BATCH,
        createdAt: joinedDate,
        updatedAt: timestampValue,
        last_active: timestampValue,
      },
      memberDoc: {
        memberId,
        classId,
        uid,
        role: 'student',
        status: 'approved',
        accountType: 'MAHASISWA',
        isInstitutional: true,
        autoApproved: true,
        email,
        displayName: fullName,
        studentName: fullName,
        nim,
        joinedAt: joinedDate,
        updatedAt: timestampValue,
        seedBatch: SEED_BATCH,
      },
    };
  });
}

/**
 * Memilih pertemuan aktual dari `classData.meetings` agar 6 topik diskusi tersebar proporsional.
 * @param {Array<Record<string, unknown>>} rawMeetings
 * @param {number} topicIndex
 * @param {number} totalTopics
 */
export function pickMeetingForTopic(rawMeetings, topicIndex, totalTopics = 6) {
  const normalized = Array.isArray(rawMeetings)
    ? rawMeetings
        .map((m, idx) => ({
          order: Number(m?.order || m?.meetingNo || idx + 1),
          title: String(m?.title || `Pertemuan ${idx + 1}`).trim(),
        }))
        .filter((m) => Number.isFinite(m.order) && m.order > 0)
        .sort((a, b) => a.order - b.order)
    : [];

  if (normalized.length === 0) {
    return { order: topicIndex + 1, title: `Pertemuan ${topicIndex + 1}` };
  }

  if (normalized.length < totalTopics) {
    return normalized[topicIndex % normalized.length];
  }

  const slot = Math.min(
    normalized.length - 1,
    Math.floor((topicIndex * normalized.length) / totalTopics)
  );
  return normalized[slot];
}

const DISCUSSION_BLUEPRINTS = Object.freeze([
  {
    id: 'disc_kerbut26_01',
    authorIdx: 0,
    timeLabel: '2 hari lalu',
    hoursAgo: 52,
    content:
      'Untuk studi kasus agen otonom pengantar dokumen di lingkungan kampus UNESA, apakah komponen Environment pada tabel PEAS dikategorikan sebagai partially observable dan stochastic karena ada pejalan kaki serta cuaca yang berubah?',
    likeIndices: [1, 2, 4, 7, 10, 15],
    replies: [
      {
        authorIdx: 1,
        time: '2 hari lalu',
        content:
          'Betul, termasuk partially observable karena sensor kamera/LiDAR punya jarak pandang terbatas, dan stochastic akibat pergerakan mahasiswa di koridor tidak sepenuhnya deterministik.',
      },
      {
        authorIdx: 4,
        time: '2 hari lalu',
        content:
          'Tambahan juga sifatnya dynamic dan continuous: posisi objek berubah selama agen berpikir memilih aksi belok atau berhenti.',
      },
      {
        authorIdx: 7,
        time: '1 hari lalu',
        content:
          'Untuk Actuator-nya selain roda penggerak dan rem darurat, kita bisa masukkan modul notifikasi suara/LED agar interaksi dengan pejalan kaki tetap aman.',
      },
      {
        authorIdx: 10,
        time: '1 hari lalu',
        content:
          'Setuju, pastikan Performance Measure-nya menyeimbangkan ketepatan waktu tiba, efisiensi baterai, dan nol insiden tabrakan.',
      },
    ],
  },
  {
    id: 'disc_kerbut26_02',
    authorIdx: 2,
    timeLabel: '2 hari lalu',
    hoursAgo: 44,
    content:
      'Masih sedikit bingung membandingkan Greedy Best-First Search dan algoritma A* pada pencarian rute peta kampus. Mengapa A* dengan f(n) = g(n) + h(n) bisa menjamin solusi optimal sementara Greedy tidak?',
    likeIndices: [0, 3, 5, 8, 12, 18, 21, 25],
    replies: [
      {
        authorIdx: 5,
        time: '2 hari lalu',
        content:
          'Greedy hanya memakai h(n) (perkiraan jarak ke tujuan) dan mengabaikan biaya g(n) yang sudah ditempuh, jadi mudah terjebak memilih jalan awal yang tampak dekat padahal memutar jauh.',
      },
      {
        authorIdx: 8,
        time: '1 hari lalu',
        content:
          'Dengan syarat heuristik h(n) admissible (tidak pernah melebihi biaya sebenarnya ke tujuan), A* pada tree search tidak akan mengekspansi simpul tujuan bernilai suboptimal.',
      },
      {
        authorIdx: 12,
        time: '1 hari lalu',
        content:
          'Untuk graph search agar tidak mengevaluasi ulang simpul tertutup, pastikan heuristiknya juga consistent (monoton): h(n) <= c(n, a, n\') + h(n\').',
      },
      {
        authorIdx: 3,
        time: '1 hari lalu',
        content:
          'Di peta grid 4 arah kita biasa pakai jarak Manhattan, sedangkan kalau boleh bergerak diagonal atau lintasan bebas di bidang datar lebih pas memakai jarak Euclidean.',
      },
      {
        authorIdx: 18,
        time: '20 jam lalu',
        content:
          'Ringkasnya: g(n) menjaga kedisiplinan biaya historis dari titik awal, sedangkan h(n) memandu arah pencarian menuju target.',
      },
    ],
  },
  {
    id: 'disc_kerbut26_03',
    authorIdx: 6,
    timeLabel: '1 hari lalu',
    hoursAgo: 31,
    content:
      'Pada tugas implementasi permainan papan dengan Minimax + Alpha-Beta Pruning, urutan langkah seperti apa yang paling efektif meningkatkan jumlah cabang yang berhasil dipangkas (pruned)?',
    likeIndices: [1, 6, 9, 13, 19],
    replies: [
      {
        authorIdx: 9,
        time: '1 hari lalu',
        content:
          'Prinsipnya evaluasi langkah terbaik lebih dulu (move ordering). Pada cabang MAX dahulukan nilai heuristik tertinggi, sedangkan pada cabang MIN dahulukan nilai terendah.',
      },
      {
        authorIdx: 13,
        time: '22 jam lalu',
        content:
          'Kalau ada iterative deepening, urutan skor dari kedalaman sebelumnya sering dipakai sebagai panduan sorting simpul di iterasi berikutnya.',
      },
      {
        authorIdx: 19,
        time: '18 jam lalu',
        content:
          'Dalam kondisi move ordering ideal, kompleksitas waktu efektifnya turun dari O(b^m) menjadi sekitar O(b^(m/2)), artinya kedalaman pencarian bisa hampir dua kali lipat.',
      },
    ],
  },
  {
    id: 'disc_kerbut26_04',
    authorIdx: 11,
    timeLabel: '1 hari lalu',
    hoursAgo: 24,
    content:
      'Saat mengonversi aturan pengetahuan dari logika predikat (First-Order Logic) ke Conjunctive Normal Form (CNF) untuk algoritma resolusi, bagian Skolemization sering membingungkan. Bagaimana aturan praktisnya saat quantifier eksistensial berada di dalam quantifier universal?',
    likeIndices: [0, 4, 11, 14, 16, 22, 27],
    replies: [
      {
        authorIdx: 14,
        time: '21 jam lalu',
        content:
          'Kalau quantifier eksistensial (∃y) berada di dalam lingkup universal (∀x), kita wajib mengganti y dengan fungsi Skolem f(x), bukan konstanta bebas, supaya ketergantungan pada x tetap terjaga.',
      },
      {
        authorIdx: 16,
        time: '19 jam lalu',
        content:
          'Benar, contohnya "Setiap mahasiswa memiliki NIM": ∀x ∃y PunyaNIM(x, y) menjadi ∀x PunyaNIM(x, nim(x)), bukan PunyaNIM(x, C) karena NIM tiap mahasiswa berbeda.',
      },
      {
        authorIdx: 22,
        time: '16 jam lalu',
        content:
          'Urutan konversi CNF yang paling aman diikuti: hapus implikasi, dorong negasi ke dalam (hukum De Morgan), standarisasi variabel, Skolemization, drop universal quantifier, lalu distribusikan OR atas AND.',
      },
      {
        authorIdx: 0,
        time: '14 jam lalu',
        content:
          'Terima kasih penjelasannya! Contoh kasus NIM itu langsung membuat fungsi Skolem masuk akal.',
      },
    ],
  },
  {
    id: 'disc_kerbut26_05',
    authorIdx: 17,
    timeLabel: '14 jam lalu',
    hoursAgo: 14,
    content:
      'Mengapa pada Bayesian Network kita tetap perlu asumsi conditional independence antar node non-keturunan? Seberapa besar pengaruhnya terhadap tabel probabilitas bersyarat (CPT)?',
    likeIndices: [2, 5, 17, 20, 24, 28],
    replies: [
      {
        authorIdx: 20,
        time: '12 jam lalu',
        content:
          'Tanpa conditional independence, model joint probability penuh untuk n variabel biner butuh 2^n - 1 parameter. Dengan struktur graf berarah asiklik (DAG), jumlah baris CPT hanya bergantung pada jumlah parent langsung tiap node.',
      },
      {
        authorIdx: 24,
        time: '10 jam lalu',
        content:
          'Misalnya untuk 20 variabel biner yang masing-masing maksimal punya 3 parent, total parameternya cuma ~160 angka, jauh lebih ringan dibanding >1 juta kombinasi pada distribusi penuh.',
      },
      {
        authorIdx: 28,
        time: '9 jam lalu',
        content:
          'Ini juga yang membuat proses inferensi probabilistik lebih stabil ketika ukuran dataset latih terbatas karena risiko parameter jarang muncul jauh berkurang.',
      },
      {
        authorIdx: 5,
        time: '7 jam lalu',
        content:
          'Dan saat mendesain arsitektur grafnya, arah panah sebaiknya mengikuti hubungan kausal (sebab -> akibat) agar struktur independensinya lebih ringkas.',
      },
    ],
  },
  {
    id: 'disc_kerbut26_06',
    authorIdx: 23,
    timeLabel: '6 jam lalu',
    hoursAgo: 6,
    content:
      'Dalam eksperimen klasifikasi teks keluhan akademik dengan dataset yang kelasnya tidak seimbang (90% vs 10%), metrik akurasi terlihat 91% tetapi model gagal mengenali kelas minoritas. Pendekatan evaluasi dan mitigasi apa yang paling disarankan?',
    likeIndices: [1, 7, 12, 15, 21, 23, 26, 28, 29],
    replies: [
      {
        authorIdx: 26,
        time: '5 jam lalu',
        content:
          'Jangan jadikan accuracy sebagai metrik utama pada imbalanced dataset; gunakan confusion matrix, Precision, Recall, F1-Score macro, serta PR-AUC agar performa pada kelas minoritas terlihat jujur.',
      },
      {
        authorIdx: 29,
        time: '4 jam lalu',
        content:
          'Gunakan Stratified K-Fold Cross-Validation agar proporsi kelas minoritas 10% terjaga konsisten di setiap fold pelatihan maupun validasi.',
      },
      {
        authorIdx: 15,
        time: '3 jam lalu',
        content:
          'Untuk penanganannya bisa aktifkan parameter class_weight="balanced" pada model atau lakukan oversampling hanya di dalam data latih tiap fold agar tidak terjadi data leakage ke data validasi.',
      },
      {
        authorIdx: 21,
        time: '2 jam lalu',
        content:
          'Menurunkan ambang batas probabilitas (classification threshold) dari 0.5 berdasarkan kurva Precision-Recall juga efektif bila recall kelas minoritas lebih diprioritaskan.',
      },
      {
        authorIdx: 7,
        time: '1 jam lalu',
        content:
          'Setuju sekali dengan catatan jangan melakukan SMOTE sebelum split train/validation, karena sampel sintetis yang bocor ke validation set bakal menggelembungkan skor F1 secara semu.',
      },
    ],
  },
]);

/**
 * Menghasilkan 6 dokumen diskusi Kecerdasan Buatan beserta 3-5 balasan realistis dari 30 mahasiswa seed.
 * @param {{ classId: string, classData: Record<string, unknown>, students: Array<Record<string, unknown>>, timestampValue?: unknown }} params
 */
export function buildSeededDiscussions({
  classId,
  classData,
  students,
  nowMs = Date.UTC(2026, 2, 1, 9, 0, 0),
}) {
  const subjectName =
    String(classData?.title || classData?.name || 'Kecerdasan Buatan').trim() ||
    'Kecerdasan Buatan';
  const meetings = Array.isArray(classData?.meetings) ? classData.meetings : [];

  return DISCUSSION_BLUEPRINTS.map((bp, idx) => {
    const meeting = pickMeetingForTopic(meetings, idx, DISCUSSION_BLUEPRINTS.length);
    const authorStudent = students[bp.authorIdx % students.length];
    const likedBy = Array.from(
      new Set(bp.likeIndices.map((studentIdx) => students[studentIdx % students.length].uid))
    );
    const replies = bp.replies.map((replySpec, replyIdx) => {
      const replyStudent = students[replySpec.authorIdx % students.length];
      return {
        id: `rep_kerbut26_${String(idx + 1).padStart(2, '0')}_${String(replyIdx + 1).padStart(2, '0')}`,
        authorUid: replyStudent.uid,
        author: replyStudent.displayName,
        time: replySpec.time,
        content: replySpec.content,
      };
    });
    const createdAt = new Date(nowMs - bp.hoursAgo * 60 * 60 * 1000);
    const updatedAt = new Date(nowMs - Math.max(1, bp.hoursAgo - 12) * 60 * 60 * 1000);

    return {
      id: bp.id,
      meetingTitle: meeting.title,
      doc: {
        classId,
        meetingNo: meeting.order,
        subject: subjectName,
        authorUid: authorStudent.uid,
        author: authorStudent.displayName,
        avatar: '',
        timeLabel: bp.timeLabel,
        content: bp.content,
        likes: likedBy.length,
        likedBy,
        replies,
        isVerifiedAnswer: false,
        verifiedBy: '',
        verifiedReplyId: '',
        createdAt,
        updatedAt,
        seedBatch: SEED_BATCH,
      },
    };
  });
}

/**
 * Menghitung patch sinkronisasi untuk akun asli `@mhs.unesa.ac.id` pada koleksi `users`.
 * @param {Record<string, unknown>} userData
 * @param {unknown} timestampValue
 */
export function computeSyncedUserPatch(userData = {}, timestampValue = FieldValue.serverTimestamp()) {
  if (!userData || userData.seedBatch === SEED_BATCH) return null;
  if (!isMhsUnesaEmail(userData.email)) return null;

  const role = String(userData.role || 'student').trim().toLowerCase();
  const isStaff = role === 'admin' || role === 'lecturer';
  const expectedAccountType = isStaff ? userData.accountType || 'DOSEN' : 'MAHASISWA';
  const needsAccountTypeFix = !isStaff && userData.accountType !== 'MAHASISWA';
  const needsInstitutionalFix = userData.isInstitutional !== true;

  if (!needsAccountTypeFix && !needsInstitutionalFix) {
    return null;
  }

  return {
    accountType: expectedAccountType,
    isInstitutional: true,
    updatedAt: timestampValue,
  };
}

/**
 * Menghitung patch sinkronisasi untuk keanggotaan asli `@mhs.unesa.ac.id` pada `class_members`.
 * @param {Record<string, unknown>} memberData
 * @param {Record<string, unknown> | null} userData
 * @param {unknown} timestampValue
 */
export function computeSyncedMemberPatch(
  memberData = {},
  userData = null,
  timestampValue = FieldValue.serverTimestamp()
) {
  if (!memberData || memberData.seedBatch === SEED_BATCH) return null;
  const resolvedEmail = String(memberData.email || userData?.email || '')
    .trim()
    .toLowerCase();
  if (!isMhsUnesaEmail(resolvedEmail)) return null;

  const role = String(memberData.role || userData?.role || 'student').trim().toLowerCase();
  const isStaff = role === 'admin' || role === 'lecturer';
  const expectedAccountType = isStaff ? memberData.accountType || 'DOSEN' : 'MAHASISWA';
  const needsStatusFix = !isStaff && memberData.status !== 'approved';
  const needsAccountTypeFix = !isStaff && memberData.accountType !== 'MAHASISWA';
  const needsInstitutionalFix = memberData.isInstitutional !== true;
  const needsAutoApprovedFix = !isStaff && memberData.autoApproved !== true;
  const needsEmailBackfill = !memberData.email && Boolean(resolvedEmail);

  if (
    !needsStatusFix &&
    !needsAccountTypeFix &&
    !needsInstitutionalFix &&
    !needsAutoApprovedFix &&
    !needsEmailBackfill
  ) {
    return null;
  }

  return {
    ...(needsStatusFix ? { status: 'approved' } : {}),
    accountType: expectedAccountType,
    isInstitutional: true,
    ...(isStaff ? {} : { autoApproved: true }),
    ...(needsEmailBackfill ? { email: resolvedEmail } : {}),
    updatedAt: timestampValue,
  };
}

async function findClassByCode(db, targetCode = TARGET_CLASS_CODE) {
  const normalizedTarget = String(targetCode || '').trim().toUpperCase();
  const directSnap = await db.collection('classes').where('code', '==', normalizedTarget).get();
  if (!directSnap.empty) {
    const docSnap = directSnap.docs[0];
    return { id: docSnap.id, ref: docSnap.ref, data: docSnap.data() || {} };
  }

  const allSnap = await db.collection('classes').get();
  const matched = allSnap.docs.find(
    (docSnap) => String(docSnap.data()?.code || '').trim().toUpperCase() === normalizedTarget
  );
  if (!matched) return null;
  return { id: matched.id, ref: matched.ref, data: matched.data() || {} };
}

async function commitBatchedOperations(db, operations) {
  for (let i = 0; i < operations.length; i += BATCH_CHUNK_SIZE) {
    const batch = db.batch();
    const slice = operations.slice(i, i + BATCH_CHUNK_SIZE);
    for (const op of slice) {
      if (op.type === 'set') {
        batch.set(op.ref, op.data, op.options || {});
      } else if (op.type === 'update') {
        batch.update(op.ref, op.data);
      } else if (op.type === 'delete') {
        batch.delete(op.ref);
      }
    }
    await batch.commit();
  }
}

export async function runSeedKerbut26(argv = process.argv.slice(2)) {
  const flags = parseSeedFlags(argv);
  loadEnvFiles();
  initFirebaseAdmin();
  const db = getFirestore();

  if (flags.cleanup) {
    const targetClass = await findClassByCode(db, TARGET_CLASS_CODE);
    const cleanupCollections = ['users', 'class_members', 'discussions'];
    const deleteOps = [];
    const countsByCollection = {};

    for (const colName of cleanupCollections) {
      const snap = await db.collection(colName).where('seedBatch', '==', SEED_BATCH).get();
      countsByCollection[colName] = snap.size;
      for (const docSnap of snap.docs) {
        deleteOps.push({ type: 'delete', ref: docSnap.ref });
      }
    }

    let nextEnrolledCount = null;
    if (targetClass) {
      const membersSnap = await db
        .collection('class_members')
        .where('classId', '==', targetClass.id)
        .get();
      nextEnrolledCount = membersSnap.docs.filter((docSnap) => {
        const d = docSnap.data() || {};
        if (d.seedBatch === SEED_BATCH) return false;
        const status = String(d.status || 'approved').toLowerCase();
        return status === 'approved' || status === 'active';
      }).length;

      await commitBatchedOperations(db, deleteOps);
      await targetClass.ref.update({
        enrolledCount: nextEnrolledCount,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      await commitBatchedOperations(db, deleteOps);
    }

    console.log(
      `[seed-kerbut26] CLEANUP selesai: users=${countsByCollection.users}, class_members=${countsByCollection.class_members}, discussions=${countsByCollection.discussions}` +
        (targetClass ? `, classId=${targetClass.id}, enrolledCount=${nextEnrolledCount}` : '')
    );

    return {
      mode: flags.mode,
      countsByCollection,
      classId: targetClass?.id || null,
      enrolledCount: nextEnrolledCount,
    };
  }

  const targetClass = await findClassByCode(db, TARGET_CLASS_CODE);
  if (!targetClass) {
    throw new Error(`Kelas dengan kode "${TARGET_CLASS_CODE}" tidak ditemukan di koleksi classes.`);
  }

  const { id: classId, ref: classRef, data: classData } = targetClass;
  const students = buildSeededStudents(classId);
  const discussions = buildSeededDiscussions({ classId, classData, students });

  const [usersSnap, membersSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('class_members').where('classId', '==', classId).get(),
  ]);

  const usersByUid = new Map();
  const userSyncOps = [];
  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data() || {};
    usersByUid.set(userDoc.id, data);
    const patch = computeSyncedUserPatch(data);
    if (patch) {
      userSyncOps.push({
        type: 'set',
        ref: userDoc.ref,
        data: patch,
        options: { merge: true },
        uid: userDoc.id,
        email: data.email,
      });
    }
  }

  const seededMemberIds = new Set(students.map((s) => s.memberId));
  const memberSyncOps = [];
  let survivingRealApprovedCount = 0;

  for (const memberDoc of membersSnap.docs) {
    const data = memberDoc.data() || {};
    if (seededMemberIds.has(memberDoc.id)) continue;

    const uid = String(data.uid || '').trim();
    const patch = computeSyncedMemberPatch(data, uid ? usersByUid.get(uid) || null : null);
    if (patch) {
      memberSyncOps.push({
        type: 'set',
        ref: memberDoc.ref,
        data: patch,
        options: { merge: true },
        memberId: memberDoc.id,
        uid,
      });
    }

    const effectiveStatus = String(patch?.status || data.status || 'approved').toLowerCase();
    if (effectiveStatus === 'approved' || effectiveStatus === 'active') {
      survivingRealApprovedCount += 1;
    }
  }

  const finalEnrolledCount = survivingRealApprovedCount + students.length;
  const currentMaxStudents = Number(classData.maxStudents || 0);
  const nextMaxStudents =
    currentMaxStudents > 0 && currentMaxStudents < finalEnrolledCount
      ? finalEnrolledCount
      : currentMaxStudents;

  console.log(`[seed-kerbut26] Mode: ${flags.mode.toUpperCase()}`);
  console.log(
    `[seed-kerbut26] Kelas target: id=${classId} code=${classData.code} title="${classData.title || classData.name || '-'}"`
  );
  console.log(
    `[seed-kerbut26] Rencana mahasiswa seed: ${students.length} akun (${students[0].nim}..${students[students.length - 1].nim} @mhs.unesa.ac.id)`
  );
  console.log(
    `[seed-kerbut26] Sinkronisasi akun asli @mhs.unesa.ac.id: users=${userSyncOps.length}, class_members=${memberSyncOps.length}`
  );
  console.log(
    `[seed-kerbut26] Pembaruan kelas: enrolledCount ${Number(classData.enrolledCount || 0)} -> ${finalEnrolledCount}` +
      (nextMaxStudents !== currentMaxStudents
        ? `, maxStudents ${currentMaxStudents} -> ${nextMaxStudents}`
        : '')
  );
  console.log(`[seed-kerbut26] Rencana topik diskusi Kecerdasan Buatan: ${discussions.length} topik`);
  for (const item of discussions) {
    console.log(
      `  - ${item.id} | Pertemuan ${String(item.doc.meetingNo).padStart(2, '0')} (${item.meetingTitle}) | balasan=${item.doc.replies.length} | likes=${item.doc.likes}`
    );
  }

  if (flags.dryRun) {
    console.log(
      '[seed-kerbut26] DRY-RUN selesai. Tidak ada data yang ditulis. Jalankan dengan --execute untuk menerapkan.'
    );
    return {
      mode: flags.mode,
      classId,
      seededStudents: students.length,
      seededDiscussions: discussions.length,
      syncedUsers: userSyncOps.length,
      syncedMembers: memberSyncOps.length,
      enrolledCount: finalEnrolledCount,
      maxStudents: nextMaxStudents,
    };
  }

  const writeOps = [];
  for (const student of students) {
    writeOps.push({
      type: 'set',
      ref: db.collection('users').doc(student.uid),
      data: student.userDoc,
      options: { merge: true },
    });
    writeOps.push({
      type: 'set',
      ref: db.collection('class_members').doc(student.memberId),
      data: student.memberDoc,
      options: { merge: true },
    });
  }

  for (const op of userSyncOps) {
    writeOps.push({ type: 'set', ref: op.ref, data: op.data, options: op.options });
  }
  for (const op of memberSyncOps) {
    writeOps.push({ type: 'set', ref: op.ref, data: op.data, options: op.options });
  }

  for (const item of discussions) {
    writeOps.push({
      type: 'set',
      ref: db.collection('discussions').doc(item.id),
      data: item.doc,
      options: { merge: true },
    });
  }

  writeOps.push({
    type: 'update',
    ref: classRef,
    data: {
      enrolledCount: finalEnrolledCount,
      ...(nextMaxStudents !== currentMaxStudents ? { maxStudents: nextMaxStudents } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
  });

  await commitBatchedOperations(db, writeOps);
  console.log(
    `[seed-kerbut26] EXECUTE selesai. Total operasi tulis=${writeOps.length}, enrolledCount=${finalEnrolledCount}.`
  );

  return {
    mode: flags.mode,
    classId,
    seededStudents: students.length,
    seededDiscussions: discussions.length,
    syncedUsers: userSyncOps.length,
    syncedMembers: memberSyncOps.length,
    enrolledCount: finalEnrolledCount,
    maxStudents: nextMaxStudents,
  };
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runSeedKerbut26().catch((err) => {
    console.error('[seed-kerbut26] Gagal:', err.message);
    process.exitCode = 1;
  });
}
