// Layanan Asisten AI Smartsa LMS (Google Gemini Server-Side & Proteksi Exam Lockout Firestore)
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

export function setLocalExamSession({
  classId,
  meetingNo = 1,
  examType,
  active,
  durationMs = 15 * 60 * 1000,
}) {
  try {
    if (active) {
      sessionStorage.setItem(
        ACTIVE_EXAM_SESSION_KEY,
        JSON.stringify({
          active: true,
          classId: classId || '',
          meetingNo: Number(meetingNo) || 1,
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
        detail: { active: Boolean(active), classId, meetingNo: Number(meetingNo) || 1, examType },
      })
    );
  }
}

export async function getActiveExamStatus() {
  const localSession = getLocalExamSession();
  if (localSession) {
    return { isExamActive: true, activeAttempt: localSession };
  }

  const user = auth?.currentUser;
  if (!user || !db) {
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
  const user = auth?.currentUser;
  if (user && db) {
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
    'Silakan pelajari modul perkuliahan terkait atau aktifkan sesi login/backend `/api/ai` untuk respons Google Gemini AI penuh.',
  ].join('\n');
}

const MAX_CLIENT_PROMPT_LENGTH = 2000;

export async function askAIAssistant({
  mode = 'learning',
  prompt,
  context = '',
  history = [],
  isExamActive = false,
}) {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) {
    throw new Error('Pertanyaan atau prompt tidak boleh kosong.');
  }
  if (cleanPrompt.length > MAX_CLIENT_PROMPT_LENGTH) {
    throw new Error(`Prompt terlalu panjang (maksimal ${MAX_CLIENT_PROMPT_LENGTH} karakter).`);
  }

  const liveExamCheck = await getActiveExamStatus();
  if (isExamActive || liveExamCheck.isExamActive) {
    throw new Error(
      'AKSES DITOLAK: Asisten AI dinonaktifkan secara otomatis selama sesi ujian aktif berlangsung.'
    );
  }

  const sanitizedHistory = Array.isArray(history)
    ? history
        .slice(-8)
        .map((item) => ({
          role: item?.role === 'user' || item?.sender === 'user' ? 'user' : 'model',
          text: String(item?.text || item?.content || '').trim().slice(0, 1000),
        }))
        .filter((item) => Boolean(item.text))
    : [];

  // Kirim permintaan ke endpoint backend /api/ai dengan Firebase ID Token
  if (auth?.currentUser) {
    let res;
    try {
      const token = await auth.currentUser.getIdToken();
      res = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode,
          prompt: cleanPrompt,
          context: typeof context === 'string' ? context.trim().slice(0, 4000) : '',
          history: sanitizedHistory,
          isExamActive: false,
        }),
      });
    } catch (networkErr) {
      if (import.meta.env.DEV) {
        return {
          text: buildLocalFrozenReply(mode, cleanPrompt),
          isLive: false,
          mode: 'local_frozen',
          note: `Endpoint /api/ai lokal belum terjangkau (${networkErr?.message || 'offline'}). Menggunakan panduan lokal pengembangan.`,
        };
      }
      throw new Error(
        `Gagal terhubung ke server AI (/api/ai): ${networkErr?.message || 'Kesalahan jaringan.'}`
      );
    }

    const contentType = res.headers?.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json().catch(() => null) : null;

    if (!res.ok) {
      if (res.status === 429) {
        const retryAfter = Number(data?.retryAfterSeconds || res.headers?.get('retry-after') || 0);
        throw new Error(
          data?.error ||
            `Batas kuota permintaan AI tercapai. Silakan coba lagi dalam ${retryAfter || 60} detik.`
        );
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(data?.error || 'Akses ke layanan AI ditolak.');
      }
      throw new Error(
        data?.error ||
          `Server AI mengembalikan error HTTP ${res.status}. Silakan periksa konfigurasi server atau coba lagi nanti.`
      );
    }

    if (data && typeof data.response_text === 'string') {
      return {
        text: data.response_text,
        isLive: Boolean(data.is_live),
        mode: data.mode || (data.is_live ? 'gemini_live' : 'local_frozen'),
        model: data.model || '',
        tokens: data.tokens_consumed || 0,
        remainingQuota:
          typeof data.remaining_quota === 'number' ? data.remaining_quota : undefined,
        note: data.note || null,
      };
    }

    throw new Error('Respons server /api/ai tidak valid atau bukan JSON.');
  }

  await new Promise((resolve) => setTimeout(resolve, 350));
  return {
    text: buildLocalFrozenReply(mode, cleanPrompt),
    isLive: false,
    mode: 'local_frozen',
    note: 'Mode Tamu/Offline: Masuk dengan akun terdaftar untuk mengakses Google Gemini AI melalui /api/ai.',
  };
}
