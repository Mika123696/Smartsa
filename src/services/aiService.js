// Abstraksi Layanan Asisten AI (Mode Asisten Lokal Terisolasi / Gemini API Ditunda)
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';

export const AI_STATUS = {
  LOCAL_FROZEN: 'LOCAL_FROZEN',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  READY_BACKEND: 'READY_BACKEND',
  ACTIVE: 'ACTIVE',
};

const ACTIVE_EXAM_SESSION_KEY = 'smartsa_active_exam_session';

function parseMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getLocalExamSession() {
  try {
    const raw = sessionStorage.getItem(ACTIVE_EXAM_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.active) return null;
    if (parsed.expiresAt && parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(ACTIVE_EXAM_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setLocalExamSession({ classId, examType, active, durationMs = 15 * 60 * 1000 }) {
  try {
    if (active) {
      sessionStorage.setItem(
        ACTIVE_EXAM_SESSION_KEY,
        JSON.stringify({
          active: true,
          classId: classId || 'subj_pbo',
          examType: examType || 'pretest',
          expiresAt: Date.now() + durationMs,
        })
      );
    } else {
      sessionStorage.removeItem(ACTIVE_EXAM_SESSION_KEY);
    }
  } catch {
    // ignore storage failures
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('smartsa_exam_status_changed', {
        detail: { active: Boolean(active), classId, examType },
      })
    );
  }
}

export async function getActiveExamStatus() {
  const localSession = getLocalExamSession();
  if (localSession) {
    return { isExamActive: true, activeAttempt: localSession };
  }

  const user = auth.currentUser;
  if (!user) {
    return { isExamActive: false, activeAttempt: null };
  }

  try {
    const q = query(collection(db, 'exam_attempts'), where('uid', '==', user.uid));
    const snap = await getDocs(q);
    const nowMs = Date.now();

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (data?.status !== 'in_progress' && data?.examActive !== true) continue;
      const expiresAtMs = parseMillis(data?.examExpiresAt);
      if (!expiresAtMs || expiresAtMs > nowMs) {
        return {
          isExamActive: true,
          activeAttempt: { id: docSnap.id, ...data },
        };
      }
    }
  } catch (err) {
    console.warn('[aiService] Gagal membaca status ujian dari Firestore:', err.message);
  }

  return { isExamActive: false, activeAttempt: null };
}

export function subscribeActiveExamStatus(onChange) {
  let firestoreActive = false;
  let firestoreAttempt = null;

  const emit = () => {
    const localSession = getLocalExamSession();
    const isExamActive = Boolean(localSession || firestoreActive);
    onChange({
      isExamActive,
      activeAttempt: localSession || firestoreAttempt,
    });
  };

  const handleWindowEvent = () => emit();
  if (typeof window !== 'undefined') {
    window.addEventListener('smartsa_exam_status_changed', handleWindowEvent);
  }

  let unsubFirestore = () => {};
  const user = auth.currentUser;
  if (user) {
    const q = query(collection(db, 'exam_attempts'), where('uid', '==', user.uid));
    unsubFirestore = onSnapshot(
      q,
      (snap) => {
        const nowMs = Date.now();
        const activeDoc = snap.docs.find((docSnap) => {
          const data = docSnap.data();
          if (data?.status !== 'in_progress' && data?.examActive !== true) return false;
          const expiresAtMs = parseMillis(data?.examExpiresAt);
          return !expiresAtMs || expiresAtMs > nowMs;
        });
        firestoreActive = Boolean(activeDoc);
        firestoreAttempt = activeDoc ? { id: activeDoc.id, ...activeDoc.data() } : null;
        emit();
      },
      () => {
        emit();
      }
    );
  } else {
    emit();
  }

  return () => {
    unsubFirestore();
    if (typeof window !== 'undefined') {
      window.removeEventListener('smartsa_exam_status_changed', handleWindowEvent);
    }
  };
}

function buildLocalFrozenReply(mode, prompt) {
  const lower = prompt.toLowerCase();
  if (mode === 'teaching') {
    if (lower.includes('rubrik') || lower.includes('proyek')) {
      return [
        '[MODE ASISTEN LOKAL — Draf Rubrik Penilaian]',
        '1. Arsitektur & Modularitas (35%): Pemisahan layer service, state, dan UI.',
        '2. Keamanan & Validasi (30%): Firestore Security Rules & verifikasi token server.',
        '3. Kualitas Implementasi (25%): Bebas error lint dan build produksi.',
        '4. Dokumentasi Teknis (10%): Kejelasan alur endpoint dan indeks komposit.',
      ].join('\n');
    }
    return [
      '[MODE ASISTEN LOKAL — Draf Teaching Assistant]',
      `Topik: "${prompt}"`,
      '• Saran Soal Pretest (C3): Mengapa evaluasi jawaban ujian harus dilakukan di endpoint backend (/api/grade) dibanding di state klien?',
      '• Saran Aktivitas: Minta mahasiswa memverifikasi skema deterministic ID pada koleksi submissions dan attendance.',
    ].join('\n');
  }

  if (lower.includes('sql') || lower.includes('firestore') || lower.includes('nosql')) {
    return [
      '[MODE ASISTEN LOKAL — Perbandingan SQL & Firestore NoSQL]',
      '• SQL: Terstruktur dalam tabel berelasi dengan skema ketat dan transaksi JOIN.',
      '• Cloud Firestore: Berbasis dokumen & koleksi NoSQL yang optimal untuk sinkronisasi real-time dan aturan keamanan berbasis path.',
    ].join('\n');
  }

  if (lower.includes('clean architecture') || lower.includes('arsitektur')) {
    return [
      '[MODE ASISTEN LOKAL — Clean Architecture]',
      'Clean Architecture memisahkan antarmuka (UI), logika aplikasi, dan akses data (repository/service) agar perubahan database atau API eksternal tidak merusak logika inti.',
    ].join('\n');
  }

  return [
    '[MODE ASISTEN LOKAL — Smartsa LMS]',
    `Pertanyaan Anda: "${prompt}"`,
    'Silakan pelajari modul Silabus, Delta JSON, dan panduan praktikum kelas terkait. Integrasi Gemini API live sedang ditunda pada fase ini.',
  ].join('\n');
}

export async function askAIAssistant({ mode = 'learning', prompt, context = '', isExamActive = false }) {
  if (!prompt || !prompt.trim()) {
    throw new Error('Pertanyaan atau prompt tidak boleh kosong.');
  }

  const liveExamCheck = await getActiveExamStatus();
  if (isExamActive || liveExamCheck.isExamActive) {
    throw new Error(
      'AKSES DITOLAK: Asisten AI dinonaktifkan secara otomatis selama sesi ujian aktif berlangsung.'
    );
  }

  // Kirim permintaan ke endpoint backend /api/ai dengan Firebase ID Token
  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mode, prompt, context, isExamActive: false }),
      });

      const isJson = res.headers.get('content-type')?.includes('application/json');
      if (isJson) {
        const data = await res.json();
        if (res.status === 401 || res.status === 403) {
          throw new Error(data.error || 'Akses ke layanan AI ditolak.');
        }
        if (res.ok) {
          return {
            text: data.response_text,
            isLive: Boolean(data.is_live),
            mode: data.mode || 'local_frozen',
            tokens: data.tokens_consumed || 0,
            note:
              data.note ||
              (data.is_live
                ? null
                : 'Mode Asisten Lokal (Integrasi Gemini API ditunda/dibekukan di server).'),
          };
        }
      }
    } catch (err) {
      if (err instanceof Error && (err.message.startsWith('AKSES DITOLAK') || err.message.includes('ditolak'))) {
        throw err;
      }
      // Fallback dev saat npm run dev (endpoint /api/* Vercel tidak aktif)
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 450));
  return {
    text: buildLocalFrozenReply(mode, prompt.trim()),
    isLive: false,
    mode: 'local_frozen',
    note: 'Mode Asisten Lokal (Integrasi Gemini API ditunda — berjalan tanpa panggilan API eksternal).',
  };
}
