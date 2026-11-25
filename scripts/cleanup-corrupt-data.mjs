/**
 * Skrip Pembersihan Aman Data Seed/Corrupt Lama di Cloud Firestore (Smartsa LMS).
 *
 * PROTEKSI KEAMANAN:
 * - Default mode adalah `--dry-run` (TIDAK melakukan penghapusan apa pun).
 * - Operasi hapus hanya berjalan bila flag eksplisit `--execute` disertakan.
 * - Koleksi `users` DIKECUALIKAN secara permanen dan tidak pernah disentuh.
 *
 * Penggunaan:
 *   node scripts/cleanup-corrupt-data.mjs                    # dry-run (default)
 *   node scripts/cleanup-corrupt-data.mjs --execute          # hapus dokumen korup/orphan
 *   node scripts/cleanup-corrupt-data.mjs --execute --include-seeded  # ikut hapus data seed awal
 */

import { pathToFileURL } from 'node:url';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const FORBIDDEN_COLLECTIONS = new Set(['users']);

export const TARGET_COLLECTIONS = [
  'classes',
  'class_members',
  'assignments',
  'submissions',
  'attendance',
  'discussions',
  'exam_attempts',
  'exams',
  'exam_keys',
  'learning_progress',
];

const SEEDED_CLASS_IDS = new Set([
  'subj_pbo',
  'subj_bd',
  'subj_pwmb',
  'subj_pda',
  'subj_uiux',
  'subj_ppl',
]);

const SEEDED_ASSIGNMENT_IDS = new Set(['asg_01', 'asg_02', 'asg_03', 'asg_04']);

export function parseCleanupFlags(argv = []) {
  const execute = argv.includes('--execute');
  const includeSeeded = argv.includes('--include-seeded');
  return {
    dryRun: !execute,
    execute,
    includeSeeded,
  };
}

export function assertSafeCollection(collectionName) {
  const clean = String(collectionName || '').trim();
  if (!clean || FORBIDDEN_COLLECTIONS.has(clean)) {
    throw new Error(`OPERASI DIBLOKIR: Koleksi "${clean || collectionName}" dilarang disentuh.`);
  }
  if (!TARGET_COLLECTIONS.includes(clean)) {
    throw new Error(`Koleksi "${clean}" tidak terdaftar dalam daftar pembersihan yang aman.`);
  }
}

function isAutoSeededMeetingsCorrupt(meetings) {
  if (!Array.isArray(meetings) || meetings.length !== 16) return false;
  return Boolean(
    meetings[0]?.title?.startsWith('Modul Pembelajaran 01') &&
      meetings[15]?.title?.startsWith('Modul Pembelajaran 16')
  );
}

function isLegacyAttemptId(docId) {
  return !/_m\d+_(pretest|posttest)_/.test(String(docId || ''));
}

/**
 * Menghitung daftar target penghapusan tanpa menyentuh Firestore maupun koleksi `users`.
 * @param {Record<string, Array<{ id: string, data: Record<string, unknown> }>>} docsByCollection
 * @param {{ includeSeeded?: boolean }} options
 */
export function planCleanupTargets(docsByCollection = {}, { includeSeeded = false } = {}) {
  const targets = {};
  TARGET_COLLECTIONS.forEach((col) => {
    targets[col] = [];
  });

  const classDocs = Array.isArray(docsByCollection.classes) ? docsByCollection.classes : [];
  const survivingClassIds = new Set();

  for (const docItem of classDocs) {
    const id = docItem.id;
    const data = docItem.data || {};
    const lecturerId = String(data.lecturerId || '').trim();

    let reason = null;
    if (!lecturerId || lecturerId === 'demo_lecturer') {
      reason = 'missing_or_demo_lecturerId';
    } else if (includeSeeded && SEEDED_CLASS_IDS.has(id)) {
      reason = 'seeded_class';
    } else if (
      isAutoSeededMeetingsCorrupt(data.meetings) &&
      (!includeSeeded ? !SEEDED_CLASS_IDS.has(id) : true)
    ) {
      reason = 'corrupt_autoseed_16_meetings';
    }

    if (reason) {
      targets.classes.push({ id, reason });
    } else {
      survivingClassIds.add(id);
    }
  }

  for (const colName of TARGET_COLLECTIONS) {
    if (colName === 'classes') continue;
    assertSafeCollection(colName);

    const colDocs = Array.isArray(docsByCollection[colName]) ? docsByCollection[colName] : [];
    for (const docItem of colDocs) {
      const id = docItem.id;
      const data = docItem.data || {};
      const classId = String(data.classId || '').trim();

      let reason = null;
      if (colName === 'assignments' && includeSeeded && SEEDED_ASSIGNMENT_IDS.has(id)) {
        reason = 'seeded_assignment';
      } else if (colName === 'exam_attempts' && isLegacyAttemptId(id)) {
        reason = 'legacy_exam_attempt_id_without_meeting_type';
      } else if (colName === 'exam_keys') {
        const keyClassId = classId || id;
        if (!survivingClassIds.has(keyClassId)) {
          reason = 'orphan_exam_key_missing_parent_class';
        }
      } else if (!classId) {
        reason = 'missing_classId';
      } else if (!survivingClassIds.has(classId)) {
        reason = `orphan_classId_${classId}`;
      }

      if (reason) {
        targets[colName].push({ id, reason });
      }
    }
  }

  const totalTargets = Object.values(targets).reduce((acc, list) => acc + list.length, 0);
  return { targets, totalTargets, survivingClassIds: Array.from(survivingClassIds) };
}

function initFirebaseAdmin() {
  if (getApps().length > 0) return;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    const parsed = JSON.parse(serviceAccountJson);
    if (typeof parsed.private_key === 'string') {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    initializeApp({ credential: cert(parsed) });
    return;
  }

  initializeApp({
    credential: applicationDefault(),
    ...(process.env.FIREBASE_PROJECT_ID ? { projectId: process.env.FIREBASE_PROJECT_ID } : {}),
  });
}

export async function runCleanup(argv = process.argv.slice(2)) {
  const flags = parseCleanupFlags(argv);
  initFirebaseAdmin();
  const db = getFirestore();

  const docsByCollection = {};
  for (const colName of TARGET_COLLECTIONS) {
    assertSafeCollection(colName);
    const snap = await db.collection(colName).get();
    docsByCollection[colName] = snap.docs.map((d) => ({ id: d.id, data: d.data() || {} }));
  }

  const plan = planCleanupTargets(docsByCollection, { includeSeeded: flags.includeSeeded });
  console.log(
    `[cleanup-corrupt-data] dryRun=${flags.dryRun} includeSeeded=${flags.includeSeeded} totalTargets=${plan.totalTargets}`
  );

  let deletedCount = 0;
  for (const colName of TARGET_COLLECTIONS) {
    assertSafeCollection(colName);
    const colTargets = plan.targets[colName] || [];
    if (colTargets.length === 0) continue;

    console.log(
      `  - ${colName}: ${colTargets.length} doc(s) -> ${colTargets.map((t) => `${t.id}(${t.reason})`).join(', ')}`
    );

    if (flags.execute) {
      for (let i = 0; i < colTargets.length; i += 400) {
        const batch = db.batch();
        const slice = colTargets.slice(i, i + 400);
        slice.forEach((item) => {
          batch.delete(db.collection(colName).doc(item.id));
        });
        await batch.commit();
        deletedCount += slice.length;
      }
    }
  }

  console.log(
    flags.dryRun
      ? `[cleanup-corrupt-data] DRY-RUN selesai. Tidak ada dokumen yang dihapus. Jalankan dengan --execute untuk mengeksekusi penghapusan.`
      : `[cleanup-corrupt-data] EXECUTE selesai. Total dokumen dihapus: ${deletedCount}. Koleksi users tidak tersentuh.`
  );

  return { flags, plan, deletedCount };
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runCleanup().catch((err) => {
    console.error('[cleanup-corrupt-data] Gagal:', err.message);
    process.exitCode = 1;
  });
}
