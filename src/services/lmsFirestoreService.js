/**
 * Layanan Modular Cloud Firestore untuk Smartsa LMS
 * Koleksi: classes, class_members, assignments, submissions, discussions, exam_attempts, learning_progress, manual_books
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { uploadMediaFile } from './cloudinaryService';

const COLOR_SCHEMES = {
  code: { bg: 'bg-blue-50/80', text: 'text-blue-600', border: 'border-blue-100' },
  database: { bg: 'bg-teal-50/80', text: 'text-teal-600', border: 'border-teal-100' },
  mobile: { bg: 'bg-amber-50/80', text: 'text-amber-600', border: 'border-amber-100' },
  git: { bg: 'bg-emerald-50/80', text: 'text-emerald-600', border: 'border-emerald-100' },
  palette: { bg: 'bg-pink-50/80', text: 'text-pink-600', border: 'border-pink-100' },
  layers: { bg: 'bg-purple-50/80', text: 'text-purple-600', border: 'border-purple-100' },
};

/**
 * Validasi ketat URL gambar eksternal agar hanya menerima `https://` valid atau string kosong `''`.
 * Menolak skema berbahaya (`javascript:`, `data:`, `blob:`, `http://`, dsb.).
 */
export function normalizeHttpsImageUrl(rawUrl, label = 'URL gambar') {
  if (rawUrl === undefined || rawUrl === null) return '';
  if (typeof rawUrl !== 'string') {
    throw new Error(`${label} harus berupa teks URL https:// atau kosong.`);
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (/\s|[<>]/.test(trimmed)) {
    throw new Error(`${label} mengandung spasi atau karakter tidak valid. Hanya URL https:// yang diizinkan.`);
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} tidak valid. Gunakan URL berawalan https://.`);
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname) {
    throw new Error(
      `${label} ditolak demi keamanan. Hanya URL berawalan https:// yang diizinkan.`
    );
  }
  return trimmed;
}

function normalizeOptionalHttpUrl(rawUrl, label = 'URL lampiran') {
  if (rawUrl === undefined || rawUrl === null) return '';
  if (typeof rawUrl !== 'string') {
    throw new Error(`${label} harus berupa teks URL https:// atau http://.`);
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (/\s|[<>]/.test(trimmed)) {
    throw new Error(`${label} mengandung spasi atau karakter tidak valid.`);
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} tidak valid. Gunakan URL berawalan https:// atau http://.`);
  }
  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || !parsed.hostname) {
    throw new Error(`${label} ditolak demi keamanan. Hanya tautan https:// atau http:// yang diizinkan.`);
  }
  return trimmed;
}

function normalizeAssignmentTaskType(rawType) {
  return String(rawType || '').trim().toLowerCase() === 'kelompok' ? 'kelompok' : 'individu';
}

function normalizeGroupMembersList(rawMembers) {
  if (Array.isArray(rawMembers)) {
    return rawMembers
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 30);
  }
  if (typeof rawMembers === 'string') {
    return rawMembers
      .split(/[\r\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 30);
  }
  return [];
}

/**
 * Mengunggah berkas gambar lewat Cloudinary (/api/upload-sign tipe `image`) dan memastikan
 * hasil URL yang dikembalikan strictly menggunakan skema `https://` CDN.
 */
export async function uploadHttpsImageToCloudinary(file, label = 'Gambar') {
  if (!file) {
    throw new Error(`${label} belum dipilih.`);
  }
  const uploadResult = await uploadMediaFile(file, 'image');
  if (!uploadResult?.isLive || uploadResult?.storageType !== 'cloudinary') {
    throw new Error(
      uploadResult?.note && uploadResult.note.includes('dibatasi')
        ? uploadResult.note
        : 'Unggah langsung ke Cloudinary CDN belum aktif di server (hanya URL https:// yang diizinkan untuk disimpan). Silakan tempel tautan gambar https:// secara langsung.'
    );
  }
  return normalizeHttpsImageUrl(uploadResult.url, label);
}

export function normalizeClassDoc(id, data = {}) {
  const iconType = data.iconType || 'layers';
  const day = typeof data.day === 'string' ? data.day : '';
  const time = typeof data.time === 'string' ? data.time : '';
  const title = data.title || data.name || 'Mata Kuliah Smartsa';
  const instructor = data.instructor || data.lecturer || 'Dosen Pengampu';
  const meetings = Array.isArray(data.meetings) ? data.meetings : [];
  let coverImage = '';
  if (typeof data.coverImage === 'string' && data.coverImage.trim()) {
    try {
      coverImage = normalizeHttpsImageUrl(data.coverImage, 'URL cover kelas');
    } catch {
      coverImage = '';
    }
  }

  return {
    id,
    name: data.name || title,
    title,
    code: data.code || 'CLS000',
    lecturer: instructor,
    instructor,
    lecturerId: data.lecturerId || '',
    category: data.category || 'Teknologi Informasi',
    description: typeof data.description === 'string' ? data.description : '',
    day,
    time,
    iconType,
    colorScheme: data.colorScheme || COLOR_SCHEMES[iconType] || COLOR_SCHEMES.layers,
    coverImage,
    enrolledCount: Number(data.enrolledCount || 0),
    maxStudents: Number(data.maxStudents || 50),
    materialsCount: Number(data.materialsCount || 0),
    completedCount: Number(data.completedCount || 0),
    meetingsCount: Array.isArray(data.meetings) ? meetings.length : Number(data.meetingsCount || 0),
    completedMeetings: Number(data.completedMeetings || 0),
    isPublic: data.isPublic !== false,
    isActive: data.isActive !== false,
    activeAttendanceSession: data.activeAttendanceSession || null,
    deltaContent: data.deltaContent || null,
    videoUrl: data.videoUrl || '',
    pdfUrl: data.pdfUrl || '',
    meetings,
  };
}

export async function fetchPublicClasses() {
  if (!db) {
    return {
      classes: [],
      isEmpty: true,
      source: 'demo',
    };
  }
  try {
    const q = query(collection(db, 'classes'), where('isPublic', '==', true));
    const snap = await getDocs(q);
    const classes = snap.docs.map((docSnap) => normalizeClassDoc(docSnap.id, docSnap.data()));
    return {
      classes,
      isEmpty: classes.length === 0,
      source: 'firestore',
    };
  } catch (err) {
    console.warn('[lmsFirestoreService] Gagal memuat kelas publik Firestore:', err.message);
    return {
      classes: [],
      isEmpty: true,
      source: 'firestore_error',
      error: err.message,
    };
  }
}

function chunkArray(items = [], size = 10) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function resolveCurrentUserRole(uid, roleOverride = null) {
  if (roleOverride === 'admin' || roleOverride === 'lecturer' || roleOverride === 'student') {
    return roleOverride;
  }
  const email = String(auth?.currentUser?.email || '').trim().toLowerCase();
  if (/^admin(\.[^@]+)?@smartsa\.edu$/.test(email)) return 'admin';
  if (/^dosen(\.[^@]+)?@smartsa\.edu$/.test(email)) return 'lecturer';

  if (db && uid) {
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      const fsRole = userSnap.exists() ? userSnap.data()?.role : null;
      if (fsRole === 'admin' || fsRole === 'lecturer' || fsRole === 'student') {
        return fsRole;
      }
    } catch {
      // ignore lookup error; fall back to least privilege student
    }
  }
  return 'student';
}

export async function fetchClassesForUser({ uid: uidOverride = null, role: roleOverride = null } = {}) {
  const uid = uidOverride || auth?.currentUser?.uid || '';
  if (!uid || !db) {
    return {
      classes: [],
      isEmpty: true,
      source: 'demo',
    };
  }

  try {
    const resolvedRole = await resolveCurrentUserRole(uid, roleOverride);

    if (resolvedRole === 'admin') {
      const snap = await getDocs(collection(db, 'classes'));
      const classes = snap.docs.map((docSnap) => normalizeClassDoc(docSnap.id, docSnap.data()));
      return {
        classes,
        isEmpty: classes.length === 0,
        source: 'firestore',
      };
    }

    if (resolvedRole === 'lecturer') {
      const q = query(collection(db, 'classes'), where('lecturerId', '==', uid));
      const snap = await getDocs(q);
      const classes = snap.docs.map((docSnap) => normalizeClassDoc(docSnap.id, docSnap.data()));
      return {
        classes,
        isEmpty: classes.length === 0,
        source: 'firestore',
      };
    }

    // Student role: load approved/active enrolled classIds via class_members and chunk by 10 via documentId() in [...]
    const memberships = await fetchJoinedMemberships(uid);
    const activeMemberships = memberships.filter(
      (m) => !m.status || m.status === 'approved' || m.status === 'active'
    );
    const classIds = Array.from(new Set(activeMemberships.map((m) => m.classId).filter(Boolean)));
    if (classIds.length === 0) {
      return {
        classes: [],
        isEmpty: true,
        source: 'firestore',
      };
    }

    const classes = [];
    for (const batchIds of chunkArray(classIds, 10)) {
      const q = query(collection(db, 'classes'), where(documentId(), 'in', batchIds));
      const snap = await getDocs(q);
      snap.docs.forEach((docSnap) => {
        classes.push(normalizeClassDoc(docSnap.id, docSnap.data()));
      });
    }

    return {
      classes,
      isEmpty: classes.length === 0,
      source: 'firestore',
    };
  } catch (err) {
    console.warn('[lmsFirestoreService] Gagal memuat koleksi classes:', err.message);
    return {
      classes: [],
      isEmpty: true,
      source: 'firestore_error',
      error: err.message,
    };
  }
}

export async function fetchClasses(options = {}) {
  return fetchClassesForUser(options);
}

export async function fetchJoinedMemberships(uidOverride = null) {
  const uid = uidOverride || auth?.currentUser?.uid;
  if (!uid || !db) return [];

  try {
    const q = query(
      collection(db, 'class_members'),
      where('uid', '==', uid),
      orderBy('joinedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (err) {
    console.warn('[lmsFirestoreService] Gagal memuat class_members:', err.message);
    return [];
  }
}

const CLASS_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateClassCode(length = 8) {
  const safeLen = Math.min(12, Math.max(6, Number(length) || 8));
  let suffix = '';
  for (let i = 0; i < safeLen - 2; i += 1) {
    suffix += CLASS_CODE_CHARS[Math.floor(Math.random() * CLASS_CODE_CHARS.length)];
  }
  return `SM${suffix}`;
}

export async function createClassInFirestore({
  name,
  category = 'Teknologi Informasi',
  description = '',
  instructorName = 'Pendidik Terdaftar',
  day = '',
  time = '',
  code = '',
  coverImage = '',
}) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Nama kelas wajib diisi.');

  const cleanCoverImage = normalizeHttpsImageUrl(coverImage, 'URL cover kelas');

  const cleanCode = String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (cleanCode && !/^[A-Z0-9]{6,12}$/.test(cleanCode)) {
    throw new Error('Kode kelas opsional harus terdiri dari 6–12 karakter alfanumerik kapital.');
  }

  const generatedCode = cleanCode || generateClassCode(8);
  const classId = `cls_${Date.now()}`;

  const payload = {
    id: classId,
    name: cleanName,
    title: cleanName,
    code: generatedCode,
    description: String(description || '').trim(),
    instructor: instructorName,
    lecturer: instructorName,
    lecturerId: auth?.currentUser?.uid || 'demo_lecturer',
    category,
    day: String(day || '').trim(),
    time: String(time || '').trim(),
    iconType: 'layers',
    coverImage: cleanCoverImage,
    enrolledCount: 0,
    maxStudents: 50,
    materialsCount: 0,
    meetingsCount: 0,
    isPublic: true,
    isActive: true,
    activeAttendanceSession: null,
    deltaContent: null,
    videoUrl: '',
    pdfUrl: '',
    meetings: [],
  };

  if (auth?.currentUser && db) {
    await setDoc(doc(db, 'classes', classId), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  return normalizeClassDoc(classId, payload);
}

export async function joinClassWithToken(classCode) {
  const cleanCode = String(classCode || '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(cleanCode)) {
    throw new Error('Kode kelas harus terdiri dari 6–12 karakter alfanumerik kapital.');
  }

  if (!auth?.currentUser || !db) {
    throw new Error('Masuk dengan akun Firebase untuk bergabung ke kelas menggunakan kode.');
  }

  try {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch('/api/join-class', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ classCode: cleanCode }),
    });

    const isJson = res.headers.get('content-type')?.includes('application/json');
    if (isJson) {
      const data = await res.json();
      if (!res.ok) {
        const apiError = new Error(data.error || 'Kode kelas tidak valid atau gagal bergabung ke kelas.');
        apiError.isApiBusinessError = true;
        throw apiError;
      }
      return {
        ...data,
        classData: data.classData
          ? normalizeClassDoc(data.classData.id || data.classId, data.classData)
          : null,
      };
    }
  } catch (err) {
    if (
      err?.isApiBusinessError ||
      (err instanceof Error &&
        (err.message.includes('Kode kelas') ||
          err.message.includes('Kapasitas') ||
          err.message.includes('Kelas') ||
          err.message.includes('Terlalu banyak') ||
          err.message.includes('Invalid') ||
          err.message.includes('token')))
    ) {
      throw err;
    }
    // Lanjutkan ke dev fallback jika /api/join-class tidak tersedia di vite dev
  }

  // Fallback dev aman saat npm run dev (/api/* Vercel tidak aktif)
  const snap = await getDocs(query(collection(db, 'classes'), where('code', '==', cleanCode)));
  if (!snap.empty) {
    const docSnap = snap.docs[0];
    return {
      joined: true,
      alreadyMember: false,
      isDevFallback: true,
      classData: normalizeClassDoc(docSnap.id, docSnap.data()),
      note: 'Mode Dev Lokal: API /api/join-class hanya aktif di Vercel deployment; kelas ditemukan di Firestore.',
    };
  }

  throw new Error(
    'Kode kelas tidak ditemukan. Jalankan seed-firestore.mjs atau pastikan endpoint /api/join-class aktif.'
  );
}

// =========================================================================
// ASSIGNMENTS & SUBMISSIONS
// =========================================================================

function formatDeadlineLabel(asg) {
  if (asg.deadlineLabel) return asg.deadlineLabel;
  if (typeof asg.deadline === 'string' && asg.deadline.includes('T')) {
    const parsed = new Date(asg.deadline);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}, ${parsed.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      })} WIB`;
    }
  }
  return asg.deadline || 'Sesuai jadwal';
}

function isDeadlineOverdue(deadline) {
  if (!deadline || typeof deadline !== 'string') return false;
  const parsed = Date.parse(deadline);
  if (Number.isNaN(parsed)) return false;
  return Date.now() > parsed;
}

export async function fetchAssignmentsWithUserSubmissions({
  classId = null,
  classIds = null,
  meetingNo = null,
} = {}) {
  if (!auth?.currentUser || !db) {
    return { assignments: [], isEmpty: true, source: 'demo' };
  }

  try {
    let targetClassIds = [];
    if (classId) {
      targetClassIds = [String(classId).trim()].filter(Boolean);
    } else if (Array.isArray(classIds)) {
      targetClassIds = Array.from(new Set(classIds.map((id) => String(id || '').trim()).filter(Boolean)));
    } else {
      const userClassesRes = await fetchClassesForUser();
      targetClassIds = (userClassesRes.classes || []).map((c) => c.id).filter(Boolean);
    }

    // Short-circuit 0-class guard: never send `in: []` or global collection scan to Firestore
    if (targetClassIds.length === 0) {
      return { assignments: [], isEmpty: true, source: 'firestore' };
    }

    const asgDocs = [];
    if (classId && targetClassIds.length === 1) {
      const asgSnap = await getDocs(
        query(collection(db, 'assignments'), where('classId', '==', targetClassIds[0]))
      );
      asgDocs.push(...asgSnap.docs);
    } else {
      for (const batchIds of chunkArray(targetClassIds, 10)) {
        const asgSnap = await getDocs(
          query(collection(db, 'assignments'), where('classId', 'in', batchIds))
        );
        asgDocs.push(...asgSnap.docs);
      }
    }

    const subQuery = query(collection(db, 'submissions'), where('uid', '==', auth.currentUser.uid));
    const subSnap = await getDocs(subQuery);
    const subByAssignmentId = new Map();
    subSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.assignmentId) {
        subByAssignmentId.set(data.assignmentId, { id: docSnap.id, ...data });
      }
    });

    const parsedMeetingFilter =
      meetingNo !== null && meetingNo !== undefined && meetingNo !== '' ? Number(meetingNo) : null;

    const assignments = asgDocs
      .map((docSnap) => {
        const data = docSnap.data();
        const sub = subByAssignmentId.get(docSnap.id) || null;
        return {
          id: docSnap.id,
          classId: data.classId || '',
          meetingNo: Number(data.meetingNo || 1),
          title: data.title || 'Tugas Perkuliahan',
          subject: data.subject || 'Mata Kuliah',
          subjectCode: data.subjectCode || 'CLS',
          taskType: normalizeAssignmentTaskType(data.taskType),
          attachmentUrl: data.attachmentUrl || '',
          attachmentName: data.attachmentName || '',
          attachmentSize: data.attachmentSize || '',
          deadline: formatDeadlineLabel(data),
          rawDeadline: data.deadline || '',
          isOverdue: isDeadlineOverdue(data.deadline),
          status: sub ? 'submitted' : 'pending',
          submittedFile: sub
            ? {
                name: sub.fileName || sub.externalUrl || 'Dokumen Tugas',
                size: sub.fileSize || (sub.externalUrl ? 'Tautan URL' : '-'),
                url: sub.fileUrl || sub.externalUrl || '',
                storageType: sub.storageType || 'external_url',
                uploadedAt: sub.submittedAtLabel || 'Tercatat di Firestore',
              }
            : null,
          submittedAt: sub?.submittedAtLabel || null,
          notes: sub?.notes || '',
          externalUrl: sub?.externalUrl || '',
          groupName: sub?.groupName || '',
          groupMembers: normalizeGroupMembersList(sub?.groupMembers),
          grade: typeof sub?.grade === 'number' ? sub.grade : typeof sub?.score === 'number' ? sub.score : null,
          feedback: sub?.feedback || '',
          note: data.note || '',
          maxSize: data.maxSize || '15 MB',
          allowedFormats: data.allowedFormats || '.pdf, .docx, .zip, .jpg, .png',
        };
      })
      .filter((item) => (parsedMeetingFilter ? item.meetingNo === parsedMeetingFilter : true))
      .sort((a, b) => {
        const aMs = Date.parse(a.rawDeadline || '') || Number.MAX_SAFE_INTEGER;
        const bMs = Date.parse(b.rawDeadline || '') || Number.MAX_SAFE_INTEGER;
        return aMs - bMs;
      });

    return {
      assignments,
      isEmpty: assignments.length === 0,
      source: 'firestore',
    };
  } catch (err) {
    console.warn('[lmsFirestoreService] Gagal memuat tugas Firestore:', err.message);
    return { assignments: [], isEmpty: true, source: 'firestore_error', error: err.message };
  }
}

export async function createAssignmentInFirestore({
  classId,
  meetingNo = 1,
  title,
  subject = '',
  subjectCode = '',
  deadline = '',
  note = '',
  taskType = 'individu',
  attachmentUrl = '',
  attachmentName = '',
  attachmentSize = '',
  maxSize = '15 MB',
  allowedFormats = '.pdf, .docx, .zip, .jpg, .png',
}) {
  const cleanClassId = String(classId || '').trim();
  const cleanTitle = String(title || '').trim();
  const safeMeetingNo = Math.min(32, Math.max(1, Number(meetingNo) || 1));

  if (!cleanClassId) throw new Error('Kelas wajib dipilih.');
  if (!cleanTitle) throw new Error('Judul tugas wajib diisi.');

  const safeTaskType = normalizeAssignmentTaskType(taskType);
  const safeAttachmentUrl = normalizeOptionalHttpUrl(attachmentUrl, 'URL lampiran tugas');
  const cleanAttachmentName = safeAttachmentUrl
    ? String(attachmentName || '').trim() || 'Lampiran_Instruksi_Tugas'
    : '';
  const cleanAttachmentSize = safeAttachmentUrl ? String(attachmentSize || '').trim() : '';

  const rawDeadline = String(deadline || '').trim() || '2026-12-15T23:59:00+07:00';
  const deadlineLabel = formatDeadlineLabel({ deadline: rawDeadline });
  const basePayload = {
    classId: cleanClassId,
    meetingNo: safeMeetingNo,
    title: cleanTitle,
    subject: subject || 'Mata Kuliah Smartsa',
    subjectCode: subjectCode || 'CLS',
    taskType: safeTaskType,
    attachmentUrl: safeAttachmentUrl,
    attachmentName: cleanAttachmentName,
    attachmentSize: cleanAttachmentSize,
    deadline: rawDeadline,
    deadlineLabel,
    note: String(note || '').trim() || 'Kumpulkan berkas tugas sesuai instruksi pertemuan.',
    maxSize,
    allowedFormats,
  };

  if (!auth?.currentUser || !db) {
    return {
      id: `demo_asg_${Date.now()}`,
      ...basePayload,
      deadline: deadlineLabel,
      rawDeadline,
      isOverdue: false,
      status: 'pending',
      submittedFile: null,
      grade: null,
      source: 'demo',
    };
  }

  const docRef = await addDoc(collection(db, 'assignments'), {
    ...basePayload,
    createdBy: auth.currentUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    id: docRef.id,
    ...basePayload,
    deadline: deadlineLabel,
    rawDeadline,
    isOverdue: false,
    status: 'pending',
    submittedFile: null,
    grade: null,
    source: 'firestore',
  };
}

export async function updateAssignmentInFirestore(assignmentId, updates = {}) {
  const user = auth?.currentUser;
  if (!user || !db) {
    throw new Error('Masuk sebagai Dosen/Admin untuk memperbarui tugas di Firestore.');
  }
  const cleanAssignmentId = String(assignmentId || '').trim();
  if (!cleanAssignmentId) {
    throw new Error('ID tugas tidak valid.');
  }

  const cleanTitle = String(updates.title || '').trim();
  if (!cleanTitle) {
    throw new Error('Judul tugas wajib diisi.');
  }

  const parsedMeetingNo = Number(updates.meetingNo || 1);
  const safeMeetingNo = Math.min(32, Math.max(1, Number.isFinite(parsedMeetingNo) ? parsedMeetingNo : 1));
  const rawDeadline = String(updates.deadline || '').trim();
  const deadlineLabel = rawDeadline ? formatDeadlineLabel({ deadline: rawDeadline }) : 'Sesuai jadwal';
  const cleanNote = String(updates.note || '').trim();

  const patch = {
    title: cleanTitle,
    meetingNo: safeMeetingNo,
    deadline: rawDeadline,
    deadlineLabel,
    note: cleanNote,
    updatedBy: user.uid,
    updatedAt: serverTimestamp(),
  };

  const resultExtras = {};
  if ('taskType' in updates) {
    patch.taskType = normalizeAssignmentTaskType(updates.taskType);
    resultExtras.taskType = patch.taskType;
  }
  if ('attachmentUrl' in updates) {
    const safeUrl = normalizeOptionalHttpUrl(updates.attachmentUrl, 'URL lampiran tugas');
    patch.attachmentUrl = safeUrl;
    patch.attachmentName = safeUrl
      ? String(updates.attachmentName || '').trim() || 'Lampiran_Instruksi_Tugas'
      : '';
    patch.attachmentSize = safeUrl ? String(updates.attachmentSize || '').trim() : '';
    resultExtras.attachmentUrl = patch.attachmentUrl;
    resultExtras.attachmentName = patch.attachmentName;
    resultExtras.attachmentSize = patch.attachmentSize;
  }

  await updateDoc(doc(db, 'assignments', cleanAssignmentId), patch);

  return {
    id: cleanAssignmentId,
    title: cleanTitle,
    meetingNo: safeMeetingNo,
    deadline: deadlineLabel,
    deadlineLabel,
    rawDeadline,
    isOverdue: isDeadlineOverdue(rawDeadline),
    note: cleanNote,
    ...resultExtras,
  };
}

export async function deleteAssignmentInFirestore(assignmentId) {
  const user = auth?.currentUser;
  if (!user || !db) {
    throw new Error('Masuk sebagai Dosen/Admin untuk menghapus tugas dari Firestore.');
  }
  const cleanAssignmentId = String(assignmentId || '').trim();
  if (!cleanAssignmentId) {
    throw new Error('ID tugas tidak valid.');
  }

  await deleteDoc(doc(db, 'assignments', cleanAssignmentId));
  return { deleted: true, id: cleanAssignmentId };
}

export async function submitAssignmentToFirestore({
  assignmentId,
  classId = '',
  meetingNo = null,
  assignmentTitle = '',
  className = '',
  studentName = 'Mahasiswa',
  taskType = 'individu',
  groupName = '',
  groupMembers = [],
  fileName = '',
  fileSize = '',
  fileUrl = '',
  externalUrl = '',
  storageType = 'cloudinary',
  notes = '',
}) {
  const user = auth?.currentUser;
  if (!user || !db) {
    throw new Error('Masuk dengan akun Firebase untuk menyimpan pengumpulan tugas ke Firestore.');
  }

  const safeTaskType = normalizeAssignmentTaskType(taskType);
  const cleanGroupName = String(groupName || '').trim();
  const cleanGroupMembers = normalizeGroupMembersList(groupMembers);
  if (safeTaskType === 'kelompok') {
    if (!cleanGroupName) {
      throw new Error('Nama Kelompok wajib diisi untuk pengumpulan tugas kelompok.');
    }
    if (cleanGroupMembers.length === 0) {
      throw new Error('Daftar anggota kelompok (Nama / NIM) wajib diisi untuk tugas kelompok.');
    }
  }

  const sanitizedFileUrl = normalizeOptionalHttpUrl(fileUrl, 'URL berkas tugas');
  const sanitizedExternalUrl = normalizeOptionalHttpUrl(externalUrl, 'URL eksternal tugas');
  if (
    sanitizedFileUrl.startsWith('blob:') ||
    sanitizedFileUrl.startsWith('data:') ||
    sanitizedExternalUrl.startsWith('blob:') ||
    sanitizedExternalUrl.startsWith('data:')
  ) {
    throw new Error('URL berkas sementara (blob/data) tidak diperbolehkan disimpan ke Firestore. Gunakan unggahan Cloudinary atau tautan URL eksternal.');
  }

  const submissionId = `${assignmentId}_${user.uid}`;
  const subRef = doc(db, 'submissions', submissionId);
  const existingSnap = await getDoc(subRef);
  const nowLabel = new Date().toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const meetingPayload =
    meetingNo !== null && meetingNo !== undefined && Number(meetingNo) >= 1
      ? { meetingNo: Number(meetingNo) }
      : {};

  const groupPayload =
    safeTaskType === 'kelompok'
      ? {
          taskType: 'kelompok',
          groupName: cleanGroupName,
          groupMembers: cleanGroupMembers,
        }
      : {
          taskType: 'individu',
          groupName: '',
          groupMembers: [],
        };

  if (!existingSnap.exists()) {
    await setDoc(subRef, {
      submissionId,
      assignmentId,
      classId,
      ...meetingPayload,
      ...groupPayload,
      uid: user.uid,
      studentName,
      assignmentTitle,
      className,
      fileName: fileName || sanitizedExternalUrl || 'Tautan Tugas',
      fileSize: fileSize || 'Tautan Eksternal',
      fileUrl: sanitizedFileUrl || sanitizedExternalUrl || '',
      externalUrl: sanitizedExternalUrl || '',
      storageType,
      notes,
      status: 'submitted',
      submittedAtLabel: `${nowLabel} WIB`,
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    // Update sesuai firestore.rules (tidak menyentuh grade, score, feedback, gradedBy, uid, assignmentId)
    await updateDoc(subRef, {
      classId,
      ...meetingPayload,
      ...groupPayload,
      studentName,
      assignmentTitle,
      className,
      fileName: fileName || sanitizedExternalUrl || 'Tautan Tugas',
      fileSize: fileSize || 'Tautan Eksternal',
      fileUrl: sanitizedFileUrl || sanitizedExternalUrl || '',
      externalUrl: sanitizedExternalUrl || '',
      storageType,
      notes,
      status: 'submitted',
      submittedAtLabel: `${nowLabel} WIB`,
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  return {
    submissionId,
    submittedAtLabel: `${nowLabel} WIB`,
    ...groupPayload,
  };
}

export async function cancelSubmissionInFirestore(assignmentId) {
  const user = auth?.currentUser;
  if (!user || !db) return;
  const submissionId = `${assignmentId}_${user.uid}`;
  await deleteDoc(doc(db, 'submissions', submissionId));
}

export async function fetchSubmissionsForLecturerClasses(classIds = []) {
  const cleanIds = Array.from(
    new Set((Array.isArray(classIds) ? classIds : []).map((id) => String(id || '').trim()).filter(Boolean))
  );
  if (cleanIds.length === 0 || !auth?.currentUser || !db) return [];

  try {
    const collected = [];
    for (const batchIds of chunkArray(cleanIds, 10)) {
      const q = query(collection(db, 'submissions'), where('classId', 'in', batchIds));
      const snap = await getDocs(q);
      snap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        collected.push({
          id: docSnap.id,
          submissionId: docSnap.id,
          classId: d.classId || '',
          assignmentId: d.assignmentId || '',
          taskType: normalizeAssignmentTaskType(d.taskType),
          groupName: d.groupName || '',
          groupMembers: normalizeGroupMembersList(d.groupMembers),
          studentName: d.studentName || d.uid || 'Mahasiswa',
          assignment: d.assignmentTitle || d.assignmentId || 'Tugas Perkuliahan',
          class: d.className || d.classId || 'Kelas Smartsa',
          submittedAt: d.submittedAtLabel || 'Tercatat di Firestore',
          _sortMs: toTimestampMillis(d.submittedAt || d.updatedAt),
          fileUrl: d.fileUrl || d.externalUrl || '',
          fileName: d.fileName || '',
          notes: d.notes || '',
          grade: typeof d.grade === 'number' ? d.grade : typeof d.score === 'number' ? d.score : null,
          status: typeof d.grade === 'number' || d.status === 'graded' ? 'graded' : 'pending',
        });
      });
    }
    return collected
      .filter((item) => item.status === 'pending')
      .sort((a, b) => b._sortMs - a._sortMs);
  } catch (err) {
    console.warn('[lmsFirestoreService] Gagal memuat antrian submissions kelas pengampu:', err.message);
    return [];
  }
}

export async function gradeSubmissionInFirestore({ submissionId, grade, feedback = '' }) {
  const user = auth?.currentUser;
  if (!user || !db) {
    throw new Error('Masuk sebagai Dosen untuk menyimpan nilai ke Firestore.');
  }
  const numericGrade = Number(grade);
  if (Number.isNaN(numericGrade) || numericGrade < 0 || numericGrade > 100) {
    throw new Error('Nilai harus berupa angka antara 0 hingga 100.');
  }

  await updateDoc(doc(db, 'submissions', submissionId), {
    grade: numericGrade,
    score: numericGrade,
    feedback: String(feedback || '').trim(),
    gradedBy: user.uid,
    status: 'graded',
    gradedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

function toTimestampMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function hasDeltaContent(delta) {
  const ops = Array.isArray(delta?.ops) ? delta.ops : Array.isArray(delta) ? delta : null;
  if (!ops || ops.length === 0) return false;
  return ops.some((op) => {
    if (!op || op.insert === undefined || op.insert === null) return false;
    if (typeof op.insert === 'string') return op.insert.trim().length > 0;
    return typeof op.insert === 'object' && Object.keys(op.insert).length > 0;
  });
}

export function computeClassMaterialsCount(meetings = []) {
  if (!Array.isArray(meetings)) return 0;
  let total = 0;
  for (const m of meetings) {
    if (Array.isArray(m?.materialFiles) && m.materialFiles.length > 0) {
      total += m.materialFiles.length;
    }
    if (hasDeltaContent(m?.deltaContent)) total += 1;
    if (m?.hasVideo || (typeof m?.videoUrl === 'string' && m.videoUrl.trim())) total += 1;
    if (m?.hasPdf || (typeof m?.pdfUrl === 'string' && m.pdfUrl.trim())) total += 1;
  }
  return total;
}

export async function updateClassMeetingsInFirestore(classId, meetings) {
  if (!classId) throw new Error('ID kelas tidak valid.');
  if (!Array.isArray(meetings)) throw new Error('Daftar pertemuan tidak valid.');
  const materialsCount = computeClassMaterialsCount(meetings);
  if (!auth?.currentUser || !db) {
    return {
      classId,
      meetings,
      meetingsCount: meetings.length,
      materialsCount,
      source: 'demo',
    };
  }

  await updateDoc(doc(db, 'classes', classId), {
    meetings,
    meetingsCount: meetings.length,
    materialsCount,
    updatedAt: serverTimestamp(),
  });

  return {
    classId,
    meetings,
    meetingsCount: meetings.length,
    materialsCount,
    source: 'firestore',
  };
}

export async function updateClassDetailsInFirestore(classId, updates = {}) {
  if (!classId) throw new Error('ID kelas tidak valid.');
  const payload = {};

  if (typeof updates.name === 'string') {
    const cleanName = updates.name.trim();
    if (!cleanName) throw new Error('Nama kelas tidak boleh kosong.');
    payload.name = cleanName;
    payload.title = cleanName;
  }
  if (typeof updates.description === 'string') {
    payload.description = updates.description.trim();
  }
  if (typeof updates.category === 'string' && updates.category.trim()) {
    payload.category = updates.category.trim();
  }
  if (typeof updates.day === 'string') {
    payload.day = updates.day.trim();
  }
  if (typeof updates.time === 'string') {
    payload.time = updates.time.trim();
  }
  if (typeof updates.isPublic === 'boolean') {
    payload.isPublic = updates.isPublic;
  }
  if ('coverImage' in updates) {
    payload.coverImage = normalizeHttpsImageUrl(updates.coverImage, 'URL cover kelas');
  }

  if (Object.keys(payload).length === 0) {
    return { classId, source: auth?.currentUser && db ? 'firestore' : 'demo' };
  }

  if (!auth?.currentUser || !db) {
    return { classId, ...payload, source: 'demo' };
  }

  await updateDoc(doc(db, 'classes', classId), {
    ...payload,
    updatedAt: serverTimestamp(),
  });

  return { classId, ...payload, source: 'firestore' };
}

export const updateClassInfoInFirestore = updateClassDetailsInFirestore;

export async function fetchClassSubmissionsForGrading(classId) {
  if (!classId || !auth?.currentUser || !db) return [];

  try {
    // Query filter tunggal classId agar bebas kebutuhan composite index
    const q = query(collection(db, 'submissions'), where('classId', '==', classId));
    const snap = await getDocs(q);
    return snap.docs
      .map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          submissionId: docSnap.id,
          assignmentId: d.assignmentId || '',
          classId: d.classId || classId,
          meetingNo: d.meetingNo ? Number(d.meetingNo) : null,
          taskType: normalizeAssignmentTaskType(d.taskType),
          groupName: d.groupName || '',
          groupMembers: normalizeGroupMembersList(d.groupMembers),
          uid: d.uid || '',
          studentName: d.studentName || d.uid || 'Mahasiswa',
          assignment: d.assignmentTitle || d.assignmentId || 'Tugas Perkuliahan',
          class: d.className || d.classId || 'Kelas Smartsa',
          submittedAt: d.submittedAtLabel || 'Tercatat di Firestore',
          _sortMs: toTimestampMillis(d.submittedAt || d.updatedAt),
          fileUrl: d.fileUrl || d.externalUrl || '',
          fileName: d.fileName || '',
          notes: d.notes || '',
          feedback: d.feedback || '',
          grade: typeof d.grade === 'number' ? d.grade : typeof d.score === 'number' ? d.score : null,
          status: typeof d.grade === 'number' || d.status === 'graded' ? 'graded' : 'pending',
        };
      })
      .sort((a, b) => b._sortMs - a._sortMs);
  } catch (err) {
    console.warn('[lmsFirestoreService] Gagal memuat submissions kelas:', err.message);
    return [];
  }
}

export async function fetchClassExamAttempts(classId) {
  if (!classId || !auth?.currentUser || !db) return [];

  try {
    // Query filter tunggal classId agar bebas kebutuhan composite index
    const q = query(collection(db, 'exam_attempts'), where('classId', '==', classId));
    const snap = await getDocs(q);
    return snap.docs
      .map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          ...d,
          _sortMs: toTimestampMillis(d.submittedAt || d.updatedAt || d.examStartedAt),
        };
      })
      .sort((a, b) => b._sortMs - a._sortMs);
  } catch (err) {
    console.warn('[lmsFirestoreService] Gagal memuat exam_attempts kelas:', err.message);
    return [];
  }
}

export async function fetchClassMembers(classId) {
  if (!classId || !auth?.currentUser || !db) return [];

  try {
    const q = query(collection(db, 'class_members'), where('classId', '==', classId));
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
  } catch (err) {
    console.warn('[lmsFirestoreService] Gagal memuat daftar anggota kelas:', err.message);
    return [];
  }
}

export async function manageClassMemberViaApi({
  classId,
  memberUid = '',
  memberId = '',
  action,
} = {}) {
  const cleanClassId = String(classId || '').trim();
  const cleanAction = String(action || '').trim().toLowerCase();
  if (!cleanClassId) {
    throw new Error('ID kelas wajib diisi.');
  }
  if (!['approve', 'reject', 'remove'].includes(cleanAction)) {
    throw new Error('Aksi pengelolaan anggota tidak valid.');
  }

  let resolvedUid = String(memberUid || '').trim();
  const cleanMemberId = String(memberId || '').trim();
  if (!resolvedUid && cleanMemberId.startsWith(`${cleanClassId}_`)) {
    resolvedUid = cleanMemberId.slice(cleanClassId.length + 1);
  }
  if (!resolvedUid) {
    throw new Error('UID anggota kelas wajib diisi.');
  }

  if (!auth?.currentUser || typeof auth.currentUser.getIdToken !== 'function') {
    throw new Error('Sesi autentikasi tidak aktif. Silakan masuk kembali.');
  }

  const token = await auth.currentUser.getIdToken();
  const res = await fetch('/api/manage-members', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: cleanAction,
      classId: cleanClassId,
      memberUid: resolvedUid,
      ...(cleanMemberId ? { memberId: cleanMemberId } : {}),
    }),
  });

  const isJson = res.headers?.get?.('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    const err = new Error(data?.error || 'Gagal memperbarui status keanggotaan kelas.');
    err.code = data?.code || 'MANAGE_MEMBERS_ERROR';
    err.status = res.status;
    throw err;
  }

  return data;
}

export async function fetchMeetingExam({ classId, meetingNo = 1, examType = 'pretest' } = {}) {
  const cleanClassId = String(classId || '').trim();
  const safeExamType = examType === 'posttest' ? 'posttest' : 'pretest';
  const parsedMeetingNo = Number(meetingNo);
  if (!cleanClassId || !Number.isInteger(parsedMeetingNo) || parsedMeetingNo < 1 || parsedMeetingNo > 32) {
    return { exam: null, isConfigured: false, source: 'invalid' };
  }

  if (!auth?.currentUser || !db) {
    return { exam: null, isConfigured: false, source: 'demo' };
  }

  try {
    const examId = `${cleanClassId}_m${parsedMeetingNo}_${safeExamType}`;
    const snap = await getDoc(doc(db, 'exams', examId));
    if (!snap.exists()) {
      return { exam: null, isConfigured: false, source: 'firestore' };
    }
    const data = snap.data();
    const questions = Array.isArray(data?.questions) ? data.questions : [];
    const rawDuration = Number(data?.durationMinutes);
    return {
      exam: {
        id: snap.id,
        ...data,
        status: ['published', 'draft', 'archived'].includes(data?.status)
          ? data.status
          : 'published',
        durationMinutes:
          Number.isInteger(rawDuration) && rawDuration >= 1 && rawDuration <= 180
            ? rawDuration
            : 15,
        deadline: data?.deadline || null,
        questions,
      },
      isConfigured: questions.length > 0,
      source: 'firestore',
    };
  } catch (err) {
    console.warn('[lmsFirestoreService] Gagal memuat dokumen exams:', err.message);
    return { exam: null, isConfigured: false, source: 'firestore_error', error: err.message };
  }
}

async function postGradeInstructorAction(bodyPayload, authErrorMessage, fallbackErrorMessage) {
  const user = auth?.currentUser;
  if (!user) {
    throw new Error(authErrorMessage);
  }

  const token = await user.getIdToken();
  const res = await fetch('/api/grade', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(bodyPayload),
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  if (!isJson) {
    throw new Error('Endpoint server /api/grade tidak aktif di lingkungan dev lokal.');
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || fallbackErrorMessage);
  }
  return data;
}

export async function saveMeetingExamByInstructor({
  classId,
  meetingNo = 1,
  examType = 'pretest',
  title = '',
  status = 'published',
  durationMinutes = 15,
  deadline = null,
  questions = [],
  answerKey = {},
} = {}) {
  const normalizedStatus = ['published', 'draft', 'archived'].includes(
    String(status || '').trim().toLowerCase()
  )
    ? String(status).trim().toLowerCase()
    : 'published';
  const parsedDuration = Number(durationMinutes);
  const normalizedDuration =
    Number.isInteger(parsedDuration) && parsedDuration >= 1 && parsedDuration <= 180
      ? parsedDuration
      : 15;
  const normalizedDeadline =
    deadline !== undefined && deadline !== null && String(deadline).trim() !== ''
      ? String(deadline).trim()
      : null;

  return postGradeInstructorAction(
    {
      action: 'save_exam',
      classId,
      meetingNo: Number(meetingNo),
      examType: examType === 'posttest' ? 'posttest' : 'pretest',
      title,
      status: normalizedStatus,
      durationMinutes: normalizedDuration,
      deadline: normalizedDeadline,
      questions,
      answerKey,
    },
    'Masuk sebagai Dosen/Admin untuk menyimpan soal dan kunci evaluasi ke server.',
    'Gagal menyimpan soal dan kunci evaluasi ke server.'
  );
}

export async function archiveMeetingExamByInstructor({
  classId,
  meetingNo = 1,
  examType = 'pretest',
} = {}) {
  return postGradeInstructorAction(
    {
      action: 'archive_exam',
      classId,
      meetingNo: Number(meetingNo),
      examType: examType === 'posttest' ? 'posttest' : 'pretest',
    },
    'Masuk sebagai Dosen/Admin untuk mengarsipkan evaluasi.',
    'Gagal mengarsipkan evaluasi di server.'
  );
}

export async function deleteMeetingExamByInstructor({
  classId,
  meetingNo = 1,
  examType = 'pretest',
} = {}) {
  return postGradeInstructorAction(
    {
      action: 'delete_exam',
      classId,
      meetingNo: Number(meetingNo),
      examType: examType === 'posttest' ? 'posttest' : 'pretest',
    },
    'Masuk sebagai Dosen/Admin untuk menghapus evaluasi.',
    'Gagal menghapus evaluasi dari server.'
  );
}

export async function fetchInstructorAnswerKey({
  classId = '',
  meetingNo = 1,
  examType = 'pretest',
} = {}) {
  if (!String(classId || '').trim()) {
    return {
      answerKey: {},
      isConfigured: false,
      source: 'invalid',
    };
  }
  if (auth?.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/grade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'instructor_keys',
          classId,
          meetingNo: Number(meetingNo || 1),
          examType,
        }),
      });
      const isJson = res.headers.get('content-type')?.includes('application/json');
      if (isJson) {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Gagal memuat kunci evaluasi dari server.');
        }
        return {
          answerKey: data.answerKey || {},
          isConfigured: Boolean(data.isConfigured),
          source: 'server',
        };
      }
    } catch (err) {
      if (!import.meta.env.DEV) {
        throw err;
      }
    }
  }

  if (import.meta.env.DEV) {
    return {
      answerKey: {},
      isConfigured: false,
      source: 'unconfigured',
    };
  }

  throw new Error('Kunci evaluasi hanya dapat dimuat melalui endpoint server /api/grade.');
}

// =========================================================================
// DISCUSSIONS
// =========================================================================

export function subscribeDiscussions(callback, classIdFilter = null, meetingNoFilter = null) {
  if (!auth?.currentUser || !db) {
    callback({ discussions: [], source: 'demo' });
    return () => {};
  }

  // Query filter tunggal classId agar bebas kebutuhan composite index
  const q = classIdFilter
    ? query(collection(db, 'discussions'), where('classId', '==', classIdFilter))
    : collection(db, 'discussions');

  const parsedMeetingFilter =
    meetingNoFilter !== null && meetingNoFilter !== undefined && meetingNoFilter !== ''
      ? Number(meetingNoFilter)
      : null;

  return onSnapshot(
    q,
    (snap) => {
      const discussions = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            classId: d.classId || classIdFilter || '',
            meetingNo: Number(d.meetingNo || 1),
            subject: d.subject || 'Pemrograman Berorientasi Objek',
            authorUid: d.authorUid || '',
            author: d.author || 'Pengguna Smartsa',
            avatar: d.avatar || '',
            time: d.timeLabel || 'Baru saja',
            content: d.content || '',
            likes: Number(d.likes || 0),
            likedBy: Array.isArray(d.likedBy) ? d.likedBy : [],
            replies: Array.isArray(d.replies) ? d.replies : [],
            isVerifiedAnswer: Boolean(d.isVerifiedAnswer),
            verifiedBy: d.verifiedBy || '',
            verifiedReplyId: d.verifiedReplyId || '',
            _sortMs: toTimestampMillis(d.createdAt || d.updatedAt),
          };
        })
        .filter((item) => (parsedMeetingFilter ? item.meetingNo === parsedMeetingFilter : true))
        .sort((a, b) => b._sortMs - a._sortMs);
      callback({ discussions, source: 'firestore' });
    },
    (err) => {
      console.warn('[lmsFirestoreService] Listener discussions error:', err.message);
      callback({ discussions: [], source: 'firestore_error', error: err.message });
    }
  );
}

export async function createDiscussionTopic({
  classId,
  meetingNo = 1,
  subject,
  content,
  authorName,
  avatar = '',
}) {
  const user = auth?.currentUser;
  if (!user || !db) {
    throw new Error('Masuk dengan akun Firebase untuk mengirim topik diskusi ke Firestore.');
  }
  const cleanClassId = String(classId || '').trim();
  if (!cleanClassId) {
    throw new Error('Pilih kelas yang valid sebelum mengirim topik diskusi.');
  }
  const now = new Date();
  const timeFormatted = `${now.getHours().toString().padStart(2, '0')}:${now
    .getMinutes()
    .toString()
    .padStart(2, '0')} WIB`;

  const docRef = await addDoc(collection(db, 'discussions'), {
    classId: cleanClassId,
    meetingNo: Math.min(32, Math.max(1, Number(meetingNo) || 1)),
    subject: subject || 'Forum Diskusi Kelas',
    authorUid: user.uid,
    author: authorName || user.displayName || 'Pengguna Smartsa',
    avatar: avatar || '',
    content: String(content || '').trim(),
    likes: 0,
    likedBy: [],
    replies: [],
    isVerifiedAnswer: false,
    verifiedBy: '',
    verifiedReplyId: '',
    timeLabel: `Hari ini, ${timeFormatted}`,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function toggleVerifyDiscussionReply(discussion, replyId = null) {
  const user = auth?.currentUser;
  if (!user || !db || !discussion?.id) return null;

  const isAlreadyVerifiedForTarget =
    Boolean(discussion.isVerifiedAnswer) &&
    (replyId ? discussion.verifiedReplyId === replyId : !discussion.verifiedReplyId);

  const nextState = isAlreadyVerifiedForTarget
    ? {
        isVerifiedAnswer: false,
        verifiedBy: '',
        verifiedReplyId: '',
      }
    : {
        isVerifiedAnswer: true,
        verifiedBy: user.uid,
        verifiedReplyId: replyId || '',
      };

  await updateDoc(doc(db, 'discussions', discussion.id), {
    ...nextState,
    updatedAt: serverTimestamp(),
  });

  return nextState;
}

export async function toggleLikeDiscussion(discussion) {
  const user = auth?.currentUser;
  if (!user || !db || !discussion?.id) return null;

  const discRef = doc(db, 'discussions', discussion.id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(discRef);
    if (!snap.exists()) return null;

    const data = snap.data() || {};
    const currentLikedBy = Array.isArray(data.likedBy) ? data.likedBy : [];
    const hasLiked = currentLikedBy.includes(user.uid);
    const nextLikedBy = hasLiked
      ? currentLikedBy.filter((uid) => uid !== user.uid)
      : Array.from(new Set([...currentLikedBy, user.uid]));
    const nextLikes = nextLikedBy.length;

    tx.update(discRef, {
      likes: nextLikes,
      likedBy: nextLikedBy,
      updatedAt: serverTimestamp(),
    });

    return { likes: nextLikes, likedBy: nextLikedBy };
  });
}

export async function addDiscussionReply(discussion, replyText, authorName) {
  const user = auth?.currentUser;
  const cleanText = String(replyText || '').trim();
  if (!user || !db || !discussion?.id || !cleanText) return null;

  const now = new Date();
  const timeFormatted = `${now.getHours().toString().padStart(2, '0')}:${now
    .getMinutes()
    .toString()
    .padStart(2, '0')} WIB`;

  const newReply = {
    id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    authorUid: user.uid,
    author: authorName || user.displayName || 'Pengguna Smartsa',
    time: `Hari ini, ${timeFormatted}`,
    content: cleanText,
  };

  const discRef = doc(db, 'discussions', discussion.id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(discRef);
    if (!snap.exists()) {
      throw new Error('Topik diskusi tidak ditemukan.');
    }
    const existingReplies = Array.isArray(snap.data()?.replies) ? snap.data().replies : [];
    tx.update(discRef, {
      replies: [...existingReplies, newReply],
      updatedAt: serverTimestamp(),
    });
    return newReply;
  });
}

export async function updateDiscussionTopicContent(discussionId, nextContent) {
  const user = auth?.currentUser;
  if (!user || !db || !discussionId) {
    throw new Error('Masuk dengan akun Firebase untuk mengubah topik diskusi.');
  }
  const cleanContent = String(nextContent || '').trim();
  if (!cleanContent) {
    throw new Error('Isi topik diskusi tidak boleh kosong.');
  }

  const discRef = doc(db, 'discussions', discussionId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(discRef);
    if (!snap.exists()) {
      throw new Error('Topik diskusi tidak ditemukan.');
    }
    const data = snap.data() || {};
    if (data.authorUid && data.authorUid !== user.uid) {
      throw new Error('Anda hanya dapat mengedit topik diskusi milik Anda sendiri.');
    }
    tx.update(discRef, {
      content: cleanContent,
      editedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: discussionId, content: cleanContent };
  });
}

export async function editDiscussionReply(discussionOrId, { replyId = null, replyIndex = null, content = '' } = {}) {
  const user = auth?.currentUser;
  const discussionId = typeof discussionOrId === 'string' ? discussionOrId : discussionOrId?.id;
  if (!user || !db || !discussionId) {
    throw new Error('Masuk dengan akun Firebase untuk mengedit balasan diskusi.');
  }
  const cleanContent = String(content || '').trim();
  if (!cleanContent) {
    throw new Error('Isi balasan tidak boleh kosong.');
  }

  const now = new Date();
  const timeFormatted = `${now.getHours().toString().padStart(2, '0')}:${now
    .getMinutes()
    .toString()
    .padStart(2, '0')} WIB`;

  const discRef = doc(db, 'discussions', discussionId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(discRef);
    if (!snap.exists()) {
      throw new Error('Topik diskusi tidak ditemukan.');
    }
    const existingReplies = Array.isArray(snap.data()?.replies) ? snap.data().replies : [];
    const targetIdx = existingReplies.findIndex((r, idx) =>
      replyId && r?.id ? r.id === replyId : idx === replyIndex
    );
    if (targetIdx < 0) {
      throw new Error('Balasan yang akan diedit tidak ditemukan.');
    }
    const targetReply = existingReplies[targetIdx] || {};
    if (targetReply.authorUid !== user.uid) {
      throw new Error('Anda hanya dapat mengedit balasan atas nama akun Anda sendiri.');
    }

    const updatedReplies = existingReplies.map((r, idx) =>
      idx === targetIdx ? { ...r, content: cleanContent, editedAt: `Diedit ${timeFormatted}` } : r
    );
    tx.update(discRef, {
      replies: updatedReplies,
      updatedAt: serverTimestamp(),
    });
    return updatedReplies[targetIdx];
  });
}

export async function deleteDiscussionReply(discussion, replyIndexOrTarget) {
  const user = auth?.currentUser;
  if (!user || !db || !discussion?.id) return;

  const targetReplyId =
    replyIndexOrTarget && typeof replyIndexOrTarget === 'object'
      ? replyIndexOrTarget.replyId || null
      : null;
  const targetReplyIndex =
    replyIndexOrTarget && typeof replyIndexOrTarget === 'object'
      ? replyIndexOrTarget.replyIndex
      : replyIndexOrTarget;

  const discRef = doc(db, 'discussions', discussion.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(discRef);
    if (!snap.exists()) return;
    const existingReplies = Array.isArray(snap.data()?.replies) ? snap.data().replies : [];
    const nextReplies = existingReplies.filter((r, idx) =>
      targetReplyId && r?.id ? r.id !== targetReplyId : idx !== targetReplyIndex
    );
    tx.update(discRef, {
      replies: nextReplies,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function deleteDiscussionTopic(discussionId) {
  if (!auth?.currentUser || !db || !discussionId) return;
  await deleteDoc(doc(db, 'discussions', discussionId));
}

// =========================================================================
// LEARNING PROGRESS & EXAM ATTEMPTS
// =========================================================================

export async function fetchUserLearningProgress(uidOverride = null, classIdFilter = null) {
  const uid = uidOverride || auth?.currentUser?.uid;
  if (!uid || !db) return [];

  try {
    const cleanClassId = classIdFilter ? String(classIdFilter).trim() : '';
    const q = cleanClassId
      ? query(
          collection(db, 'learning_progress'),
          where('classId', '==', cleanClassId),
          where('uid', '==', uid)
        )
      : query(collection(db, 'learning_progress'), where('uid', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: docSnap.id,
        ...d,
        meetingNo: Number(d.meetingNo || 1),
        materialCompleted: Boolean(d.materialCompleted),
        videoCompleted: Boolean(d.videoCompleted),
      };
    });
  } catch (err) {
    console.warn('[lmsFirestoreService] Gagal memuat learning_progress:', err.message);
    return [];
  }
}

export async function fetchLearningProgressByClass(classId, uidOverride = null) {
  const uid = uidOverride || auth?.currentUser?.uid;
  if (!uid || !db || !classId) return [];

  return fetchUserLearningProgress(uid, classId);
}

export async function upsertLearningProgress({
  classId,
  meetingNo = 1,
  materialCompleted,
  videoCompleted,
}) {
  const user = auth?.currentUser;
  if (!user || !db || !classId) {
    throw new Error('Masuk dengan akun Firebase untuk menyimpan progres belajar ke Firestore.');
  }

  const parsedMeetingNo = Number(meetingNo);
  if (!Number.isInteger(parsedMeetingNo) || parsedMeetingNo < 1 || parsedMeetingNo > 32) {
    throw new Error('Nomor pertemuan tidak valid (1–32).');
  }

  const progressId = `${classId}_m${parsedMeetingNo}_${user.uid}`;
  const payload = {
    progressId,
    classId,
    meetingNo: parsedMeetingNo,
    uid: user.uid,
    updatedAt: serverTimestamp(),
  };

  if (typeof materialCompleted === 'boolean') {
    payload.materialCompleted = materialCompleted;
  }
  if (typeof videoCompleted === 'boolean') {
    payload.videoCompleted = videoCompleted;
  }

  await setDoc(doc(db, 'learning_progress', progressId), payload, { merge: true });
  return payload;
}

export async function fetchUserExamAttempts(uidOverride = null, classIdFilter = null) {
  const uid = uidOverride || auth?.currentUser?.uid;
  if (!uid || !db) return [];

  try {
    const cleanClassId = classIdFilter ? String(classIdFilter).trim() : '';
    const q = cleanClassId
      ? query(
          collection(db, 'exam_attempts'),
          where('classId', '==', cleanClassId),
          where('uid', '==', uid)
        )
      : query(collection(db, 'exam_attempts'), where('uid', '==', uid));
    const snap = await getDocs(q);
    return snap.docs
      .map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          ...d,
          meetingNo: Number(d.meetingNo || 1),
          _sortMs: toTimestampMillis(d.submittedAt || d.updatedAt || d.examStartedAt),
        };
      })
      .sort((a, b) => b._sortMs - a._sortMs);
  } catch (err) {
    console.warn('[lmsFirestoreService] Gagal memuat exam_attempts:', err.message);
    return [];
  }
}

export async function fetchUserClassExamAttempts(classId, uidOverride = null) {
  const uid = uidOverride || auth?.currentUser?.uid;
  if (!uid || !db || !classId) return [];

  return fetchUserExamAttempts(uid, classId);
}

// =========================================================================
// ADMIN CONSOLE OVERVIEW (users & classes)
// =========================================================================

export async function fetchAdminOverviewData() {
  if (!auth?.currentUser || !db) {
    return { users: [], classes: [], source: 'demo' };
  }

  try {
    const [usersSnap, classesSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'classes')),
    ]);

    const users = usersSnap.docs.map((docSnap) => {
      const data = docSnap.data();
      const { password: _ignored, ...safeUser } = data || {};
      return { id: docSnap.id, uid: docSnap.id, ...safeUser };
    });

    const classes = classesSnap.docs.map((docSnap) => normalizeClassDoc(docSnap.id, docSnap.data()));

    return { users, classes, source: 'firestore' };
  } catch (err) {
    console.warn('[lmsFirestoreService] Gagal memuat data admin Firestore:', err.message);
    return { users: [], classes: [], source: 'firestore_error', error: err.message };
  }
}

export async function updateUserVerificationByAdmin(uid, { role, verificationStatus }) {
  if (!auth?.currentUser || !db || !uid) {
    throw new Error('Otorisasi admin diperlukan untuk memperbarui status pengguna.');
  }
  await updateDoc(doc(db, 'users', uid), {
    ...(role ? { role } : {}),
    ...(verificationStatus ? { verificationStatus } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function updateUserByAdmin(uid, updates = {}) {
  if (!auth?.currentUser || !db || !uid) {
    throw new Error('Otorisasi admin diperlukan untuk memperbarui profil pengguna.');
  }
  const payload = { updatedAt: serverTimestamp() };
  if (updates.role === 'student' || updates.role === 'lecturer' || updates.role === 'admin') {
    payload.role = updates.role;
  }
  if (typeof updates.nim === 'string') payload.nim = updates.nim.trim();
  if (typeof updates.nidn === 'string') payload.nidn = updates.nidn.trim();
  if (typeof updates.nip === 'string') payload.nip = updates.nip.trim();
  if (typeof updates.verificationStatus === 'string') {
    payload.verificationStatus = updates.verificationStatus;
  }

  await updateDoc(doc(db, 'users', uid), payload);
  return payload;
}

export async function updateClassByAdmin(classId, updates = {}) {
  if (!auth?.currentUser || !db || !classId) {
    throw new Error('Otorisasi admin diperlukan untuk memperbarui data kelas.');
  }
  const payload = { updatedAt: serverTimestamp() };
  if (typeof updates.instructor === 'string' && updates.instructor.trim()) {
    payload.instructor = updates.instructor.trim();
    payload.lecturer = updates.instructor.trim();
  }
  if (typeof updates.lecturerId === 'string') {
    payload.lecturerId = updates.lecturerId.trim();
  }
  if (typeof updates.isActive === 'boolean') payload.isActive = updates.isActive;
  if (typeof updates.isPublic === 'boolean') payload.isPublic = updates.isPublic;

  await updateDoc(doc(db, 'classes', classId), payload);
  return payload;
}

export async function deleteClassByAdmin(classId) {
  if (!auth?.currentUser || !db || !classId) {
    throw new Error('Otorisasi admin diperlukan untuk menghapus kelas.');
  }
  await deleteDoc(doc(db, 'classes', classId));
}

/**
 * Mengambil seluruh daftar Manual Book PDF global dari koleksi Firestore `manual_books`.
 */
export async function fetchManualBooks() {
  if (!auth?.currentUser || !db) {
    return { books: [], isEmpty: true, source: 'unauthenticated' };
  }

  try {
    const snap = await getDocs(collection(db, 'manual_books'));
    const books = snap.docs
      .map((docSnap) => {
        const d = docSnap.data() || {};
        return {
          id: docSnap.id,
          title: d.title || 'Manual Book Smartsa',
          description: d.description || '',
          fileUrl: d.fileUrl || '',
          fileName: d.fileName || '',
          fileSize: d.fileSize || '',
          storageType: d.storageType || 'cloudinary',
          uploadedBy: d.uploadedBy || '',
          uploadedByName: d.uploadedByName || 'Dosen / Admin',
          createdAtLabel: d.createdAtLabel || 'Tercatat di Firestore',
          _sortMs: toTimestampMillis(d.createdAt || d.updatedAt),
        };
      })
      .sort((a, b) => b._sortMs - a._sortMs);

    return {
      books,
      isEmpty: books.length === 0,
      source: 'firestore',
    };
  } catch (err) {
    console.warn('[lmsFirestoreService] Gagal memuat manual_books:', err.message);
    return { books: [], isEmpty: true, source: 'firestore_error', error: err.message };
  }
}

/**
 * Menyimpan metadata Manual Book PDF baru ke koleksi global Firestore `manual_books`.
 */
export async function createManualBook({
  title,
  description = '',
  fileUrl,
  fileName = '',
  fileSize = '',
  storageType = 'cloudinary',
  uploadedByName = '',
}) {
  const user = auth?.currentUser;
  if (!user || !db) {
    throw new Error('Masuk sebagai Dosen atau Admin untuk mengunggah Manual Book ke Firestore.');
  }

  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) {
    throw new Error('Judul Manual Book wajib diisi.');
  }

  const safePdfUrl = normalizeHttpsImageUrl(fileUrl, 'URL PDF Manual Book');
  if (!safePdfUrl) {
    throw new Error('Berkas PDF atau URL PDF berawalan https:// wajib disertakan.');
  }

  const cleanDescription = String(description || '').trim();
  const cleanFileName = String(fileName || '').trim() || `${cleanTitle}.pdf`;
  const cleanFileSize = String(fileSize || '').trim();
  const cleanUploaderName =
    String(uploadedByName || '').trim() || user.displayName || user.email || 'Dosen / Admin';
  const nowLabel = new Date().toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const payload = {
    title: cleanTitle,
    description: cleanDescription,
    fileUrl: safePdfUrl,
    fileName: cleanFileName,
    fileSize: cleanFileSize,
    storageType: storageType === 'external_url' ? 'external_url' : 'cloudinary',
    uploadedBy: user.uid,
    uploadedByName: cleanUploaderName,
    createdAtLabel: nowLabel,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'manual_books'), payload);
  return {
    id: docRef.id,
    ...payload,
    _sortMs: Date.now(),
    source: 'firestore',
  };
}

/**
 * Menghapus dokumen Manual Book PDF dari koleksi global Firestore `manual_books`.
 */
export async function deleteManualBook(bookId) {
  const user = auth?.currentUser;
  if (!user || !db) {
    throw new Error('Otorisasi Dosen/Admin diperlukan untuk menghapus Manual Book.');
  }
  const cleanBookId = String(bookId || '').trim();
  if (!cleanBookId) {
    throw new Error('ID Manual Book tidak valid.');
  }
  await deleteDoc(doc(db, 'manual_books', cleanBookId));
  return { deleted: true, id: cleanBookId };
}
