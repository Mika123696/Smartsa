export const ROLES = {
  STUDENT: 'student',
  LECTURER: 'lecturer',
  ADMIN: 'admin',
};

export const ROLE_LABELS = {
  [ROLES.STUDENT]: 'Mahasiswa',
  [ROLES.LECTURER]: 'Dosen',
  [ROLES.ADMIN]: 'Admin',
};

export const ROLE_BADGE_COLORS = {
  [ROLES.STUDENT]:
    'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/40',
  [ROLES.LECTURER]:
    'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/40',
  [ROLES.ADMIN]:
    'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/40',
};
