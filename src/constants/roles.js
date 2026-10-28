export const ROLES = {
  STUDENT: 'student',
  TEACHER: 'teacher',
  LECTURER: 'lecturer',
  GENERAL: 'general',
  ADMIN: 'admin',
};

export const ROLE_LABELS = {
  [ROLES.STUDENT]: 'Mahasiswa / Siswa',
  [ROLES.TEACHER]: 'Guru',
  [ROLES.LECTURER]: 'Dosen',
  [ROLES.GENERAL]: 'Pengguna Umum',
  [ROLES.ADMIN]: 'Administrator',
};

export const ROLE_BADGE_COLORS = {
  [ROLES.STUDENT]: 'bg-blue-50 text-blue-700 border-blue-200',
  [ROLES.TEACHER]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  [ROLES.LECTURER]: 'bg-purple-50 text-purple-700 border-purple-200',
  [ROLES.GENERAL]: 'bg-amber-50 text-amber-700 border-amber-200',
  [ROLES.ADMIN]: 'bg-rose-50 text-rose-700 border-rose-200',
};

