import { createHash } from 'node:crypto';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  ACCOUNT_TYPES,
  classifyAccountByEmail,
  parseEmailAddress,
  resolveEmailDomain,
} from '../lib/domains.js';

function initFirebaseAdmin() {
  if (getApps().length > 0) return;

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    const parsed = JSON.parse(serviceAccountKey);
    if (typeof parsed.private_key === 'string') {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    initializeApp({
      credential: cert(parsed),
    });
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    return;
  }

  initializeApp({
    credential: applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });
}

function resolveMeetingAnswerKey(keyData, meetingNo, examType) {
  if (!keyData || typeof keyData !== 'object') return null;

  const meetingBucket = keyData.meetings?.[String(meetingNo)];
  if (meetingBucket && typeof meetingBucket === 'object') {
    const meetingKey = meetingBucket[examType];
    if (meetingKey && typeof meetingKey === 'object' && Object.keys(meetingKey).length > 0) {
      return meetingKey;
    }
  }

  const legacyMap = keyData?.[examType] || keyData?.answers || keyData?.questions;
  if (legacyMap && typeof legacyMap === 'object' && Object.keys(legacyMap).length > 0) {
    return legacyMap;
  }

  return null;
}

function sanitizeExamPayload(rawQuestions, rawAnswerKey) {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    return { error: 'Minimal 1 soal evaluasi wajib diisi.', code: 'INVALID_QUESTIONS' };
  }
  if (rawQuestions.length > 50) {
    return { error: 'Maksimal 50 soal per sesi evaluasi.', code: 'TOO_MANY_QUESTIONS' };
  }
  if (!rawAnswerKey || typeof rawAnswerKey !== 'object' || Array.isArray(rawAnswerKey)) {
    return { error: 'Peta kunci jawaban (answerKey) wajib berupa objek valid.', code: 'INVALID_ANSWER_KEY' };
  }

  const sanitizedQuestions = [];
  const sanitizedAnswerKey = {};
  const seenIds = new Set();

  for (let i = 0; i < rawQuestions.length; i += 1) {
    const q = rawQuestions[i];
    const qId = String(q?.id || `q${i + 1}`)
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '');
    const questionText = String(q?.question || '').trim();
    const options = Array.isArray(q?.options)
      ? q.options.map((opt) => String(opt || '').trim())
      : [];

    if (!qId || seenIds.has(qId)) {
      return { error: `ID soal ke-${i + 1} tidak valid atau duplikat.`, code: 'INVALID_QUESTION_ID' };
    }
    if (!questionText) {
      return { error: `Teks pertanyaan soal ke-${i + 1} tidak boleh kosong.`, code: 'EMPTY_QUESTION_TEXT' };
    }
    if (options.length < 2 || options.length > 6 || options.some((opt) => !opt)) {
      return {
        error: `Soal ke-${i + 1} harus memiliki 2 hingga 6 pilihan jawaban yang tidak kosong.`,
        code: 'INVALID_OPTIONS',
      };
    }

    const refIdx = rawAnswerKey[qId];
    if (!Number.isInteger(refIdx) || refIdx < 0 || refIdx >= options.length) {
      return {
        error: `Kunci jawaban untuk soal ${qId} harus berupa indeks opsi valid (0–${options.length - 1}).`,
        code: 'INVALID_ANSWER_INDEX',
      };
    }

    seenIds.add(qId);
    sanitizedQuestions.push({
      id: qId,
      question: questionText,
      options,
    });
    sanitizedAnswerKey[qId] = refIdx;
  }

  return { sanitizedQuestions, sanitizedAnswerKey };
}

const ALLOWED_CORS_METHODS = 'POST, OPTIONS';
const ALLOWED_CORS_HEADERS = 'Authorization, Content-Type';
const DEFAULT_CORS_FALLBACK_ORIGIN = 'http://localhost:5173';

function parseCorsOrigin(rawOrigin) {
  if (typeof rawOrigin !== 'string') return null;
  const trimmed = rawOrigin.trim();
  if (!trimmed || trimmed.includes(',')) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password || parsed.origin === 'null') return null;
    return parsed;
  } catch {
    return null;
  }
}

function isLocalDevOrigin(originUrl) {
  return (
    (originUrl.protocol === 'http:' || originUrl.protocol === 'https:') &&
    (originUrl.hostname === 'localhost' ||
      originUrl.hostname === '127.0.0.1' ||
      originUrl.hostname === '[::1]')
  );
}

function isVercelPreviewOrigin(originUrl) {
  return (
    originUrl.protocol === 'https:' &&
    originUrl.hostname.endsWith('.vercel.app') &&
    originUrl.hostname.length > '.vercel.app'.length &&
    !originUrl.hostname.startsWith('.')
  );
}

function getConfiguredCorsAllowlist() {
  const rawList = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  let allowAll = false;
  const explicitOrigins = [];

  for (const entry of rawList) {
    if (entry === '*') {
      allowAll = true;
      continue;
    }
    const parsed = parseCorsOrigin(entry);
    if (parsed && !explicitOrigins.includes(parsed.origin)) {
      explicitOrigins.push(parsed.origin);
    }
  }

  const vercelOrigins = [];
  for (const envHost of [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ]) {
    if (!envHost || typeof envHost !== 'string') continue;
    const candidate = envHost.startsWith('http://') || envHost.startsWith('https://')
      ? envHost.trim()
      : `https://${envHost.trim()}`;
    const parsed = parseCorsOrigin(candidate);
    if (parsed && !vercelOrigins.includes(parsed.origin)) {
      vercelOrigins.push(parsed.origin);
    }
  }

  return { allowAll, explicitOrigins, vercelOrigins };
}

function resolveCorsAllowOrigin(req) {
  const { allowAll, explicitOrigins, vercelOrigins } = getConfiguredCorsAllowlist();
  if (allowAll) {
    return '*';
  }

  const rawOrigin = String(req?.headers?.origin || req?.headers?.Origin || '').trim();
  if (!rawOrigin) {
    return explicitOrigins[0] || vercelOrigins[0] || DEFAULT_CORS_FALLBACK_ORIGIN;
  }

  const parsed = parseCorsOrigin(rawOrigin);
  if (!parsed) {
    return null;
  }

  if (
    explicitOrigins.includes(parsed.origin) ||
    vercelOrigins.includes(parsed.origin) ||
    isLocalDevOrigin(parsed) ||
    isVercelPreviewOrigin(parsed)
  ) {
    return parsed.origin;
  }

  return null;
}

export function applyCorsHeaders(req, res) {
  if (!res || typeof res.setHeader !== 'function') return;

  const allowedOrigin = resolveCorsAllowOrigin(req);
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  } else if (typeof res.removeHeader === 'function') {
    res.removeHeader('Access-Control-Allow-Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', ALLOWED_CORS_METHODS);
  res.setHeader('Access-Control-Allow-Headers', ALLOWED_CORS_HEADERS);
  res.setHeader('Vary', 'Origin');
}

function sendJson(res, statusCode, payload, req = null, extraHeaders = null) {
  if (req) {
    applyCorsHeaders(req, res);
  }
  if (extraHeaders && typeof extraHeaders === 'object') {
    for (const [key, value] of Object.entries(extraHeaders)) {
      if (value !== undefined && value !== null) {
        res.setHeader(key, String(value));
      }
    }
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const UPLOAD_SIGN_MAX_REQUESTS = 10;
const JOIN_CLASS_MAX_FAILURES = 5;
const EXAM_DEADLINE_GRACE_MS = 60_000;
const VALID_CLASS_CODE_REGEX = /^[A-Z0-9]{6,12}$/;

function parseTimestampMillis(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return null;
  if (typeof rawValue?.toMillis === 'function') {
    const ms = rawValue.toMillis();
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  if (typeof rawValue === 'number') {
    return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : null;
  }
  if (rawValue instanceof Date) {
    const ms = rawValue.getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      return Number.isFinite(num) && num > 0 ? num : null;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

async function runRateLimitTx(
  db,
  { scope, uid, maxAttempts, windowMs = RATE_LIMIT_WINDOW_MS, increment = true }
) {
  const safeScope = String(scope || 'global').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeUid = String(uid || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '');
  const rateRef = db.collection('rate_limits').doc(`${safeScope}_${safeUid}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(rateRef);
    const nowMs = Date.now();
    const data = snap?.exists ? snap.data() || {} : null;
    const windowExpired = !data || !Number.isFinite(data.resetAtMs) || nowMs >= data.resetAtMs;
    const currentCount = windowExpired ? 0 : Math.max(0, Number(data.count || 0));
    const windowStartMs = windowExpired ? nowMs : Number(data.windowStartMs || nowMs);
    const resetAtMs = windowExpired ? nowMs + windowMs : Number(data.resetAtMs);

    if (currentCount >= maxAttempts) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000));
      return {
        allowed: false,
        count: currentCount,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    if (!increment) {
      return {
        allowed: true,
        count: currentCount,
        remaining: Math.max(0, maxAttempts - currentCount),
        retryAfterSeconds: 0,
      };
    }

    const nextCount = currentCount + 1;
    tx.set(
      rateRef,
      {
        scope: safeScope,
        uid: safeUid,
        count: nextCount,
        windowStartMs,
        resetAtMs,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      allowed: true,
      count: nextCount,
      remaining: Math.max(0, maxAttempts - nextCount),
      retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000)),
    };
  });
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string') {
    return req.body ? JSON.parse(req.body) : {};
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

async function verifyBearerToken(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    const err = new Error('Missing or invalid Authorization Bearer token.');
    err.statusCode = 401;
    throw err;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    const err = new Error('Empty Firebase ID token.');
    err.statusCode = 401;
    throw err;
  }

  try {
    return await getAuth().verifyIdToken(idToken);
  } catch {
    const err = new Error('Invalid or expired Firebase ID token.');
    err.statusCode = 401;
    throw err;
  }
}

function buildLocalAssistantResponse({ mode = 'learning', prompt = '', context = '' }) {
  const lower = prompt.toLowerCase();
  if (mode === 'teaching') {
    if (lower.includes('rubrik') || lower.includes('proyek')) {
      return [
        '[MODE ASISTEN LOKAL — Draf Rubrik Penilaian]',
        `Konteks: ${context || 'Smartsa LMS'}`,
        '1. Arsitektur & Modularitas (35%): Pemisahan layer service, state, dan UI.',
        '2. Keamanan & Validasi Data (30%): Penerapan Firestore Rules & token backend.',
        '3. Kualitas Implementasi & Uji Coba (25%): Bebas error lint dan build sukses.',
        '4. Dokumentasi Teknis (10%): Kejelasan alur API dan skema koleksi.',
      ].join('\n');
    }
    return [
      '[MODE ASISTEN LOKAL — Draf Teaching Assistant]',
      `Topik Permintaan: "${prompt}"`,
      '• Tujuan Pembelajaran (C3-C4): Mahasiswa mampu merancang dan memvalidasi arsitektur data pada Cloud Firestore.',
      '• Contoh Soal Pretest: Mengapa kunci jawaban ujian harus dievaluasi pada endpoint serverless (/api/grade) alih-alih di state React klien?',
      '• Catatan: Integrasi live Google Gemini LLM sedang dibekukan sementara pada fase ini.',
    ].join('\n');
  }

  if (lower.includes('sql') || lower.includes('firestore') || lower.includes('nosql')) {
    return [
      '[MODE ASISTEN LOKAL — Ringkasan Konsep Basis Data]',
      '• SQL (Relasional): Data tersimpan dalam tabel terstruktur dengan skema ketat dan JOIN relasional.',
      '• Cloud Firestore (NoSQL): Data tersimpan sebagai dokumen dalam koleksi, mendukung sinkronisasi real-time dan penskalaan horizontal.',
      '• Catatan: Mode ini berjalan lokal sementara integrasi Gemini API ditunda.',
    ].join('\n');
  }

  if (lower.includes('clean architecture') || lower.includes('arsitektur')) {
    return [
      '[MODE ASISTEN LOKAL — Clean Architecture]',
      'Clean Architecture memisahkan tanggung jawab menjadi UI/Presentation, Application/Use-Case, dan Data/Repository agar logika bisnis tidak bergantung langsung pada framework atau SDK eksternal.',
      'Catatan: Mode ini berjalan lokal sementara integrasi Gemini API ditunda.',
    ].join('\n');
  }

  return [
    '[MODE ASISTEN LOKAL — Smartsa LMS]',
    `Pertanyaan diterima: "${prompt}"`,
    'Saran pembelajaran: Tinjau modul Silabus, Delta JSON, dan dokumentasi koleksi Firestore pada kelas aktif Anda. Layanan Gemini AI Live sedang dibekukan sementara.',
  ].join('\n');
}

async function handleAi(body, decodedToken) {
  const { mode = 'learning', prompt, context = '', isExamActive = false } = body || {};

  if (isExamActive === true) {
    return {
      status: 403,
      payload: {
        error: 'AKSES DITOLAK: Asisten AI dinonaktifkan selama sesi ujian aktif.',
        code: 'EXAM_LOCKOUT',
      },
    };
  }

  // Verifikasi status ujian aktif nyata di Firestore (exam_attempts)
  const db = getFirestore();
  try {
    const attemptSnap = await db
      .collection('exam_attempts')
      .where('uid', '==', decodedToken.uid)
      .get();

    const nowMs = Date.now();
    const hasActiveExamInFirestore = attemptSnap.docs.some((docSnap) => {
      const data = docSnap.data();
      const isInProgress =
        data?.status === 'in_progress' ||
        (data?.examActive === true && data?.status !== 'submitted');
      if (!isInProgress) {
        return false;
      }
      const expiresAtMs =
        typeof data?.examExpiresAt?.toMillis === 'function'
          ? data.examExpiresAt.toMillis()
          : typeof data?.examExpiresAt === 'number'
          ? data.examExpiresAt
          : 0;
      return !expiresAtMs || expiresAtMs > nowMs;
    });

    if (hasActiveExamInFirestore) {
      return {
        status: 403,
        payload: {
          error: 'AKSES DITOLAK: Anda terdeteksi sedang memiliki sesi ujian aktif di Firestore.',
          code: 'EXAM_LOCKOUT',
        },
      };
    }
  } catch (err) {
    console.warn('[api/ai] exam_attempts check warning:', err.message);
  }

  if (typeof prompt !== 'string' || !prompt.trim()) {
    return {
      status: 400,
      payload: { error: 'Prompt tidak boleh kosong.', code: 'INVALID_PROMPT' },
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      status: 200,
      payload: {
        response_text: buildLocalAssistantResponse({
          mode,
          prompt: prompt.trim(),
          context,
        }),
        tokens_consumed: 0,
        mode: 'local_frozen',
        is_live: false,
        note: 'Mode Asisten Lokal (Integrasi Gemini API ditunda/belum dikonfigurasi di server).',
      },
    };
  }

  const systemPrompt =
    mode === 'teaching'
      ? 'Anda adalah Smartsa Teaching Assistant AI untuk dosen/pendidik. Bantu menyusun silabus, rubrik penilaian, dan draf soal Bloom taxonomy secara terstruktur.'
      : 'Anda adalah Smartsa Learning Assistant AI untuk mahasiswa. Jelaskan konsep dengan analogi jelas, ringkas, dan dilarang memberikan kunci jawaban ujian aktif.';

  const combinedText = context
    ? `${systemPrompt}\n\nKonteks Materi: ${context}\n\nPertanyaan: ${prompt.trim()}`
    : `${systemPrompt}\n\nPertanyaan: ${prompt.trim()}`;

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const geminiRes = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: combinedText }] }],
    }),
  });

  if (!geminiRes.ok) {
    const errorText = await geminiRes.text();
    return {
      status: 502,
      payload: {
        error: `Gemini API error (${geminiRes.status}): ${errorText.slice(0, 200)}`,
        code: 'GEMINI_UPSTREAM_ERROR',
      },
    };
  }

  const data = await geminiRes.json();
  const responseText =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('\n').trim() ||
    'Tidak ada respons dari model AI.';
  const tokensConsumed =
    data?.usageMetadata?.totalTokenCount ||
    (data?.usageMetadata?.promptTokenCount || 0) + (data?.usageMetadata?.candidatesTokenCount || 0) ||
    150;

  return {
    status: 200,
    payload: {
      response_text: responseText,
      tokens_consumed: tokensConsumed,
      mode: 'gemini_live',
      is_live: true,
    },
  };
}

async function handleUploadSign(body, decodedToken) {
  const uid = String(decodedToken?.uid || '').trim();
  if (!uid) {
    return {
      status: 401,
      payload: { error: 'Token pengguna tidak memiliki UID yang valid.', code: 'UNAUTHORIZED' },
    };
  }

  const db = getFirestore();
  const callerRole = await resolveCallerRole(db, decodedToken);
  if (callerRole !== 'lecturer' && callerRole !== 'admin') {
    return {
      status: 403,
      payload: {
        error: 'AKSES DITOLAK: Hanya dosen atau admin yang dapat membuat signature upload Cloudinary.',
        code: 'FORBIDDEN_ROLE',
      },
    };
  }

  const rateResult = await runRateLimitTx(db, {
    scope: 'upload_sign',
    uid,
    maxAttempts: UPLOAD_SIGN_MAX_REQUESTS,
    windowMs: RATE_LIMIT_WINDOW_MS,
    increment: true,
  });

  if (!rateResult.allowed) {
    return {
      status: 429,
      headers: { 'Retry-After': String(rateResult.retryAfterSeconds) },
      payload: {
        error: 'Terlalu banyak permintaan signature upload. Silakan coba lagi beberapa saat lagi.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds: rateResult.retryAfterSeconds,
      },
    };
  }

  const { category = 'image' } = body || {};
  if (category !== 'image' && category !== 'document') {
    return {
      status: 400,
      payload: { error: 'Kategori berkas tidak valid.', code: 'INVALID_CATEGORY' },
    };
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return {
      status: 503,
      payload: {
        error: 'Cloudinary environment variables belum dikonfigurasi di server.',
        code: 'CLOUDINARY_NOT_CONFIGURED',
      },
    };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = category === 'document' ? 'smartsa/documents' : 'smartsa/images';
  const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = createHash('sha1').update(`${paramsToSign}${apiSecret}`).digest('hex');

  return {
    status: 200,
    payload: {
      signature,
      timestamp,
      api_key: apiKey,
      cloud_name: cloudName,
      folder,
    },
  };
}

const ROLE_RANK = Object.freeze({
  student: 1,
  lecturer: 2,
  admin: 3,
});

const ACCOUNT_TYPE_RANK = Object.freeze({
  [ACCOUNT_TYPES.UMUM]: 1,
  [ACCOUNT_TYPES.MAHASISWA]: 2,
  [ACCOUNT_TYPES.DOSEN]: 3,
});

function sanitizeValidRole(value) {
  if (value === 'admin' || value === 'lecturer' || value === 'student') {
    return value;
  }
  return null;
}

function sanitizeValidAccountType(value) {
  if (
    value === ACCOUNT_TYPES.DOSEN ||
    value === ACCOUNT_TYPES.MAHASISWA ||
    value === ACCOUNT_TYPES.UMUM
  ) {
    return value;
  }
  return null;
}

function sanitizeHttpPhotoUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048 || trimmed.startsWith('data:')) {
    return null;
  }
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  return null;
}

function pickHighestRank(candidates, rankMap, fallback) {
  let best = fallback;
  let bestRank = rankMap[fallback] || 0;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const rank = rankMap[candidate] || 0;
    if (rank > bestRank) {
      best = candidate;
      bestRank = rank;
    }
  }
  return best;
}

async function resolveCallerRole(db, decodedToken) {
  if (decodedToken?.role === 'admin' || decodedToken?.role === 'lecturer') {
    return decodedToken.role;
  }
  const emailInfo = resolveEmailDomain(decodedToken?.email || '');
  if (emailInfo.role === 'admin' || emailInfo.role === 'lecturer') {
    return emailInfo.role;
  }
  try {
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (userDoc.exists) {
      return userDoc.data()?.role || 'student';
    }
  } catch (err) {
    console.warn('[api/grade] resolveCallerRole warning:', err.message);
  }
  return 'student';
}

async function handleBootstrap(body, decodedToken) {
  const uid = String(decodedToken?.uid || '').trim();
  if (!uid) {
    return {
      status: 401,
      payload: { error: 'Token pengguna tidak memiliki UID yang valid.', code: 'UNAUTHORIZED' },
    };
  }

  const parsedEmail = parseEmailAddress(decodedToken?.email || '');
  const cleanEmail = parsedEmail.valid
    ? parsedEmail.email
    : String(decodedToken?.email || '').trim().toLowerCase();
  const emailVerified = Boolean(decodedToken?.email_verified);
  const domainClassification = classifyAccountByEmail(cleanEmail, {
    emailVerified,
    requireVerified: true,
  });

  const tokenRoleClaim = sanitizeValidRole(decodedToken?.role);
  const domainRole = sanitizeValidRole(domainClassification.role) || 'student';

  const tokenName = String(decodedToken?.name || decodedToken?.displayName || '').trim();
  const bodyName = String(body?.displayName || body?.name || '').trim();
  const emailLocalName = cleanEmail ? cleanEmail.split('@')[0] : '';
  const initialDisplayName = bodyName || tokenName || emailLocalName || 'Pengguna Smartsa';
  const candidatePhoto = sanitizeHttpPhotoUrl(
    decodedToken?.picture || decodedToken?.photoURL || body?.photoURL
  );
  const bodyInstitution = String(body?.institution || '').trim();
  const bodyNim = String(body?.nim || '').trim();

  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);

  const txResult = await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const rawExisting = userSnap.exists ? userSnap.data() || {} : null;
    const { password: _removedPassword, ...existingData } = rawExisting || {};

    const dbRole = sanitizeValidRole(existingData.role);
    const resolvedRole = pickHighestRank([dbRole, tokenRoleClaim, domainRole], ROLE_RANK, 'student');

    const dbAccountType = sanitizeValidAccountType(existingData.accountType);
    const domainAccountType =
      sanitizeValidAccountType(domainClassification.accountType) || ACCOUNT_TYPES.UMUM;
    const roleFloorAccountType =
      resolvedRole === 'admin' || resolvedRole === 'lecturer'
        ? ACCOUNT_TYPES.DOSEN
        : ACCOUNT_TYPES.UMUM;
    const resolvedAccountType = pickHighestRank(
      [dbAccountType, domainAccountType, roleFloorAccountType],
      ACCOUNT_TYPE_RANK,
      ACCOUNT_TYPES.UMUM
    );

    const resolvedIsInstitutional = Boolean(
      existingData.isInstitutional ||
        resolvedAccountType !== ACCOUNT_TYPES.UMUM ||
        resolvedRole === 'admin' ||
        resolvedRole === 'lecturer'
    );

    const effectiveEmail = cleanEmail || String(existingData.email || '').trim().toLowerCase();

    if (!userSnap.exists) {
      const resolvedInstitution =
        bodyInstitution ||
        (resolvedRole === 'admin'
          ? 'Smartsa Central Administration'
          : 'Universitas Negeri Surabaya');

      const newUserDoc = {
        uid,
        email: effectiveEmail,
        name: initialDisplayName,
        displayName: initialDisplayName,
        photoURL: candidatePhoto,
        role: resolvedRole,
        accountType: resolvedAccountType,
        isInstitutional: resolvedIsInstitutional,
        emailVerified,
        institution: resolvedInstitution,
        nim: bodyNim,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        last_active: FieldValue.serverTimestamp(),
      };

      tx.set(userRef, newUserDoc);

      return {
        isNewUser: true,
        profile: {
          uid,
          email: effectiveEmail,
          name: initialDisplayName,
          displayName: initialDisplayName,
          photoURL: candidatePhoto,
          role: resolvedRole,
          accountType: resolvedAccountType,
          isInstitutional: resolvedIsInstitutional,
          emailVerified,
          institution: resolvedInstitution,
          nim: bodyNim,
        },
      };
    }

    const hasExistingDisplayName =
      typeof existingData.displayName === 'string' && existingData.displayName.trim().length > 0;
    const hasExistingName =
      typeof existingData.name === 'string' && existingData.name.trim().length > 0;
    const hasExistingPhoto = 'photoURL' in existingData;

    const preservedDisplayName = hasExistingDisplayName
      ? existingData.displayName
      : hasExistingName
        ? existingData.name
        : initialDisplayName;
    const preservedName = hasExistingName ? existingData.name : preservedDisplayName;
    const preservedPhotoURL = hasExistingPhoto ? existingData.photoURL : candidatePhoto;

    const updatePatch = {
      uid,
      ...(cleanEmail && existingData.email !== cleanEmail ? { email: cleanEmail } : {}),
      ...(!hasExistingDisplayName ? { displayName: preservedDisplayName } : {}),
      ...(!hasExistingName ? { name: preservedName } : {}),
      ...(!hasExistingPhoto ? { photoURL: preservedPhotoURL } : {}),
      ...(!existingData.createdAt ? { createdAt: FieldValue.serverTimestamp() } : {}),
      role: resolvedRole,
      accountType: resolvedAccountType,
      isInstitutional: resolvedIsInstitutional,
      emailVerified,
      updatedAt: FieldValue.serverTimestamp(),
      last_active: FieldValue.serverTimestamp(),
    };

    tx.set(userRef, updatePatch, { merge: true });

    return {
      isNewUser: false,
      profile: {
        ...existingData,
        uid,
        email: effectiveEmail,
        name: preservedName,
        displayName: preservedDisplayName,
        photoURL: preservedPhotoURL,
        role: resolvedRole,
        accountType: resolvedAccountType,
        isInstitutional: resolvedIsInstitutional,
        emailVerified,
      },
    };
  });

  return {
    status: 200,
    payload: {
      success: true,
      isNewUser: txResult.isNewUser,
      profile: {
        ...txResult.profile,
        last_active: new Date().toISOString(),
      },
    },
  };
}

async function verifyClassInstructorOwnership(
  db,
  {
    safeClassId,
    decodedToken,
    callerRole,
    forbiddenCode = 'FORBIDDEN_CLASS_OWNER',
    forbiddenMessage = 'AKSES DITOLAK: Hanya dosen pengampu kelas ini atau admin yang dapat mengelola kelas ini.',
  }
) {
  const classSnap = await db.collection('classes').doc(safeClassId).get();
  if (!classSnap?.exists) {
    return {
      ok: false,
      response: {
        status: 404,
        payload: { error: 'Kelas tidak ditemukan di Firestore.', code: 'CLASS_NOT_FOUND' },
      },
    };
  }

  if (callerRole !== 'admin' && classSnap.data()?.lecturerId !== decodedToken.uid) {
    return {
      ok: false,
      response: {
        status: 403,
        payload: {
          error: forbiddenMessage,
          code: forbiddenCode,
        },
      },
    };
  }

  return { ok: true, classSnap };
}

async function verifyApprovedClassMember(db, { safeClassId, uid, callerRole }) {
  if (callerRole === 'admin') {
    return { ok: true, memberData: null };
  }

  const memberSnap = await db.collection('class_members').doc(`${safeClassId}_${uid}`).get();
  const memberData = memberSnap?.exists ? memberSnap.data() || {} : null;
  const memberStatus = memberData?.status;
  const isApprovedStatus =
    memberStatus === undefined ||
    memberStatus === null ||
    memberStatus === '' ||
    memberStatus === 'approved' ||
    memberStatus === 'active';

  if (!memberSnap?.exists || !isApprovedStatus) {
    return {
      ok: false,
      response: {
        status: 403,
        payload: {
          error: memberSnap?.exists
            ? 'Keanggotaan kelas Anda masih menunggu persetujuan dosen/admin.'
            : 'AKSES DITOLAK: Anda bukan anggota aktif di kelas ini.',
          code: 'NOT_CLASS_MEMBER',
        },
      },
    };
  }

  return { ok: true, memberData };
}

async function resolveCallerStudentIdentity(db, decodedToken, existingAttempt = null) {
  let userData = null;
  try {
    const usersCol = db.collection('users');
    if (usersCol && typeof usersCol.doc === 'function') {
      const userDoc = await usersCol.doc(decodedToken.uid).get();
      if (userDoc?.exists) {
        userData = userDoc.data() || {};
      }
    }
  } catch (err) {
    console.warn('[api/grade] resolveCallerStudentIdentity warning:', err.message);
  }

  const studentName = String(
    userData?.displayName ||
      userData?.name ||
      decodedToken?.name ||
      decodedToken?.displayName ||
      existingAttempt?.studentName ||
      ''
  ).trim();
  const studentEmail = String(
    userData?.email || decodedToken?.email || existingAttempt?.studentEmail || ''
  ).trim();

  return { studentName, studentEmail };
}

async function handleGrade(body, decodedToken) {
  const uid = String(decodedToken?.uid || '').trim();
  if (!uid) {
    return {
      status: 401,
      payload: { error: 'Token pengguna tidak memiliki UID yang valid.', code: 'UNAUTHORIZED' },
    };
  }

  const {
    classId = '',
    meetingNo = 1,
    examType = 'pretest',
    answers = {},
    questions = [],
    answerKey: incomingAnswerKey = null,
    title = '',
    status: incomingStatus = undefined,
    durationMinutes: incomingDurationMinutes = undefined,
    deadline: incomingDeadline = undefined,
    action = 'submit',
  } = body || {};
  const safeClassId = String(classId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  const safeExamType = examType === 'posttest' ? 'posttest' : 'pretest';
  const parsedMeetingNo = meetingNo === undefined || meetingNo === null || meetingNo === '' ? 1 : Number(meetingNo);

  if (!safeClassId) {
    return {
      status: 400,
      payload: {
        error: 'classId wajib diisi dengan ID kelas yang valid.',
        code: 'CLASS_ID_REQUIRED',
      },
    };
  }

  if (!Number.isInteger(parsedMeetingNo) || parsedMeetingNo < 1 || parsedMeetingNo > 32) {
    return {
      status: 400,
      payload: { error: 'meetingNo harus berupa bilangan bulat 1–32.', code: 'INVALID_MEETING_NO' },
    };
  }

  const safeMeetingNo = parsedMeetingNo;
  const db = getFirestore();
  const attemptId = `${safeClassId}_m${safeMeetingNo}_${safeExamType}_${uid}`;
  const examDocId = `${safeClassId}_m${safeMeetingNo}_${safeExamType}`;

  if (action === 'save_exam') {
    const callerRole = await resolveCallerRole(db, decodedToken);
    if (callerRole !== 'lecturer' && callerRole !== 'admin') {
      return {
        status: 403,
        payload: {
          error: 'AKSES DITOLAK: Hanya dosen atau admin yang dapat menyimpan soal evaluasi.',
          code: 'FORBIDDEN_ROLE',
        },
      };
    }

    const ownership = await verifyClassInstructorOwnership(db, {
      safeClassId,
      decodedToken,
      callerRole,
      forbiddenCode: 'FORBIDDEN_CLASS_OWNER',
      forbiddenMessage:
        'AKSES DITOLAK: Hanya dosen pengampu kelas ini atau admin yang dapat mengelola soal evaluasi.',
    });
    if (!ownership.ok) {
      return ownership.response;
    }

    const normalizedStatus =
      incomingStatus === undefined || incomingStatus === null || incomingStatus === ''
        ? 'published'
        : String(incomingStatus).trim().toLowerCase();
    if (!['published', 'draft', 'archived'].includes(normalizedStatus)) {
      return {
        status: 400,
        payload: {
          error: 'Status evaluasi harus bernilai published, draft, atau archived.',
          code: 'INVALID_EXAM_STATUS',
        },
      };
    }

    const normalizedDuration =
      incomingDurationMinutes === undefined ||
      incomingDurationMinutes === null ||
      incomingDurationMinutes === ''
        ? 15
        : Number(incomingDurationMinutes);
    if (!Number.isInteger(normalizedDuration) || normalizedDuration < 1 || normalizedDuration > 180) {
      return {
        status: 400,
        payload: {
          error: 'durationMinutes harus berupa bilangan bulat antara 1 hingga 180 menit.',
          code: 'INVALID_DURATION_MINUTES',
        },
      };
    }

    let normalizedDeadline = null;
    if (incomingDeadline !== undefined && incomingDeadline !== null && incomingDeadline !== '') {
      const deadlineMs = parseTimestampMillis(incomingDeadline);
      if (deadlineMs === null) {
        return {
          status: 400,
          payload: {
            error: 'Format deadline evaluasi tidak valid.',
            code: 'INVALID_DEADLINE',
          },
        };
      }
      normalizedDeadline = new Date(deadlineMs).toISOString();
    }

    const validated = sanitizeExamPayload(questions, incomingAnswerKey);
    if (validated.error) {
      return {
        status: 400,
        payload: { error: validated.error, code: validated.code },
      };
    }

    const examRef = db.collection('exams').doc(examDocId);
    const keyRef = db.collection('exam_keys').doc(safeClassId);
    const cleanTitle =
      String(title || '').trim() ||
      `${safeExamType === 'posttest' ? 'Post-test' : 'Pretest'} Pertemuan ${safeMeetingNo}`;

    await db.runTransaction(async (tx) => {
      const keySnap = await tx.get(keyRef);
      const existingData = keySnap.exists ? keySnap.data() || {} : {};
      const existingMeetings =
        existingData.meetings && typeof existingData.meetings === 'object' ? existingData.meetings : {};
      const meetingKeyStr = String(safeMeetingNo);
      const existingMeetingEntry =
        existingMeetings[meetingKeyStr] && typeof existingMeetings[meetingKeyStr] === 'object'
          ? existingMeetings[meetingKeyStr]
          : {};

      const nextMeetings = {
        ...existingMeetings,
        [meetingKeyStr]: {
          ...existingMeetingEntry,
          [safeExamType]: validated.sanitizedAnswerKey,
        },
      };

      tx.set(
        examRef,
        {
          examId: examDocId,
          classId: safeClassId,
          meetingNo: safeMeetingNo,
          examType: safeExamType,
          title: cleanTitle,
          status: normalizedStatus,
          durationMinutes: normalizedDuration,
          deadline: normalizedDeadline,
          questions: validated.sanitizedQuestions,
          updatedBy: decodedToken.uid,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(
        keyRef,
        {
          classId: safeClassId,
          meetings: nextMeetings,
          updatedBy: decodedToken.uid,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    return {
      status: 200,
      payload: {
        saved: true,
        examId: examDocId,
        classId: safeClassId,
        meetingNo: safeMeetingNo,
        examType: safeExamType,
        status: normalizedStatus,
        durationMinutes: normalizedDuration,
        deadline: normalizedDeadline,
        questionsCount: validated.sanitizedQuestions.length,
      },
    };
  }

  if (action === 'archive_exam') {
    const callerRole = await resolveCallerRole(db, decodedToken);
    if (callerRole !== 'lecturer' && callerRole !== 'admin') {
      return {
        status: 403,
        payload: {
          error: 'AKSES DITOLAK: Hanya dosen atau admin yang dapat mengarsipkan evaluasi.',
          code: 'FORBIDDEN_ROLE',
        },
      };
    }

    const ownership = await verifyClassInstructorOwnership(db, {
      safeClassId,
      decodedToken,
      callerRole,
      forbiddenCode: 'FORBIDDEN_CLASS_OWNER',
      forbiddenMessage:
        'AKSES DITOLAK: Hanya dosen pengampu kelas ini atau admin yang dapat mengarsipkan evaluasi.',
    });
    if (!ownership.ok) {
      return ownership.response;
    }

    const examRef = db.collection('exams').doc(examDocId);
    const examSnap = await examRef.get();
    if (!examSnap?.exists) {
      return {
        status: 404,
        payload: {
          error: 'Evaluasi untuk pertemuan ini belum dikonfigurasi.',
          code: 'EXAM_NOT_CONFIGURED',
        },
      };
    }

    await examRef.set(
      {
        status: 'archived',
        updatedBy: decodedToken.uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      status: 200,
      payload: {
        archived: true,
        examId: examDocId,
        classId: safeClassId,
        meetingNo: safeMeetingNo,
        examType: safeExamType,
        status: 'archived',
      },
    };
  }

  if (action === 'delete_exam') {
    const callerRole = await resolveCallerRole(db, decodedToken);
    if (callerRole !== 'lecturer' && callerRole !== 'admin') {
      return {
        status: 403,
        payload: {
          error: 'AKSES DITOLAK: Hanya dosen atau admin yang dapat menghapus evaluasi.',
          code: 'FORBIDDEN_ROLE',
        },
      };
    }

    const ownership = await verifyClassInstructorOwnership(db, {
      safeClassId,
      decodedToken,
      callerRole,
      forbiddenCode: 'FORBIDDEN_CLASS_OWNER',
      forbiddenMessage:
        'AKSES DITOLAK: Hanya dosen pengampu kelas ini atau admin yang dapat menghapus evaluasi.',
    });
    if (!ownership.ok) {
      return ownership.response;
    }

    const examRef = db.collection('exams').doc(examDocId);
    const keyRef = db.collection('exam_keys').doc(safeClassId);
    const meetingKeyStr = String(safeMeetingNo);

    await db.runTransaction(async (tx) => {
      const keySnap = await tx.get(keyRef);
      if (keySnap?.exists) {
        const existingData = keySnap.data() || {};
        const existingMeetings =
          existingData.meetings && typeof existingData.meetings === 'object'
            ? { ...existingData.meetings }
            : {};
        const currentMeetingBucket =
          existingMeetings[meetingKeyStr] && typeof existingMeetings[meetingKeyStr] === 'object'
            ? { ...existingMeetings[meetingKeyStr] }
            : {};
        delete currentMeetingBucket[safeExamType];
        if (Object.keys(currentMeetingBucket).length === 0) {
          delete existingMeetings[meetingKeyStr];
        } else {
          existingMeetings[meetingKeyStr] = currentMeetingBucket;
        }
        const { meetings: _removedMeetings, ...restKeyData } = existingData;
        tx.set(keyRef, {
          ...restKeyData,
          classId: safeClassId,
          meetings: existingMeetings,
          updatedBy: decodedToken.uid,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      if (typeof tx.delete === 'function') {
        tx.delete(examRef);
      } else {
        tx.set(examRef, { status: 'archived', questions: [], deleted: true }, { merge: true });
      }
    });

    return {
      status: 200,
      payload: {
        deleted: true,
        examId: examDocId,
        classId: safeClassId,
        meetingNo: safeMeetingNo,
        examType: safeExamType,
      },
    };
  }

  if (action === 'instructor_keys') {
    const callerRole = await resolveCallerRole(db, decodedToken);
    if (callerRole !== 'lecturer' && callerRole !== 'admin') {
      return {
        status: 403,
        payload: {
          error: 'AKSES DITOLAK: Hanya dosen atau admin yang dapat mengakses kunci evaluasi referensi.',
          code: 'FORBIDDEN_ROLE',
        },
      };
    }

    const ownership = await verifyClassInstructorOwnership(db, {
      safeClassId,
      decodedToken,
      callerRole,
      forbiddenCode: 'FORBIDDEN_CLASS_ACCESS',
      forbiddenMessage:
        'AKSES DITOLAK: Hanya dosen pengampu kelas ini atau admin yang dapat mengakses kunci evaluasi.',
    });
    if (!ownership.ok) {
      return ownership.response;
    }

    let answerKey = null;
    try {
      const keyDoc = await db.collection('exam_keys').doc(safeClassId).get();
      if (keyDoc.exists) {
        answerKey = resolveMeetingAnswerKey(keyDoc.data(), safeMeetingNo, safeExamType);
      }
    } catch (err) {
      console.warn('[api/grade] instructor_keys lookup warning:', err.message);
    }

    return {
      status: 200,
      payload: {
        classId: safeClassId,
        meetingNo: safeMeetingNo,
        examType: safeExamType,
        answerKey: answerKey || {},
        isConfigured: Boolean(answerKey),
      },
    };
  }

  const callerRole = await resolveCallerRole(db, decodedToken);
  const membershipCheck = await verifyApprovedClassMember(db, {
    safeClassId,
    uid,
    callerRole,
  });
  if (!membershipCheck.ok) {
    return membershipCheck.response;
  }

  let examData = null;
  const examsCollection = db.collection('exams');
  if (examsCollection && typeof examsCollection.doc === 'function') {
    const examSnap = await examsCollection.doc(examDocId).get();
    if (examSnap?.exists) {
      examData = examSnap.data() || {};
    }
  }

  const examStatus = String(examData?.status || 'published').trim().toLowerCase();
  if (examStatus === 'draft') {
    return {
      status: 403,
      payload: {
        error: 'Evaluasi masih berstatus draft dan belum dipublikasikan oleh dosen.',
        code: 'EXAM_NOT_PUBLISHED',
      },
    };
  }
  if (examStatus === 'archived') {
    return {
      status: 403,
      payload: {
        error: 'Evaluasi telah diarsipkan dan tidak lagi menerima pengerjaan.',
        code: 'EXAM_ARCHIVED',
      },
    };
  }

  let answerKey = null;
  try {
    const keyDoc = await db.collection('exam_keys').doc(safeClassId).get();
    if (keyDoc.exists) {
      answerKey = resolveMeetingAnswerKey(keyDoc.data(), safeMeetingNo, safeExamType);
    }
  } catch (err) {
    console.warn('[api/grade] exam_keys lookup warning:', err.message);
  }

  if (!answerKey) {
    return {
      status: 404,
      payload: {
        error: 'Evaluasi untuk pertemuan ini belum dikonfigurasi oleh dosen.',
        code: 'EXAM_NOT_CONFIGURED',
      },
    };
  }

  let attemptData = null;
  const attemptsCol = db.collection('exam_attempts');
  const attemptRef =
    attemptsCol && typeof attemptsCol.doc === 'function' ? attemptsCol.doc(attemptId) : null;
  if (attemptRef && typeof attemptRef.get === 'function') {
    const attemptSnap = await attemptRef.get();
    if (attemptSnap?.exists) {
      attemptData = attemptSnap.data() || {};
    }
  }

  if (attemptData?.status === 'submitted') {
    const savedTotal = Number.isFinite(Number(attemptData.totalQuestions))
      ? Number(attemptData.totalQuestions)
      : Object.keys(answerKey).length;
    const savedScore = Number.isFinite(Number(attemptData.score)) ? Number(attemptData.score) : 0;
    const savedCorrect = Number.isFinite(Number(attemptData.correctCount))
      ? Number(attemptData.correctCount)
      : 0;
    const savedPassed =
      typeof attemptData.passed === 'boolean' ? attemptData.passed : savedScore >= 75;
    const savedResultSummary = {
      score: savedScore,
      correctCount: savedCorrect,
      totalQuestions: savedTotal,
      passed: savedPassed,
    };

    if (action === 'start') {
      return {
        status: 409,
        payload: {
          error: 'Anda sudah menyelesaikan dan mengumpulkan evaluasi ini.',
          code: 'EXAM_ALREADY_SUBMITTED',
          attemptId,
          classId: safeClassId,
          meetingNo: safeMeetingNo,
          examType: safeExamType,
          status: 'submitted',
          examActive: false,
          ...savedResultSummary,
          result: savedResultSummary,
        },
      };
    }

    return {
      status: 200,
      payload: {
        idempotent: true,
        attemptId,
        classId: safeClassId,
        meetingNo: safeMeetingNo,
        examType: safeExamType,
        status: 'submitted',
        examActive: false,
        ...savedResultSummary,
        message: 'Hasil evaluasi sudah dinilai sebelumnya dan tidak ditimpa ulang.',
      },
    };
  }

  const examDeadlineMs = parseTimestampMillis(examData?.deadline ?? examData?.expiresAt);
  const { studentName, studentEmail } = await resolveCallerStudentIdentity(
    db,
    decodedToken,
    attemptData
  );

  if (action === 'start') {
    const durationMinutes =
      Number.isFinite(Number(examData?.durationMinutes)) && Number(examData?.durationMinutes) > 0
        ? Number(examData.durationMinutes)
        : 15;
    const durationMs = durationMinutes * 60 * 1000;

    if (attemptData?.status === 'in_progress') {
      const existingExpiresAtMs = parseTimestampMillis(
        attemptData?.examExpiresAt ?? attemptData?.expiresAt
      );
      const startCutoffCandidates = [examDeadlineMs, existingExpiresAtMs].filter(
        (ts) => ts !== null
      );
      if (startCutoffCandidates.length > 0 && Date.now() > Math.min(...startCutoffCandidates)) {
        return {
          status: 403,
          payload: {
            error: 'Batas waktu sesi evaluasi Anda telah terlewati.',
            code: 'EXAM_DEADLINE_EXCEEDED',
          },
        };
      }

      const preservedExpiresAt =
        existingExpiresAtMs ??
        (examDeadlineMs !== null
          ? Math.min(examDeadlineMs, Date.now() + durationMs)
          : Date.now() + durationMs);

      return {
        status: 200,
        payload: {
          resumed: true,
          attemptId,
          classId: safeClassId,
          meetingNo: safeMeetingNo,
          examType: safeExamType,
          studentName,
          studentEmail,
          status: 'in_progress',
          examActive: true,
          startedAt: attemptData?.startedAt ?? attemptData?.examStartedAt ?? null,
          examExpiresAt: preservedExpiresAt,
        },
      };
    }

    if (examDeadlineMs !== null && Date.now() > examDeadlineMs) {
      return {
        status: 403,
        payload: {
          error: 'Batas waktu pengumpulan evaluasi telah terlewati.',
          code: 'EXAM_DEADLINE_EXCEEDED',
        },
      };
    }

    const rawExpiresAt = Date.now() + durationMs;
    const nextExpiresAt =
      examDeadlineMs !== null ? Math.min(rawExpiresAt, examDeadlineMs) : rawExpiresAt;

    const targetAttemptRef = attemptRef || db.collection('exam_attempts').doc(attemptId);
    await targetAttemptRef.set(
      {
        attemptId,
        classId: safeClassId,
        meetingNo: safeMeetingNo,
        uid,
        studentName,
        studentEmail,
        examType: safeExamType,
        status: 'in_progress',
        examActive: true,
        startedAt: FieldValue.serverTimestamp(),
        examStartedAt: FieldValue.serverTimestamp(),
        examExpiresAt: nextExpiresAt,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      status: 200,
      payload: {
        attemptId,
        classId: safeClassId,
        meetingNo: safeMeetingNo,
        examType: safeExamType,
        studentName,
        studentEmail,
        status: 'in_progress',
        examActive: true,
        examExpiresAt: nextExpiresAt,
      },
    };
  }

  const cutoffCandidates = [
    examDeadlineMs,
    parseTimestampMillis(
      attemptData?.examExpiresAt ?? attemptData?.expiresAt ?? attemptData?.deadline
    ),
  ].filter((ts) => ts !== null);

  if (cutoffCandidates.length > 0) {
    const effectiveDeadlineMs = Math.min(...cutoffCandidates);
    if (Date.now() > effectiveDeadlineMs + EXAM_DEADLINE_GRACE_MS) {
      return {
        status: 403,
        payload: {
          error: 'Batas waktu pengumpulan evaluasi (termasuk toleransi 60 detik) telah terlewati.',
          code: 'EXAM_DEADLINE_EXCEEDED',
        },
      };
    }
  }

  const questionIds = Object.keys(answerKey);
  const totalQuestions = questionIds.length;
  let correctCount = 0;

  for (const qId of questionIds) {
    if (answers && answers[qId] === answerKey[qId]) {
      correctCount += 1;
    }
  }

  const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const passed = score >= 75;

  const targetAttemptRef = attemptRef || db.collection('exam_attempts').doc(attemptId);
  await targetAttemptRef.set(
    {
      attemptId,
      classId: safeClassId,
      meetingNo: safeMeetingNo,
      uid,
      studentName,
      studentEmail,
      examType: safeExamType,
      status: 'submitted',
      examActive: false,
      examExpiresAt: null,
      score,
      correctCount,
      totalQuestions,
      passed,
      submittedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    status: 200,
    payload: {
      attemptId,
      classId: safeClassId,
      meetingNo: safeMeetingNo,
      examType: safeExamType,
      studentName,
      studentEmail,
      status: 'submitted',
      examActive: false,
      score,
      correctCount,
      totalQuestions,
      passed,
    },
  };
}

async function handleJoinClass(body, decodedToken) {
  const uid = String(decodedToken?.uid || '').trim();
  if (!uid) {
    return {
      status: 401,
      payload: { error: 'Token pengguna tidak memiliki UID yang valid.', code: 'UNAUTHORIZED' },
    };
  }

  const db = getFirestore();
  const rateLimitPeek = await runRateLimitTx(db, {
    scope: 'join_class',
    uid,
    maxAttempts: JOIN_CLASS_MAX_FAILURES,
    windowMs: RATE_LIMIT_WINDOW_MS,
    increment: false,
  });

  if (!rateLimitPeek.allowed) {
    return {
      status: 429,
      headers: { 'Retry-After': String(rateLimitPeek.retryAfterSeconds) },
      payload: {
        error: 'Terlalu banyak percobaan gagal kode kelas. Coba lagi beberapa saat lagi.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds: rateLimitPeek.retryAfterSeconds,
      },
    };
  }

  const cleanCode = String(body?.classCode || '')
    .trim()
    .toUpperCase();

  if (!VALID_CLASS_CODE_REGEX.test(cleanCode)) {
    const failureRes = await runRateLimitTx(db, {
      scope: 'join_class',
      uid,
      maxAttempts: JOIN_CLASS_MAX_FAILURES,
      windowMs: RATE_LIMIT_WINDOW_MS,
      increment: true,
    });
    if (!failureRes.allowed) {
      return {
        status: 429,
        headers: { 'Retry-After': String(failureRes.retryAfterSeconds) },
        payload: {
          error: 'Terlalu banyak percobaan gagal kode kelas. Coba lagi beberapa saat lagi.',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfterSeconds: failureRes.retryAfterSeconds,
        },
      };
    }
    return {
      status: 400,
      payload: {
        error: 'Kode kelas wajib terdiri dari 6–12 karakter alfanumerik kapital.',
        code: 'INVALID_CLASS_CODE',
      },
    };
  }

  const classQuery = await db.collection('classes').where('code', '==', cleanCode).limit(1).get();

  if (classQuery.empty) {
    const failureRes = await runRateLimitTx(db, {
      scope: 'join_class',
      uid,
      maxAttempts: JOIN_CLASS_MAX_FAILURES,
      windowMs: RATE_LIMIT_WINDOW_MS,
      increment: true,
    });
    if (!failureRes.allowed) {
      return {
        status: 429,
        headers: { 'Retry-After': String(failureRes.retryAfterSeconds) },
        payload: {
          error: 'Terlalu banyak percobaan gagal kode kelas. Coba lagi beberapa saat lagi.',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfterSeconds: failureRes.retryAfterSeconds,
        },
      };
    }
    return {
      status: 404,
      payload: {
        error: 'Kode kelas tidak ditemukan atau kelas tidak aktif.',
        code: 'CLASS_NOT_FOUND',
      },
    };
  }

  const emailVerified = Boolean(decodedToken?.email_verified);
  const domainInfo = classifyAccountByEmail(decodedToken?.email || '', {
    emailVerified,
    requireVerified: true,
  });
  const isApproved = Boolean(domainInfo.autoApprove);
  const membershipStatus = isApproved ? 'approved' : 'pending';

  const classDoc = classQuery.docs[0];
  const classRef = classDoc.ref;
  const memberId = `${classDoc.id}_${uid}`;
  const memberRef = db.collection('class_members').doc(memberId);

  const txResult = await db.runTransaction(async (tx) => {
    const freshClassSnap = await tx.get(classRef);
    if (!freshClassSnap.exists) {
      return { status: 404, notFound: true, payload: { error: 'Kelas tidak ditemukan.', code: 'CLASS_NOT_FOUND' } };
    }

    const freshClassData = freshClassSnap.data();
    if (freshClassData.isActive === false) {
      return { status: 403, payload: { error: 'Kelas sudah ditutup.', code: 'CLASS_INACTIVE' } };
    }

    const memberSnap = await tx.get(memberRef);
    if (memberSnap.exists) {
      const memberData = memberSnap.data() || {};
      const existingStatus = memberData.status || 'approved';
      const existingPending = existingStatus === 'pending';
      return {
        status: 200,
        payload: {
          joined: !existingPending,
          alreadyMember: true,
          pendingApproval: existingPending,
          status: existingStatus,
          memberId,
          classId: classDoc.id,
          classData: { id: classDoc.id, ...freshClassData },
        },
      };
    }

    const currentCount = Number(freshClassData.enrolledCount || 0);
    const maxStudents = Number(freshClassData.maxStudents || 0);
    if (isApproved && maxStudents > 0 && currentCount >= maxStudents) {
      return {
        status: 409,
        payload: { error: 'Kapasitas kelas sudah penuh.', code: 'CLASS_FULL' },
      };
    }

    tx.set(memberRef, {
      memberId,
      classId: classDoc.id,
      uid,
      role: decodedToken.role || domainInfo.role || 'student',
      status: membershipStatus,
      accountType: domainInfo.accountType,
      isInstitutional: domainInfo.accountType !== ACCOUNT_TYPES.UMUM,
      autoApproved: isApproved,
      joinedAt: FieldValue.serverTimestamp(),
    });

    if (isApproved) {
      tx.update(classRef, {
        enrolledCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      status: 200,
      payload: {
        joined: isApproved,
        alreadyMember: false,
        pendingApproval: !isApproved,
        status: membershipStatus,
        accountType: domainInfo.accountType,
        memberId,
        classId: classDoc.id,
        classData: {
          id: classDoc.id,
          ...freshClassData,
          enrolledCount: isApproved ? currentCount + 1 : currentCount,
        },
      },
    };
  });

  if (txResult?.notFound) {
    await runRateLimitTx(db, {
      scope: 'join_class',
      uid,
      maxAttempts: JOIN_CLASS_MAX_FAILURES,
      windowMs: RATE_LIMIT_WINDOW_MS,
      increment: true,
    });
    return { status: 404, payload: txResult.payload };
  }

  return txResult;
}

export default async function handler(req, res) {
  applyCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed. Use POST.' }, req);
    return;
  }

  let pathname = '';
  try {
    pathname = new URL(req.url || '/', 'http://localhost').pathname.replace(/\/+$/, '');
  } catch {
    sendJson(res, 400, { error: 'Malformed request URL.' }, req);
    return;
  }

  try {
    initFirebaseAdmin();
    const decodedToken = await verifyBearerToken(req);
    const body = await parseJsonBody(req);

    if (pathname === '/api/bootstrap') {
      const result = await handleBootstrap(body, decodedToken);
      sendJson(res, result.status, result.payload, req, result.headers);
      return;
    }

    if (pathname === '/api/ai') {
      const result = await handleAi(body, decodedToken);
      sendJson(res, result.status, result.payload, req, result.headers);
      return;
    }

    if (pathname === '/api/upload-sign') {
      const result = await handleUploadSign(body, decodedToken);
      sendJson(res, result.status, result.payload, req, result.headers);
      return;
    }

    if (pathname === '/api/grade') {
      const result = await handleGrade(body, decodedToken);
      sendJson(res, result.status, result.payload, req, result.headers);
      return;
    }

    if (pathname === '/api/join-class') {
      const result = await handleJoinClass(body, decodedToken);
      sendJson(res, result.status, result.payload, req, result.headers);
      return;
    }

    sendJson(res, 404, { error: `Unknown API route: ${pathname}` }, req);
  } catch (err) {
    const statusCode = err?.statusCode || 500;
    sendJson(
      res,
      statusCode,
      {
        error: err?.message || 'Internal Server Error',
      },
      req
    );
  }
}
