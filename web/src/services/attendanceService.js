/**
 * Layanan Presensi Dinamis 2 Arah Berbasis Cloud Firestore
 * Koleksi: attendance/{classId}_m{meetingNo}_{uid} & classes/{classId}.activeAttendanceSession
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';

// Penyimpanan in-memory sementara khusus Mode Demo (tanpa localStorage)
const demoAttendanceStore = new Map();
const demoSessionStore = new Map();

export function clearDemoAttendanceStore() {
  demoAttendanceStore.clear();
  demoSessionStore.clear();
}

export function buildAttendanceQrPayload(sessionCode) {
  const clean = String(sessionCode || '').trim().toUpperCase();
  return clean ? `SMARTSA_QR:${clean}` : '';
}

export function parseAttendanceQrPayload(rawInput) {
  if (typeof rawInput !== 'string' && typeof rawInput !== 'number') return '';
  const trimmed = String(rawInput).trim();
  if (!trimmed) return '';

  // 1. Payload prefiks standar Smartsa: "SMARTSA_QR:<KODE>"
  const prefixMatch = trimmed.match(/^SMARTSA_QR\s*:\s*([A-Za-z0-9_-]+)/i);
  if (prefixMatch?.[1]) {
    return prefixMatch[1].trim().toUpperCase();
  }

  // 2. Payload JSON terstruktur: { "sessionCode": "<KODE>" } atau { "code": "<KODE>" }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const candidate = parsed?.sessionCode || parsed?.code || '';
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim().toUpperCase();
      }
    } catch {
      // Lanjutkan ke parser kode mentah
    }
  }

  // 3. URL query string (?sessionCode=<KODE> atau ?code=<KODE>)
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsedUrl = new URL(trimmed);
      const paramCode =
        parsedUrl.searchParams.get('sessionCode') || parsedUrl.searchParams.get('code') || '';
      if (paramCode.trim()) {
        return paramCode.trim().toUpperCase();
      }
    } catch {
      // Lanjutkan ke normalisasi langsung
    }
  }

  // 4. Kode sesi mentah langsung
  return trimmed.toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

function formatTimestampLabel(date = new Date()) {
  const dateFormatted = date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timeFormatted = date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${dateFormatted}, ${timeFormatted} WIB`;
}

function parseTimestampLabel(data) {
  if (data?.timestampLabel) return data.timestampLabel;
  if (typeof data?.recordedAt?.toDate === 'function') {
    return formatTimestampLabel(data.recordedAt.toDate());
  }
  return 'Tercatat di Firestore';
}

function parseMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function emitAttendanceUpdated(detail = {}) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('smartsa_attendance_updated', { detail }));
  }
}

export async function getClassAttendanceSession(classId) {
  if (!classId) return null;

  if (!auth?.currentUser || !db) {
    const demoSess = demoSessionStore.get(classId) || null;
    if (demoSess && demoSess.expiresAt <= Date.now()) {
      return { ...demoSess, isOpen: false, isExpired: true };
    }
    return demoSess;
  }

  try {
    const snap = await getDoc(doc(db, 'classes', classId));
    if (!snap.exists()) return null;
    const sess = snap.data()?.activeAttendanceSession || null;
    if (!sess) return null;
    const expiresAtMs = parseMillis(sess.expiresAt);
    const isExpired = Boolean(expiresAtMs && expiresAtMs <= Date.now());
    return {
      ...sess,
      expiresAt: expiresAtMs,
      isExpired,
      isOpen: Boolean(sess.isOpen && !isExpired),
    };
  } catch (err) {
    console.warn('[attendanceService] Gagal membaca sesi presensi kelas:', err.message);
    return null;
  }
}

export async function openAttendanceSession({
  classId,
  classCode = 'CLS',
  meetingNo = 1,
  durationMinutes = 15,
  customCode = '',
}) {
  const parsedMeetingNo = Number.parseInt(meetingNo, 10);
  if (!classId || Number.isNaN(parsedMeetingNo) || parsedMeetingNo < 1 || parsedMeetingNo > 16) {
    throw new Error('Nomor pertemuan harus berada antara 1 sampai 16.');
  }

  const mins = Math.max(1, Math.min(180, Number.parseInt(durationMinutes, 10) || 15));
  const padded = parsedMeetingNo < 10 ? `0${parsedMeetingNo}` : `${parsedMeetingNo}`;
  const cleanCustom = String(customCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const sessionCode = cleanCustom || `${String(classCode).toUpperCase()}-M${padded}-${randomSuffix}`;
  const nowMs = Date.now();
  const expiresAt = nowMs + mins * 60 * 1000;

  const sessionPayload = {
    meetingNo: parsedMeetingNo,
    sessionCode,
    openedAt: nowMs,
    expiresAt,
    openedBy: auth?.currentUser?.uid || 'demo_lecturer',
    isOpen: true,
  };

  if (!auth?.currentUser || !db) {
    demoSessionStore.set(classId, sessionPayload);
    emitAttendanceUpdated({ classId, meetingNo: parsedMeetingNo, sessionOpened: true });
    return sessionPayload;
  }

  await updateDoc(doc(db, 'classes', classId), {
    activeAttendanceSession: sessionPayload,
    updatedAt: serverTimestamp(),
  });

  emitAttendanceUpdated({ classId, meetingNo: parsedMeetingNo, sessionOpened: true });
  return sessionPayload;
}

export async function closeAttendanceSession(classId) {
  if (!classId) return;

  if (!auth?.currentUser || !db) {
    demoSessionStore.delete(classId);
    emitAttendanceUpdated({ classId, sessionClosed: true });
    return;
  }

  await updateDoc(doc(db, 'classes', classId), {
    activeAttendanceSession: null,
    updatedAt: serverTimestamp(),
  });
  emitAttendanceUpdated({ classId, sessionClosed: true });
}

export async function getClassAttendance(classId, uidOverride = null) {
  if (!classId) return { classId: '', attendedOrders: [], progress: 0, history: [] };

  const uid = uidOverride || auth?.currentUser?.uid;
  if (!uid || !db) {
    const existing = demoAttendanceStore.get(classId);
    return (
      existing || {
        classId,
        attendedOrders: [],
        progress: 0,
        history: [],
      }
    );
  }

  try {
    const q = query(
      collection(db, 'attendance'),
      where('classId', '==', classId),
      where('uid', '==', uid),
      orderBy('meetingNo', 'asc')
    );
    const snap = await getDocs(q);
    const history = snap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        meetingOrder: Number(data.meetingNo),
        meetingTitle: data.meetingTitle || `Pertemuan ${data.meetingNo}`,
        barcode: data.sessionCode || '',
        timestamp: parseTimestampLabel(data),
        progressGained: data.progressGained || 6,
        status: data.status || 'TERVERIFIKASI',
      };
    });
    const attendedOrders = history.map((item) => item.meetingOrder).filter((n) => !Number.isNaN(n));
    const progress = Math.min(100, attendedOrders.length >= 16 ? 100 : attendedOrders.length * 6);
    return {
      classId,
      attendedOrders,
      progress,
      history: [...history].reverse(),
    };
  } catch (err) {
    console.warn('[attendanceService] Gagal membaca riwayat presensi Firestore:', err.message);
    return { classId, attendedOrders: [], progress: 0, history: [] };
  }
}

export async function getSemesterAttendanceSummary(uidOverride = null, activeClasses = null) {
  const uid = uidOverride || auth?.currentUser?.uid;
  const hasScopedClasses = Array.isArray(activeClasses);
  const activeClassIds = hasScopedClasses
    ? Array.from(
        new Set(
          activeClasses
            .map((item) => (typeof item === 'string' ? item : item?.id || ''))
            .filter(Boolean)
        )
      )
    : [];
  const activeClassIdSet = hasScopedClasses ? new Set(activeClassIds) : null;
  const totalMeetings = hasScopedClasses
    ? activeClasses.reduce(
        (sum, item) =>
          typeof item === 'object' && item !== null
            ? sum + Number(item.meetingsCount ?? item.meetings?.length ?? 0)
            : sum,
        0
      )
    : 0;

  if (hasScopedClasses && activeClassIds.length === 0) {
    return { attended: 0, totalMeetings: 0, progress: 0 };
  }

  if (!uid || !db) {
    let totalAttended = 0;
    for (const [classIdKey, record] of demoAttendanceStore.entries()) {
      if (activeClassIdSet && !activeClassIdSet.has(classIdKey)) continue;
      totalAttended += record.attendedOrders.length;
    }
    const progress =
      totalMeetings > 0
        ? Math.min(100, Math.round((totalAttended / totalMeetings) * 100))
        : 0;
    return {
      attended: totalAttended,
      totalMeetings,
      progress,
    };
  }

  try {
    const q = query(collection(db, 'attendance'), where('uid', '==', uid));
    const snap = await getDocs(q);
    const attended = snap.docs.filter((docSnap) => {
      if (!activeClassIdSet) return true;
      return activeClassIdSet.has(docSnap.data()?.classId);
    }).length;
    const progress =
      totalMeetings > 0
        ? Math.min(100, Math.round((attended / totalMeetings) * 100))
        : 0;
    return {
      attended,
      totalMeetings,
      progress,
    };
  } catch (err) {
    console.warn('[attendanceService] Gagal membaca ringkasan presensi semester:', err.message);
    return { attended: 0, totalMeetings, progress: 0 };
  }
}

export async function recordMeetingAttendance({
  classId,
  meetingNo = null,
  meetingTitle = '',
  sessionCode = '',
}) {
  if (!classId) {
    return { success: false, message: 'Data kelas tidak valid.' };
  }

  const normalizedSessionCode = parseAttendanceQrPayload(sessionCode);
  const uid = auth?.currentUser?.uid;

  // Mode Demo (tanpa akun Firebase aktif) -> simpan in-memory agar UI tetap responsif
  if (!uid || !db) {
    const demoSession = demoSessionStore.get(classId);
    const resolvedOrder = Number.parseInt(meetingNo || demoSession?.meetingNo || 1, 10);
    if (demoSession) {
      if (demoSession.expiresAt <= Date.now()) {
        return { success: false, expired: true, message: 'Sesi presensi demo telah kedaluwarsa.' };
      }
      if (
        normalizedSessionCode &&
        demoSession.sessionCode.toUpperCase() !== normalizedSessionCode
      ) {
        return { success: false, invalidCode: true, message: 'Kode sesi presensi tidak cocok.' };
      }
    }

    const current = demoAttendanceStore.get(classId) || {
      classId,
      attendedOrders: [],
      progress: 0,
      history: [],
    };
    if (current.attendedOrders.includes(resolvedOrder)) {
      return {
        success: false,
        alreadyAttended: true,
        progress: current.progress,
        message: `Pertemuan ${resolvedOrder < 10 ? `0${resolvedOrder}` : resolvedOrder} sudah pernah dipresensi.`,
      };
    }

    const updatedOrders = [...current.attendedOrders, resolvedOrder].sort((a, b) => a - b);
    const newProgress = Math.min(100, updatedOrders.length >= 16 ? 100 : updatedOrders.length * 6);
    const newItem = {
      id: `${classId}_m${resolvedOrder}_demo`,
      meetingOrder: resolvedOrder,
      meetingTitle: meetingTitle || `Pertemuan 0${resolvedOrder}`,
      barcode: normalizedSessionCode || demoSession?.sessionCode || `${classId.toUpperCase()}-DEMO`,
      timestamp: formatTimestampLabel(new Date()),
      progressGained: 6,
      status: 'TERVERIFIKASI (DEMO)',
    };
    demoAttendanceStore.set(classId, {
      classId,
      attendedOrders: updatedOrders,
      progress: newProgress,
      history: [newItem, ...current.history],
    });
    emitAttendanceUpdated({ classId, meetingOrder: resolvedOrder, progress: newProgress });
    return {
      success: true,
      progress: newProgress,
      addedPercent: 6,
      meetingOrder: resolvedOrder,
      historyItem: newItem,
      message: `Presensi Pertemuan 0${resolvedOrder} berhasil dicatat (Mode Demo)!`,
    };
  }

  // Mode Terautentikasi -> Validasi sesi aktif dosen di classes/{classId}
  const classSnap = await getDoc(doc(db, 'classes', classId));
  if (!classSnap.exists()) {
    return { success: false, message: 'Dokumen kelas tidak ditemukan di Firestore.' };
  }

  const classData = classSnap.data();
  const activeSession = classData?.activeAttendanceSession;
  if (!activeSession || activeSession.isOpen === false) {
    return {
      success: false,
      noActiveSession: true,
      message: 'Dosen belum membuka sesi presensi untuk mata kuliah ini.',
    };
  }

  const expiresAtMs = parseMillis(activeSession.expiresAt);
  if (expiresAtMs && Date.now() > expiresAtMs) {
    return {
      success: false,
      expired: true,
      message: 'Sesi presensi telah kedaluwarsa. Minta dosen membuka sesi baru.',
    };
  }

  const cleanInputCode = String(sessionCode || '').trim().toUpperCase();
  const expectedCode = String(activeSession.sessionCode || '').trim().toUpperCase();
  if (!cleanInputCode || cleanInputCode !== expectedCode) {
    return {
      success: false,
      invalidCode: true,
      message: 'Kode sesi presensi tidak valid atau tidak sesuai dengan sesi yang dibuka dosen.',
    };
  }

  const resolvedOrder = Number.parseInt(activeSession.meetingNo, 10);
  if (Number.isNaN(resolvedOrder) || resolvedOrder < 1 || resolvedOrder > 32) {
    return { success: false, message: 'Nomor pertemuan pada sesi presensi tidak valid.' };
  }

  // Validasi keanggotaan aktif class_members/{classId}_{uid} sesuai firestore.rules
  const memberRef = doc(db, 'class_members', `${classId}_${uid}`);
  const memberSnap = await getDoc(memberRef);
  const memberStatus = memberSnap.exists() ? memberSnap.data()?.status : null;
  const isApprovedMember =
    memberSnap.exists() && (!memberStatus || memberStatus === 'approved' || memberStatus === 'active');
  if (!isApprovedMember) {
    return {
      success: false,
      notMember: true,
      message: memberSnap.exists()
        ? `Keanggotaan Anda di kelas ${classData.code || classId} masih menunggu persetujuan dosen/admin.`
        : `Anda belum tergabung di kelas ${classData.code || classId}. Silakan gabung kelas terlebih dahulu.`,
    };
  }

  const attendanceId = `${classId}_m${resolvedOrder}_${uid}`;
  const attRef = doc(db, 'attendance', attendanceId);
  const existingSnap = await getDoc(attRef);
  if (existingSnap.exists()) {
    return {
      success: false,
      alreadyAttended: true,
      message: `Pertemuan ${resolvedOrder < 10 ? `0${resolvedOrder}` : resolvedOrder} sudah pernah Anda presensi sebelumnya.`,
    };
  }

  const nowLabel = formatTimestampLabel(new Date());
  const padded = resolvedOrder < 10 ? `0${resolvedOrder}` : `${resolvedOrder}`;
  await setDoc(attRef, {
    attendanceId,
    classId,
    uid,
    studentName: auth?.currentUser?.displayName || auth?.currentUser?.email || 'Mahasiswa',
    meetingNo: resolvedOrder,
    meetingTitle: meetingTitle || `Pertemuan ${padded}: ${classData.title || classData.name || ''}`.trim(),
    sessionCode: expectedCode,
    status: 'TERVERIFIKASI',
    progressGained: 6,
    timestampLabel: nowLabel,
    recordedAt: serverTimestamp(),
  });

  const updated = await getClassAttendance(classId, uid);
  emitAttendanceUpdated({ classId, meetingOrder: resolvedOrder, progress: updated.progress });

  return {
    success: true,
    meetingOrder: resolvedOrder,
    progress: updated.progress,
    addedPercent: 6,
    message: `Presensi Pertemuan ${padded} berhasil diverifikasi di Firestore! Progres bertambah +6%.`,
  };
}

export async function fetchMeetingAttendees(classId, meetingNo = null) {
  if (!classId) return [];

  if (!auth?.currentUser || !db) {
    const demo = demoAttendanceStore.get(classId);
    if (!demo?.history?.length) return [];
    const targetNo = meetingNo ? Number(meetingNo) : null;
    return demo.history
      .filter((h) => !targetNo || Number(h.meetingOrder) === targetNo)
      .map((h) => ({
        id: h.id,
        uid: 'demo_student',
        studentName: 'Mahasiswa Demo',
        meetingNo: h.meetingOrder,
        sessionCode: h.barcode,
        timestampLabel: h.timestamp,
        status: h.status,
      }));
  }

  try {
    // Query filter tunggal classId agar bebas kebutuhan composite index
    const q = query(collection(db, 'attendance'), where('classId', '==', classId));
    const snap = await getDocs(q);
    const targetNo = meetingNo ? Number(meetingNo) : null;
    return snap.docs
      .map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          uid: d.uid || '',
          studentName: d.studentName || d.uid || 'Mahasiswa',
          meetingNo: Number(d.meetingNo || 0),
          sessionCode: d.sessionCode || '',
          timestampLabel: parseTimestampLabel(d),
          _sortMs: parseMillis(d.recordedAt),
          status: d.status || 'TERVERIFIKASI',
        };
      })
      .filter((item) => !targetNo || item.meetingNo === targetNo)
      .sort((a, b) => b._sortMs - a._sortMs || a.meetingNo - b.meetingNo);
  } catch (err) {
    console.warn('[attendanceService] Gagal memuat daftar hadir kelas:', err.message);
    return [];
  }
}
