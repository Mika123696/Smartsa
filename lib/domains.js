/**
 * Shared institutional email domain & account classification helper (ESM).
 *
 * Digunakan lintas endpoint backend (dan dapat dipakai bersama modul klien) untuk:
 * 1. Memetakan domain email institusi secara konsisten & case-insensitive
 *    dengan label boundary ketat (`domain === base` atau `domain.endsWith('.' + base)`).
 * 2. Menetapkan tipe akun (`MAHASISWA`, `DOSEN`, `UMUM`) serta status `autoApprove`.
 * 3. Menangani input kosong, tipe non-string, spasi ekstra, dan format email tidak valid
 *    secara aman tanpa melempar uncaught exception.
 */

export const ACCOUNT_TYPES = Object.freeze({
  MAHASISWA: 'MAHASISWA',
  DOSEN: 'DOSEN',
  UMUM: 'UMUM',
});

export const LECTURER_DOMAINS = Object.freeze([
  'dosen.kampus.ac.id',
  'dosen.farlean.edu',
  'dosen.smartsa.edu',
]);

export const STUDENT_DOMAINS = Object.freeze([
  'kampus.ac.id',
  'farlean.edu',
  'smartsa.edu',
]);

const DOMAIN_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Memeriksa kecocokan domain terhadap baseDomain dengan batas label ketat
 * sehingga `evilkampus.ac.id` tidak pernah cocok dengan `kampus.ac.id`.
 *
 * @param {string} domain
 * @param {string} baseDomain
 * @returns {boolean}
 */
export function matchesDomainBoundary(domain, baseDomain) {
  if (typeof domain !== 'string' || typeof baseDomain !== 'string') {
    return false;
  }
  const cleanDomain = domain.trim().toLowerCase();
  const cleanBase = baseDomain.trim().toLowerCase();
  if (!cleanDomain || !cleanBase) {
    return false;
  }
  return cleanDomain === cleanBase || cleanDomain.endsWith(`.${cleanBase}`);
}

/**
 * Memvalidasi dan menormalisasi alamat email secara defensif tanpa melempar error.
 *
 * @param {unknown} rawEmail
 * @returns {{ valid: boolean, email: string, localPart: string, domain: string }}
 */
export function parseEmailAddress(rawEmail) {
  if (typeof rawEmail !== 'string') {
    return { valid: false, email: '', localPart: '', domain: '' };
  }

  const email = rawEmail.trim().toLowerCase();
  if (!email || email.length > 320 || /\s/.test(email)) {
    return { valid: false, email: '', localPart: '', domain: '' };
  }

  const parts = email.split('@');
  if (parts.length !== 2) {
    return { valid: false, email: '', localPart: '', domain: '' };
  }

  const [localPart, domain] = parts;
  if (!localPart || localPart.length > 64 || !domain || domain.length > 253) {
    return { valid: false, email: '', localPart: '', domain: '' };
  }

  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return { valid: false, email: '', localPart: '', domain: '' };
  }

  if (!DOMAIN_PATTERN.test(domain)) {
    return { valid: false, email: '', localPart: '', domain: '' };
  }

  return { valid: true, email, localPart, domain };
}

/**
 * Memetakan email terhadap domain institusi tanpa memperhitungkan status verifikasi email.
 * Cek domain dosen dilakukan lebih dahulu sebelum domain induk (`dosen.kampus.ac.id` -> `DOSEN`
 * sebelum `kampus.ac.id` -> `MAHASISWA`).
 *
 * @param {unknown} rawEmail
 */
export function resolveEmailDomain(rawEmail) {
  const parsed = parseEmailAddress(rawEmail);
  if (!parsed.valid) {
    return {
      valid: false,
      email: '',
      localPart: '',
      domain: '',
      accountType: ACCOUNT_TYPES.UMUM,
      role: 'student',
      autoApprove: false,
      isInstitutional: false,
    };
  }

  const { email, localPart, domain } = parsed;

  if (domain === 'smartsa.edu') {
    if (/^admin(?:\.[^@]+)?$/.test(localPart)) {
      return {
        valid: true,
        email,
        localPart,
        domain,
        accountType: ACCOUNT_TYPES.DOSEN,
        role: 'admin',
        autoApprove: true,
        isInstitutional: true,
      };
    }
    if (/^dosen(?:\.[^@]+)?$/.test(localPart)) {
      return {
        valid: true,
        email,
        localPart,
        domain,
        accountType: ACCOUNT_TYPES.DOSEN,
        role: 'lecturer',
        autoApprove: true,
        isInstitutional: true,
      };
    }
    return {
      valid: true,
      email,
      localPart,
      domain,
      accountType: ACCOUNT_TYPES.MAHASISWA,
      role: 'student',
      autoApprove: true,
      isInstitutional: true,
    };
  }

  if (LECTURER_DOMAINS.some((base) => matchesDomainBoundary(domain, base))) {
    return {
      valid: true,
      email,
      localPart,
      domain,
      accountType: ACCOUNT_TYPES.DOSEN,
      role: 'lecturer',
      autoApprove: true,
      isInstitutional: true,
    };
  }

  if (STUDENT_DOMAINS.some((base) => matchesDomainBoundary(domain, base))) {
    return {
      valid: true,
      email,
      localPart,
      domain,
      accountType: ACCOUNT_TYPES.MAHASISWA,
      role: 'student',
      autoApprove: true,
      isInstitutional: true,
    };
  }

  return {
    valid: true,
    email,
    localPart,
    domain,
    accountType: ACCOUNT_TYPES.UMUM,
    role: 'student',
    autoApprove: false,
    isInstitutional: false,
  };
}

/**
 * Mengklasifikasikan akun berdasarkan email dengan dukungan status verifikasi email.
 * Bila `requireVerified: true` dan `emailVerified` bernilai falsy, tipe akun efektif tetap `UMUM`
 * dengan `autoApprove: false` hingga email terverifikasi.
 *
 * @param {unknown} rawEmail
 * @param {{ emailVerified?: boolean, requireVerified?: boolean }} [options]
 */
export function classifyAccountByEmail(rawEmail, options = {}) {
  const { emailVerified = true, requireVerified = false } =
    options && typeof options === 'object' ? options : {};

  const resolved = resolveEmailDomain(rawEmail);
  const verified = Boolean(emailVerified);

  if (!resolved.valid) {
    return {
      ...resolved,
      domainAccountType: ACCOUNT_TYPES.UMUM,
      emailVerified: verified,
    };
  }

  if (requireVerified && !verified) {
    return {
      ...resolved,
      domainAccountType: resolved.accountType,
      accountType: ACCOUNT_TYPES.UMUM,
      role: 'student',
      autoApprove: false,
      emailVerified: false,
    };
  }

  return {
    ...resolved,
    domainAccountType: resolved.accountType,
    emailVerified: verified,
  };
}

/**
 * Mengembalikan tipe akun (`MAHASISWA`, `DOSEN`, atau `UMUM`).
 *
 * @param {unknown} rawEmail
 * @param {{ emailVerified?: boolean, requireVerified?: boolean }} [options]
 * @returns {'MAHASISWA' | 'DOSEN' | 'UMUM'}
 */
export function getAccountTypeFromEmail(rawEmail, options = {}) {
  return classifyAccountByEmail(rawEmail, options).accountType;
}

/**
 * Mengembalikan `true` bila email valid, berasal dari domain institusi terdaftar,
 * dan memenuhi syarat auto-approval.
 *
 * @param {unknown} rawEmail
 * @param {{ emailVerified?: boolean, requireVerified?: boolean }} [options]
 * @returns {boolean}
 */
export function isAutoApprovedDomain(rawEmail, options = {}) {
  return classifyAccountByEmail(rawEmail, options).autoApprove;
}
