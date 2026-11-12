/**
 * Layanan Modular Cloud Firestore untuk Smartsa LMS
 * Koleksi: classes, class_members, assignments, submissions, discussions, exam_attempts
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { DEMO_CLASSES } from './mockData';

const COLOR_SCHEMES = {
  code: { bg: 'bg-blue-50/80', text: 'text-blue-600', border: 'border-blue-100' },
  database: { bg: 'bg-teal-50/80', text: 'text-teal-600', border: 'border-teal-100' },
  mobile: { bg: 'bg-amber-50/80', text: 'text-amber-600', border: 'border-amber-100' },
  git: { bg: 'bg-emerald-50/80', text: 'text-emerald-600', border: 'border-emerald-100' },
  palette: { bg: 'bg-pink-50/80', text: 'text-pink-600', border: 'border-pink-100' },
  layers: { bg: 'bg-purple-50/80', text: 'text-purple-600', border: 'border-purple-100' },
};

function buildFallbackMeetings(classId, day = 'Senin', time = '08.00–10.30') {
  return Array.from({ length: 16 }, (_, idx) => {
    const order = idx + 1;
    const padded = order < 10 ? `0${order}` : `${order}`;
    return {
      id: `${classId}_m${order}`,
      order,
      title: `Pertemuan ${padded}: Modul Pembelajaran ${padded}`,
      status: order === 1 ? 'in_progress' : order <= 2 ? 'open' : 'locked',
      date: `Minggu ke-${order} (${day}, ${time})`,
      hasVideo: true,
      hasPdf: true,
    };
  });
}

export function normalizeClassDoc(id, data = {}) {
  const iconType = data.iconType || 'layers';
  const day = data.day || 'Senin';
  const time = data.time || '08.00–10.30';
  const title = data.title || data.name || 'Mata Kuliah Smartsa';
  const instructor = data.instructor || data.lecturer || 'Dosen Pengampu';
  const meetings =
    Array.isArray(data.meetings) && data.meetings.length > 0
      ? data.meetings
      : buildFallbackMeetings(id, day, time);

  return {
    id,
    name: data.name || title,
    title,
    code: data.code || 'CLS000',
    lecturer: instructor,
    instructor,
    lecturerId: data.lecturerId || '',
    category: data.category || 'Teknologi Informasi',
    description: data.description || 'Kelas pembelajaran interaktif Smartsa LMS.',
    day,
    time,
    iconType,
    colorScheme: data.colorScheme || COLOR_SCHEMES[iconType] || COLOR_SCHEMES.layers,
    coverImage:
      data.coverImage ||
      'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=600&q=80',
    enrolledCount: Number(data.enrolledCount || 0),
    maxStudents: Number(data.maxStudents || 50),
    materialsCount: Number(data.materialsCount || 5),
    completedCount: Number(data.completedCount || 0),
    meetingsCount: Number(data.meetingsCount || meetings.length),
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
      classes: DEMO_CLASSES.map((c) => normalizeClassDoc(c.id, c)),
      isEmpty: false,
      source: 'demo',
    };
  }
  try {
    const q = query(collection(db, 'classes'), where('isPublic', '==', true));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return {
        classes: snap.docs.map((docSnap) => normalizeClassDoc(docSnap.id, docSnap.data())),
        isEmpty: false,
        source: 'firestore',
      };
    }
  } catch (err) {
    console.warn('[lmsFirestoreService] Public classes fallback to demo:', err.message);
  }
  return {
    classes: DEMO_CLASSES.map((c) => normalizeClassDoc(c.id, c)),
    isEmpty: false,
    source: 'demo',
  };
}

export async function fetchClasses() {
  if (!auth?.currentUser || !db) {
    return {
      classes: DEMO_CLASSES.map((c) => normalizeClassDoc(c.id, c)),
      isEmpty: false,
      source: 'demo',
    };
  }

  try {
    const snap = await getDocs(collection(db, 'classes'));
    const classes = snap.docs.map((docSnap) => normalizeClassDoc(docSnap.id, docSnap.data()));
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

export async function createClassInFirestore({
  name,
  category = 'Teknologi Informasi',
  description = '',
  instructorName = 'Pendidik Terdaftar',
  day = 'Senin',
  time = '08.00–10.30',
}) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Nama kelas wajib diisi.');

  const generatedCode = `CLS${Math.floor(100 + Math.random() * 900)}`;
  const classId = `cls_${Date.now()}`;
  const meetings = buildFallbackMeetings(classId, day, time);

  const payload = {
    id: classId,
    name: cleanName,
    title: cleanName,
    code: generatedCode,
    description: description.trim() || 'Kelas pembelajaran interaktif Smartsa LMS.',
    instructor: instructorName,
    lecturer: instructorName,
    lecturerId: auth?.currentUser?.uid || 'demo_lecturer',
    category,
    day,
    time,
    iconType: 'layers',
    coverImage:
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80',
    enrolledCount: 0,
    maxStudents: 50,
    materialsCount: 5,
    meetingsCount: meetings.length,
    isPublic: true,
    isActive: true,
    activeAttendanceSession: null,
    meetings,
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
  if (cleanCode.length < 4) {
    throw new Error('Kode kelas minimal terdiri dari 4 karakter alfanumerik.');
  }

  if (!auth?.currentUser || !db) {
    const found = DEMO_CLASSES.find((c) => c.code.toUpperCase() === cleanCode);
    if (!found) {
      throw new Error('Kode kelas tidak valid atau kelas tidak aktif (Mode Demo).');
    }
    return {
      joined: true,
      alreadyMember: false,
      isDemoFallback: true,
      classData: normalizeClassDoc(found.id, found),
    };
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
        throw new Error(data.error || 'Kode kelas tidak valid atau gagal bergabung ke kelas.');
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
      err instanceof Error &&
      (err.message.includes('Kode kelas') ||
        err.message.includes('Kapasitas') ||
        err.message.includes('Kelas') ||
        err.message.includes('Invalid') ||
        err.message.includes('token'))
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

export async function fetchAssignmentsWithUserSubmissions({ classId = null } = {}) {
  if (!auth?.currentUser || !db) {
    return { assignments: [], isEmpty: true, source: 'demo' };
  }

  try {
    const asgQuery = classId
      ? query(collection(db, 'assignments'), where('classId', '==', classId), orderBy('deadline', 'asc'))
      : collection(db, 'assignments');
    const asgSnap = await getDocs(asgQuery);

    const subQuery = query(collection(db, 'submissions'), where('uid', '==', auth.currentUser.uid));
    const subSnap = await getDocs(subQuery);
    const subByAssignmentId = new Map();
    subSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.assignmentId) {
        subByAssignmentId.set(data.assignmentId, { id: docSnap.id, ...data });
      }
    });

    const assignments = asgSnap.docs.map((docSnap) => {
      const data = docSnap.data();
      const sub = subByAssignmentId.get(docSnap.id) || null;
      return {
        id: docSnap.id,
        classId: data.classId || '',
        title: data.title || 'Tugas Perkuliahan',
        subject: data.subject || 'Mata Kuliah',
        subjectCode: data.subjectCode || 'CLS',
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
        grade: typeof sub?.grade === 'number' ? sub.grade : typeof sub?.score === 'number' ? sub.score : null,
        feedback: sub?.feedback || '',
        note: data.note || '',
        maxSize: data.maxSize || '15 MB',
        allowedFormats: data.allowedFormats || '.pdf, .zip, .docx',
      };
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

export async function submitAssignmentToFirestore({
  assignmentId,
  classId = '',
  assignmentTitle = '',
  className = '',
  studentName = 'Mahasiswa',
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

  const sanitizedFileUrl = String(fileUrl || '').trim();
  const sanitizedExternalUrl = String(externalUrl || '').trim();
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

  if (!existingSnap.exists()) {
    await setDoc(subRef, {
      submissionId,
      assignmentId,
      classId,
      uid: user.uid,
      studentName,
      assignmentTitle,
      className,
      fileName: fileName || externalUrl || 'Tautan Tugas',
      fileSize: fileSize || 'Tautan Eksternal',
      fileUrl: fileUrl || externalUrl || '',
      externalUrl: externalUrl || '',
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
      studentName,
      assignmentTitle,
      className,
      fileName: fileName || externalUrl || 'Tautan Tugas',
      fileSize: fileSize || 'Tautan Eksternal',
      fileUrl: fileUrl || externalUrl || '',
      externalUrl: externalUrl || '',
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
  };
}

export async function cancelSubmissionInFirestore(assignmentId) {
  const user = auth?.currentUser;
  if (!user || !db) return;
  const submissionId = `${assignmentId}_${user.uid}`;
  await deleteDoc(doc(db, 'submissions', submissionId));
}

export async function fetchAllSubmissionsForGrading() {
  if (!auth?.currentUser || !db) return [];

  try {
    const snap = await getDocs(collection(db, 'submissions'));
    return snap.docs
      .map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          submissionId: docSnap.id,
          assignmentId: d.assignmentId || '',
          studentName: d.studentName || d.uid || 'Mahasiswa',
          assignment: d.assignmentTitle || d.assignmentId || 'Tugas Perkuliahan',
          class: d.className || d.classId || 'Kelas Smartsa',
          submittedAt: d.submittedAtLabel || 'Tercatat di Firestore',
          fileUrl: d.fileUrl || d.externalUrl || '',
          fileName: d.fileName || '',
          notes: d.notes || '',
          grade: typeof d.grade === 'number' ? d.grade : typeof d.score === 'number' ? d.score : null,
          status: typeof d.grade === 'number' || d.status === 'graded' ? 'graded' : 'pending',
        };
      })
      .filter((item) => item.status === 'pending');
  } catch (err) {
    console.warn('[lmsFirestoreService] Gagal memuat antrian submissions:', err.message);
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

// =========================================================================
// DISCUSSIONS
// =========================================================================

export function subscribeDiscussions(callback, classIdFilter = null) {
  if (!auth?.currentUser || !db) {
    callback({ discussions: [], source: 'demo' });
    return () => {};
  }

  const q = classIdFilter
    ? query(collection(db, 'discussions'), where('classId', '==', classIdFilter), orderBy('createdAt', 'desc'))
    : query(collection(db, 'discussions'), orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snap) => {
      const discussions = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          classId: d.classId || 'subj_pbo',
          subject: d.subject || 'Pemrograman Berorientasi Objek',
          authorUid: d.authorUid || '',
          author: d.author || 'Pengguna Smartsa',
          avatar:
            d.avatar ||
            'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
          time: d.timeLabel || 'Baru saja',
          content: d.content || '',
          likes: Number(d.likes || 0),
          likedBy: Array.isArray(d.likedBy) ? d.likedBy : [],
          replies: Array.isArray(d.replies) ? d.replies : [],
        };
      });
      callback({ discussions, source: 'firestore' });
    },
    (err) => {
      console.warn('[lmsFirestoreService] Listener discussions error:', err.message);
      callback({ discussions: [], source: 'firestore_error', error: err.message });
    }
  );
}

export async function createDiscussionTopic({ classId, subject, content, authorName, avatar }) {
  const user = auth?.currentUser;
  if (!user || !db) {
    throw new Error('Masuk dengan akun Firebase untuk mengirim topik diskusi ke Firestore.');
  }
  const now = new Date();
  const timeFormatted = `${now.getHours().toString().padStart(2, '0')}:${now
    .getMinutes()
    .toString()
    .padStart(2, '0')} WIB`;

  const docRef = await addDoc(collection(db, 'discussions'), {
    classId: classId || 'subj_pbo',
    subject: subject || 'Pemrograman Berorientasi Objek',
    authorUid: user.uid,
    author: authorName || user.displayName || 'Pengguna Smartsa',
    avatar:
      avatar ||
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
    content: String(content || '').trim(),
    likes: 0,
    likedBy: [],
    replies: [],
    timeLabel: `Hari ini, ${timeFormatted}`,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function toggleLikeDiscussion(discussion) {
  const user = auth?.currentUser;
  if (!user || !db || !discussion?.id) return;

  const currentLikedBy = Array.isArray(discussion.likedBy) ? discussion.likedBy : [];
  const hasLiked = currentLikedBy.includes(user.uid);
  const nextLikedBy = hasLiked
    ? currentLikedBy.filter((uid) => uid !== user.uid)
    : [...currentLikedBy, user.uid];
  const nextLikes = Math.max(0, hasLiked ? Number(discussion.likes || 1) - 1 : Number(discussion.likes || 0) + 1);

  await updateDoc(doc(db, 'discussions', discussion.id), {
    likes: nextLikes,
    likedBy: nextLikedBy,
    updatedAt: serverTimestamp(),
  });
}

export async function addDiscussionReply(discussion, replyText, authorName) {
  const user = auth?.currentUser;
  if (!user || !db || !discussion?.id) return;

  const now = new Date();
  const timeFormatted = `${now.getHours().toString().padStart(2, '0')}:${now
    .getMinutes()
    .toString()
    .padStart(2, '0')} WIB`;

  const newReply = {
    id: `rep_${Date.now()}`,
    authorUid: user.uid,
    author: authorName || user.displayName || 'Pengguna Smartsa',
    time: `Hari ini, ${timeFormatted}`,
    content: String(replyText || '').trim(),
  };

  await updateDoc(doc(db, 'discussions', discussion.id), {
    replies: [...(discussion.replies || []), newReply],
    updatedAt: serverTimestamp(),
  });
}

export async function deleteDiscussionReply(discussion, replyIndex) {
  const user = auth?.currentUser;
  if (!user || !db || !discussion?.id) return;

  const nextReplies = (discussion.replies || []).filter((_, idx) => idx !== replyIndex);
  await updateDoc(doc(db, 'discussions', discussion.id), {
    replies: nextReplies,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteDiscussionTopic(discussionId) {
  if (!auth?.currentUser || !db || !discussionId) return;
  await deleteDoc(doc(db, 'discussions', discussionId));
}

// =========================================================================
// EXAM ATTEMPTS
// =========================================================================

export async function fetchUserExamAttempts(uidOverride = null) {
  const uid = uidOverride || auth?.currentUser?.uid;
  if (!uid || !db) return [];

  try {
    const q = query(collection(db, 'exam_attempts'), where('uid', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (err) {
    console.warn('[lmsFirestoreService] Gagal memuat exam_attempts:', err.message);
    return [];
  }
}

export async function fetchClassExamAttempt(classId, uidOverride = null) {
  const uid = uidOverride || auth?.currentUser?.uid;
  if (!uid || !db || !classId) return null;

  try {
    const snap = await getDoc(doc(db, 'exam_attempts', `${classId}_${uid}`));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch {
    return null;
  }
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
