import { createHash } from 'node:crypto';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
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

function handleUploadSign(body) {
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

async function resolveCallerRole(db, decodedToken) {
  if (decodedToken?.role === 'admin' || decodedToken?.role === 'lecturer') {
    return decodedToken.role;
  }
  const email = String(decodedToken?.email || '').trim().toLowerCase();
  if (/^admin(\.[^@]+)?@smartsa\.edu$/.test(email)) {
    return 'admin';
  }
  if (/^dosen(\.[^@]+)?@smartsa\.edu$/.test(email)) {
    return 'lecturer';
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

async function handleGrade(body, decodedToken) {
  const {
    classId = '',
    meetingNo = 1,
    examType = 'pretest',
    answers = {},
    questions = [],
    answerKey: incomingAnswerKey = null,
    title = '',
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
  const attemptId = `${safeClassId}_m${safeMeetingNo}_${safeExamType}_${decodedToken.uid}`;
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

    const classRef = db.collection('classes').doc(safeClassId);
    const classSnap = await classRef.get();
    if (!classSnap.exists) {
      return {
        status: 404,
        payload: { error: 'Kelas tidak ditemukan di Firestore.', code: 'CLASS_NOT_FOUND' },
      };
    }

    if (callerRole !== 'admin' && classSnap.data()?.lecturerId !== decodedToken.uid) {
      return {
        status: 403,
        payload: {
          error: 'AKSES DITOLAK: Hanya dosen pengampu kelas ini atau admin yang dapat mengelola soal evaluasi.',
          code: 'FORBIDDEN_CLASS_OWNER',
        },
      };
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
          durationMinutes: 15,
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
        questionsCount: validated.sanitizedQuestions.length,
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

  if (action === 'start') {
    const durationMs = 15 * 60 * 1000;
    await db
      .collection('exam_attempts')
      .doc(attemptId)
      .set(
        {
          attemptId,
          classId: safeClassId,
          meetingNo: safeMeetingNo,
          uid: decodedToken.uid,
          examType: safeExamType,
          status: 'in_progress',
          examActive: true,
          examStartedAt: FieldValue.serverTimestamp(),
          examExpiresAt: Date.now() + durationMs,
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
        status: 'in_progress',
        examActive: true,
      },
    };
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

  await db
    .collection('exam_attempts')
    .doc(attemptId)
    .set(
      {
        attemptId,
        classId: safeClassId,
        meetingNo: safeMeetingNo,
        uid: decodedToken.uid,
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
  const cleanCode = String(body?.classCode || '')
    .trim()
    .toUpperCase();

  if (cleanCode.length < 4) {
    return {
      status: 400,
      payload: {
        error: 'Kode kelas minimal 4 karakter alfanumerik.',
        code: 'INVALID_CLASS_CODE',
      },
    };
  }

  const db = getFirestore();
  const classQuery = await db.collection('classes').where('code', '==', cleanCode).limit(1).get();

  if (classQuery.empty) {
    return {
      status: 404,
      payload: {
        error: 'Kode kelas tidak ditemukan atau kelas tidak aktif.',
        code: 'CLASS_NOT_FOUND',
      },
    };
  }

  const classDoc = classQuery.docs[0];
  const classRef = classDoc.ref;
  const memberId = `${classDoc.id}_${decodedToken.uid}`;
  const memberRef = db.collection('class_members').doc(memberId);

  const txResult = await db.runTransaction(async (tx) => {
    const freshClassSnap = await tx.get(classRef);
    if (!freshClassSnap.exists) {
      return { status: 404, payload: { error: 'Kelas tidak ditemukan.', code: 'CLASS_NOT_FOUND' } };
    }

    const freshClassData = freshClassSnap.data();
    if (freshClassData.isActive === false) {
      return { status: 403, payload: { error: 'Kelas sudah ditutup.', code: 'CLASS_INACTIVE' } };
    }

    const memberSnap = await tx.get(memberRef);
    if (memberSnap.exists) {
      return {
        status: 200,
        payload: {
          joined: true,
          alreadyMember: true,
          memberId,
          classId: classDoc.id,
          classData: { id: classDoc.id, ...freshClassData },
        },
      };
    }

    const currentCount = Number(freshClassData.enrolledCount || 0);
    const maxStudents = Number(freshClassData.maxStudents || 0);
    if (maxStudents > 0 && currentCount >= maxStudents) {
      return {
        status: 409,
        payload: { error: 'Kapasitas kelas sudah penuh.', code: 'CLASS_FULL' },
      };
    }

    tx.set(memberRef, {
      memberId,
      classId: classDoc.id,
      uid: decodedToken.uid,
      role: decodedToken.role || 'student',
      joinedAt: FieldValue.serverTimestamp(),
    });

    tx.update(classRef, {
      enrolledCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      status: 200,
      payload: {
        joined: true,
        alreadyMember: false,
        memberId,
        classId: classDoc.id,
        classData: {
          id: classDoc.id,
          ...freshClassData,
          enrolledCount: currentCount + 1,
        },
      },
    };
  });

  return txResult;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed. Use POST.' });
    return;
  }

  let pathname = '';
  try {
    pathname = new URL(req.url || '/', 'http://localhost').pathname.replace(/\/+$/, '');
  } catch {
    sendJson(res, 400, { error: 'Malformed request URL.' });
    return;
  }

  try {
    initFirebaseAdmin();
    const decodedToken = await verifyBearerToken(req);
    const body = await parseJsonBody(req);

    if (pathname === '/api/ai') {
      const result = await handleAi(body, decodedToken);
      sendJson(res, result.status, result.payload);
      return;
    }

    if (pathname === '/api/upload-sign') {
      const result = handleUploadSign(body);
      sendJson(res, result.status, result.payload);
      return;
    }

    if (pathname === '/api/grade') {
      const result = await handleGrade(body, decodedToken);
      sendJson(res, result.status, result.payload);
      return;
    }

    if (pathname === '/api/join-class') {
      const result = await handleJoinClass(body, decodedToken);
      sendJson(res, result.status, result.payload);
      return;
    }

    sendJson(res, 404, { error: `Unknown API route: ${pathname}` });
  } catch (err) {
    const statusCode = err?.statusCode || 500;
    sendJson(res, statusCode, {
      error: err?.message || 'Internal Server Error',
    });
  }
}
