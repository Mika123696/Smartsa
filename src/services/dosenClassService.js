import { DEMO_COURSE_STUDENTS } from './mockData';

const ATTENDANCE_KEY_PREFIX = 'smartsa_dosen_attendance_';
const STUDENTS_KEY_PREFIX = 'smartsa_dosen_students_';
const QR_SESSION_KEY_PREFIX = 'smartsa_dosen_qr_';

export const ATTENDANCE_STATUSES = [
  {
    key: 'Hadir',
    label: 'Hadir',
    activeClass: 'bg-emerald-500 text-black font-bold border-emerald-400',
    badgeClass: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40',
  },
  {
    key: 'Izin',
    label: 'Izin',
    activeClass: 'bg-sky-500 text-black font-bold border-sky-400',
    badgeClass: 'bg-sky-950/60 text-sky-300 border-sky-500/40',
  },
  {
    key: 'Sakit',
    label: 'Sakit',
    activeClass: 'bg-amber-500 text-black font-bold border-amber-400',
    badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-500/40',
  },
  {
    key: 'Alpa',
    label: 'Alpa',
    activeClass: 'bg-rose-500 text-white font-bold border-rose-400',
    badgeClass: 'bg-rose-950/60 text-rose-300 border-rose-500/40',
  },
];

// Menghasilkan matriks QR Code deterministik berbasis token string
export function generateQrMatrix(seedString, size = 21) {
  const matrix = Array.from({ length: size }, () => Array(size).fill(false));

  const placeFinder = (rowStart, colStart) => {
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        matrix[rowStart + r][colStart + c] = isBorder || isCenter;
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  let hash = 2166136261;
  for (let i = 0; i < seedString.length; i += 1) {
    hash ^= seedString.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= size - 8;
      const inBottomLeft = r >= size - 8 && c < 8;
      if (inTopLeft || inTopRight || inBottomLeft) continue;

      if (r === 6 || c === 6) {
        matrix[r][c] = (r + c) % 2 === 0;
        continue;
      }

      hash ^= (r * 31 + c * 17) & 0xff;
      hash = Math.imul(hash, 16777619);
      matrix[r][c] = (hash >>> 0) % 2 === 0;
    }
  }

  return matrix;
}

function buildDefaultAttendance() {
  const initialM1 = {};
  DEMO_COURSE_STUDENTS.forEach((s, idx) => {
    initialM1[s.id] = idx === 4 ? 'Izin' : idx === 18 ? 'Alpa' : 'Hadir';
  });
  return { 1: initialM1 };
}

export function getCourseAttendance(matkulId) {
  if (!matkulId) return buildDefaultAttendance();
  try {
    const raw = localStorage.getItem(`${ATTENDANCE_KEY_PREFIX}${matkulId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // fallback
  }
  return buildDefaultAttendance();
}

export function saveCourseAttendance(matkulId, records) {
  if (!matkulId) return;
  try {
    localStorage.setItem(`${ATTENDANCE_KEY_PREFIX}${matkulId}`, JSON.stringify(records));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('smartsa_dosen_attendance_updated', {
          detail: { matkulId, records },
        })
      );
    }
  } catch (err) {
    console.warn('Gagal menyimpan presensi mata kuliah:', err);
  }
}

export function getCourseStudents(matkulId) {
  if (!matkulId) return DEMO_COURSE_STUDENTS;
  try {
    const raw = localStorage.getItem(`${STUDENTS_KEY_PREFIX}${matkulId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fallback
  }
  return DEMO_COURSE_STUDENTS;
}

export function saveCourseStudents(matkulId, students) {
  if (!matkulId) return;
  try {
    localStorage.setItem(`${STUDENTS_KEY_PREFIX}${matkulId}`, JSON.stringify(students));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('smartsa_dosen_students_updated', {
          detail: { matkulId, students },
        })
      );
    }
  } catch (err) {
    console.warn('Gagal menyimpan data mahasiswa:', err);
  }
}

export function calculateStudentAttendanceSummary(attendanceRecords, studentId) {
  const meetingKeys = Object.keys(attendanceRecords || {});
  if (meetingKeys.length === 0) {
    return { percent: 100, hadirCount: 0, totalMeetings: 0 };
  }
  let hadirCount = 0;
  let recordedCount = 0;
  meetingKeys.forEach((mKey) => {
    const status = attendanceRecords[mKey]?.[studentId];
    if (status) {
      recordedCount += 1;
      if (status === 'Hadir') hadirCount += 1;
    }
  });
  const denominator = recordedCount || meetingKeys.length;
  return {
    percent: Math.round((hadirCount / denominator) * 100),
    hadirCount,
    totalMeetings: denominator,
  };
}

export function calculateFinalScore(student) {
  const finalNum = Math.round(
    (student.nilaiTugas || 0) * 0.3 +
      (student.nilaiUTS || 0) * 0.35 +
      (student.nilaiUAS || 0) * 0.35
  );
  let grade = 'C';
  if (finalNum >= 85) grade = 'A';
  else if (finalNum >= 80) grade = 'A-';
  else if (finalNum >= 75) grade = 'B+';
  else if (finalNum >= 70) grade = 'B';
  else if (finalNum >= 65) grade = 'B-';
  else if (finalNum >= 55) grade = 'C+';
  return { finalNum, grade };
}

export function getActiveQrSession(matkulId) {
  if (!matkulId) return null;
  try {
    const raw = localStorage.getItem(`${QR_SESSION_KEY_PREFIX}${matkulId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.expiresAt > Date.now()) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function startQrSessionForCourse(matkulId, matkulCode, pertemuan) {
  const pPad = pertemuan < 10 ? `0${pertemuan}` : `${pertemuan}`;
  const randomCode = Math.floor(1000 + Math.random() * 9000);
  const session = {
    matkulId,
    pertemuan: Number(pertemuan),
    token: `${matkulCode || 'MK'}-P${pPad}-QR-${randomCode}`,
    expiresAt: Date.now() + 15 * 60 * 1000, // 15 menit
  };
  try {
    localStorage.setItem(`${QR_SESSION_KEY_PREFIX}${matkulId}`, JSON.stringify(session));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('smartsa_dosen_qr_updated', { detail: { matkulId, session } })
      );
    }
  } catch {
    // ignore
  }
  return session;
}

export function stopQrSessionForCourse(matkulId) {
  if (!matkulId) return;
  try {
    localStorage.removeItem(`${QR_SESSION_KEY_PREFIX}${matkulId}`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('smartsa_dosen_qr_updated', { detail: { matkulId, session: null } })
      );
    }
  } catch {
    // ignore
  }
}
